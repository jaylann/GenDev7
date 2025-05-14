import asyncio
import time
from typing import List, Optional, Dict, Tuple, Any

import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    BackgroundTasks,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, ValidationError

from app.api.dependencies import get_providers
from app.core.config import Settings, get_settings
from app.models import Offer, Address
from app.providers.base import ProviderBase
from app.providers.servusspeed import ServusSpeedProvider  # To identify it specifically
from app.services.merge import merge_offers
from app.utils.logger import logger
from app.utils.slug import encode, decode

# Assuming get_all_provider_instances is correctly placed (e.g., in app.providers)

router = APIRouter()

# --- Shared HTTP Client and Cache ---
_limits = httpx.Limits(
    max_connections=20, max_keepalive_connections=10, keepalive_expiry=30.0
)
_shared_client = httpx.AsyncClient(
    headers={"User-Agent": "CHECK24ChallengeApp/1.0"},
    limits=_limits,
    timeout=httpx.Timeout(65.0),
    http2=False,
)
_cache: Dict[str, Tuple[float, List[Offer]]] = {}  # slug -> (expires_ts, List[Offer])


async def _cache_set(slug: str, offers: List[Offer], ttl_seconds: int) -> None:
    """Sets offers in the cache with a given TTL."""
    _cache[slug] = (time.monotonic() + ttl_seconds, offers)
    logger.debug(
        f"Cache set for slug: {slug} with {len(offers)} offers, TTL: {ttl_seconds}s"
    )


def _cache_get(slug: str) -> Optional[List[Offer]]:
    """Retrieves offers from the cache if not expired."""
    item = _cache.get(slug)
    if not item:
        return None
    expires_at, offers = item
    if expires_at < time.monotonic():
        logger.info(f"Cache expired for slug: {slug}")
        _cache.pop(slug, None)
        return None
    logger.debug(f"Cache hit for slug: {slug}")
    return offers


# --- Pydantic Models for API and WebSocket ---
class WsCompareAddressRequest(Address):
    pass


class WebSocketMessage(BaseModel):
    type: str
    offers: Optional[List[Offer]] = None
    slug: Optional[str] = None  # Now used for both INITIAL and FINAL
    message: Optional[str] = None
    provider_name: Optional[str] = None
    is_complete: Optional[bool] = None


class CompareResponse(BaseModel):
    slug: str
    offers: List[Offer]
    address: Optional[Address] = None  # Only for HTTP /compare/{slug} endpoint


# --- Helper for individual provider calls ---
PROVIDER_EXECUTION_BUDGET_SECONDS = 90.0


async def _execute_provider_fetch(
    provider: ProviderBase, address: Address, client: httpx.AsyncClient
) -> Tuple[str, List[Offer], bool]:
    """
    Runs the full Tenacity‐wrapped provider call, unbounded except by the provider's own retry_config.
    """
    provider.client = client
    try:
        logger.debug(f"Starting full retry loop for provider: {provider.name}")
        offers = await provider(
            address
        )  # <-- invokes ProviderBase.__call__ (with retry)
        logger.info(f"Provider {provider.name} succeeded with {len(offers)} offers")
        return provider.name, offers, True
    except Exception as exc:
        logger.error(
            f"Provider {provider.name} ultimately failed after retries: {exc!r}"
        )
        return provider.name, [], False


# --- New WebSocket Endpoint ---
@router.websocket("/ws/compare")
async def compare_websocket(websocket: WebSocket):
    await websocket.accept()
    settings_dependency = get_settings()

    try:
        address_payload = await websocket.receive_json()
        address = WsCompareAddressRequest(**address_payload)
        logger.info(
            f"WebSocket: Accepted. Address: {address.model_dump_json(indent=2)}"
        )
    except ValidationError as e:
        logger.error(f"WebSocket: Invalid address: {address_payload}. Error: {e}")
        await websocket.send_json(
            WebSocketMessage(
                type="ERROR", message=f"Invalid address: {e.errors()}"
            ).model_dump()
        )
        await websocket.close(code=1003)
        return
    except WebSocketDisconnect:
        logger.info("WebSocket: Client disconnected before address.")
        return
    except Exception as e:
        logger.exception(f"WebSocket: Error receiving address: {e}")
        await websocket.send_json(
            WebSocketMessage(
                type="ERROR", message="Error processing request."
            ).model_dump()
        )
        await websocket.close(code=1008)
        return

    all_provider_instances = await get_providers()
    if not all_provider_instances:
        logger.warning("WebSocket: No providers. Sending error.")
        await websocket.send_json(
            WebSocketMessage(
                type="ERROR", message="No providers available."
            ).model_dump()
        )
        await websocket.close()
        return

    fast_providers: List[ProviderBase] = []
    servus_provider_instance: Optional[ServusSpeedProvider] = None
    for p in all_provider_instances:
        if isinstance(p, ServusSpeedProvider):
            servus_provider_instance = p
        else:
            fast_providers.append(p)

    # Phase 1: kickoff all fast providers under their own retry & bound by 15 s
    PHASE_1_TIMEOUT = 15.0
    # map name→(provider, task)
    phase1_tasks: Dict[str, Tuple[ProviderBase, asyncio.Task]] = {
        p.name: (
            p,
            asyncio.create_task(_execute_provider_fetch(p, address, _shared_client)),
        )
        for p in fast_providers
    }

    # wait up to PHASE_1_TIMEOUT for them to finish
    done, pending = await asyncio.wait(
        [t for _, t in phase1_tasks.values()],
        timeout=PHASE_1_TIMEOUT,
        return_when=asyncio.ALL_COMPLETED,
    )

    # build initial results from done tasks
    collected_offers_phase1: Dict[str, List[Offer]] = {}
    for name, (prov, task) in phase1_tasks.items():
        if task in done:
            _, offers, success = task.result()
            if success:
                collected_offers_phase1[name] = offers

    # providers still “in flight” after 15 s
    pending_providers = [
        prov for name, (prov, task) in phase1_tasks.items() if task in pending
    ]

    # send INITIAL_OFFERS
    merged_initial = merge_offers(
        [o for sub in collected_offers_phase1.values() for o in sub]
    )
    slug_initial = None
    if merged_initial:
        slug_initial = encode(
            {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "initial"}
        )
        asyncio.create_task(
            _cache_set(
                slug_initial, merged_initial, settings_dependency.cache_ttl_seconds
            )
        )
    await websocket.send_json(
        WebSocketMessage(
            type="INITIAL_OFFERS",
            offers=merged_initial,
            slug=slug_initial,
            is_complete=False,
        ).model_dump(exclude_none=True)
    )

    # Phase 2: wait for remaining Phase 1 providers + Servus
    phase2_tasks: List[asyncio.Task] = []

    # gather the pending ones
    for prov in pending_providers:
        _, task = phase1_tasks[prov.name]
        phase2_tasks.append(task)

    # also run Servus (if any)
    if servus_provider_instance:
        phase2_tasks.append(
            asyncio.create_task(
                _execute_provider_fetch(
                    servus_provider_instance, address, _shared_client
                )
            )
        )

    # now wait on all of them
    results2 = await asyncio.gather(*phase2_tasks, return_exceptions=False)

    # merge into final collection
    final_offers_map = {**collected_offers_phase1}
    for name, offers, success in results2:
        if success:
            final_offers_map[name] = offers

    merged_final = merge_offers([o for sub in final_offers_map.values() for o in sub])
    slug_final = encode(
        {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "final"}
    )
    asyncio.create_task(
        _cache_set(slug_final, merged_final, settings_dependency.cache_ttl_seconds)
    )

    await websocket.send_json(
        WebSocketMessage(
            type="FINAL_OFFERS", offers=merged_final, slug=slug_final, is_complete=True
        ).model_dump(exclude_none=True)
    )


# --- Deprecated HTTP Endpoint (for reference or gradual phase-out) ---
@router.post(
    "/compare",
    response_model=CompareResponse,
    deprecated=True,
    summary="Use WebSocket /ws/compare instead",
)
async def compare_fresh_http(
    address_payload: Dict[str, Any],
    background: BackgroundTasks,
    settings: Settings = Depends(get_settings),
):
    try:
        address = WsCompareAddressRequest(**address_payload)
    except ValidationError as e:
        logger.error(f"HTTP /compare: Invalid address: {address_payload}. Error: {e}")
        raise HTTPException(status_code=422, detail=e.errors())

    logger.info(f"HTTP /compare (DEPRECATED) for: {address.model_dump_json(indent=2)}")
    all_provider_instances = await get_providers()
    if not all_provider_instances:
        logger.warning("HTTP /compare: No providers.")
        return CompareResponse(slug="no-providers", offers=[], address=address)

    tasks = [
        _execute_provider_fetch(p, address, _shared_client)
        for p in all_provider_instances
    ]
    results_http = await asyncio.gather(*tasks, return_exceptions=False)

    offers_flat: List[Offer] = [
        o
        for _p_name, p_offers, p_success in results_http
        if p_success
        for o in p_offers
    ]
    merged = merge_offers(offers_flat)

    slug_payload = {
        "addr": address.model_dump(),
        "ts": time.monotonic(),
        "phase": "http_deprecated",
    }  # Differentiate slug
    slug = encode(slug_payload)
    logger.debug(f"HTTP /compare: Generated slug: {slug}")
    background.add_task(_cache_set, slug, merged, settings.cache_ttl_seconds)
    return CompareResponse(slug=slug, offers=merged, address=address)


@router.get("/compare/{slug}", response_model=CompareResponse)
async def compare_by_slug(slug: str):
    logger.info(f"HTTP /compare/{slug} called")
    offers = _cache_get(slug)
    if offers is None:
        logger.warning(f"Cache miss for slug: {slug}")
        raise HTTPException(
            status_code=404, detail="Comparison data expired or slug unknown."
        )
    logger.info(f"Cache hit for slug: {slug}, returning {len(offers)} offers")
    decoded_slug = decode(slug)
    address_slug = Address(**decoded_slug["addr"] if "addr" in decoded_slug else {})
    return CompareResponse(slug=slug, offers=offers, address=address_slug)
