import asyncio
import time
from typing import List, Optional, Dict, Tuple, Any

import httpx
from fastapi import (APIRouter, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect)
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
_limits = httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=30.0)
_shared_client = httpx.AsyncClient(headers={"User-Agent": "CHECK24ChallengeApp/1.0"}, limits=_limits,
    timeout=httpx.Timeout(65.0), http2=False, )
_cache: Dict[str, Tuple[float, List[Offer]]] = {}  # slug -> (expires_ts, List[Offer])


async def _cache_set(slug: str, offers: List[Offer], ttl_seconds: int) -> None:
    """Sets offers in the cache with a given TTL."""
    _cache[slug] = (time.monotonic() + ttl_seconds, offers)
    logger.debug(f"Cache set for slug: {slug} with {len(offers)} offers, TTL: {ttl_seconds}s")


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


async def _execute_provider_fetch(provider: ProviderBase, address: Address, client: httpx.AsyncClient) -> Tuple[
    str, List[Offer], bool]:
    provider.client = client
    success = False
    offers_list: List[Offer] = []
    try:
        logger.debug(f"Executing fetch for provider: {provider.name}")
        offers_list = await asyncio.wait_for(provider.fetch(address), timeout=PROVIDER_EXECUTION_BUDGET_SECONDS)
        logger.info(f"Provider {provider.name} returned {len(offers_list)} offers.")
        success = True
    except asyncio.TimeoutError:
        logger.warning(f"Provider {provider.name} timed out after {PROVIDER_EXECUTION_BUDGET_SECONDS}s.")
    except Exception as e:
        logger.exception(f"Provider {provider.name} failed: {repr(e)}")
    return provider.name, offers_list, success


# --- New WebSocket Endpoint ---
@router.websocket("/ws/compare")
async def compare_websocket(websocket: WebSocket):
    await websocket.accept()
    settings_dependency = get_settings()

    try:
        address_payload = await websocket.receive_json()
        address = WsCompareAddressRequest(**address_payload)
        logger.info(f"WebSocket: Accepted. Address: {address.model_dump_json(indent=2)}")
    except ValidationError as e:
        logger.error(f"WebSocket: Invalid address: {address_payload}. Error: {e}")
        await websocket.send_json(WebSocketMessage(type="ERROR", message=f"Invalid address: {e.errors()}").model_dump())
        await websocket.close(code=1003)
        return
    except WebSocketDisconnect:
        logger.info("WebSocket: Client disconnected before address.")
        return
    except Exception as e:
        logger.exception(f"WebSocket: Error receiving address: {e}")
        await websocket.send_json(WebSocketMessage(type="ERROR", message="Error processing request.").model_dump())
        await websocket.close(code=1008)
        return

    all_provider_instances = await get_providers()
    if not all_provider_instances:
        logger.warning("WebSocket: No providers. Sending error.")
        await websocket.send_json(WebSocketMessage(type="ERROR", message="No providers available.").model_dump())
        await websocket.close()
        return

    fast_providers: List[ProviderBase] = []
    servus_provider_instance: Optional[ServusSpeedProvider] = None
    for p in all_provider_instances:
        if isinstance(p, ServusSpeedProvider):
            servus_provider_instance = p
        else:
            fast_providers.append(p)

    # --- Phase 1: Initial "Speed" Results ---
    PHASE_1_TIMEOUT_SECONDS = 15.0
    collected_offers_phase1: Dict[str, List[Offer]] = {}
    providers_for_phase2_retry: List[ProviderBase] = []
    slug_initial: Optional[str] = None  # Initialize slug for initial offers

    if fast_providers:
        logger.info(
            f"WebSocket: Phase 1 for {len(fast_providers)} fast providers (timeout: {PHASE_1_TIMEOUT_SECONDS}s).")
        phase1_tasks = [asyncio.create_task(_execute_provider_fetch(p, address, _shared_client)) for p in
            fast_providers]
        done_in_phase1, pending_in_phase1 = await asyncio.wait(phase1_tasks, timeout=PHASE_1_TIMEOUT_SECONDS,
            return_when=asyncio.ALL_COMPLETED)

        for task in done_in_phase1:
            try:
                p_name, p_offers, p_success = task.result()
                if p_success:
                    collected_offers_phase1[p_name] = p_offers
                else:
                    original_provider = next((p for p in fast_providers if p.name == p_name), None)
                    if original_provider: providers_for_phase2_retry.append(original_provider)
            except Exception as e:
                logger.exception(f"WebSocket: Error processing Phase 1 task result: {e}")

        # Rebuild providers_for_phase2_retry for clarity and correctness
        providers_for_phase2_retry.clear()
        succeeded_fast_provider_names_phase1 = set(collected_offers_phase1.keys())
        for p in fast_providers:
            if p.name not in succeeded_fast_provider_names_phase1:
                logger.debug(f"WebSocket: Fast provider {p.name} for Phase 2 retry.")
                providers_for_phase2_retry.append(p)

        for task in pending_in_phase1:  # Cancel tasks that timed out overall
            task.cancel()

        initial_merged_offers_flat: List[Offer] = [o for ol in collected_offers_phase1.values() for o in ol]
        merged_initial_offers = merge_offers(initial_merged_offers_flat)

        if merged_initial_offers:  # Only create and send slug if there are initial offers
            slug_initial_payload = {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "initial"}
            slug_initial = encode(slug_initial_payload)
            asyncio.create_task(_cache_set(slug_initial, merged_initial_offers, settings_dependency.cache_ttl_seconds))
            logger.info(
                f"WebSocket: Phase 1 done. Sending {len(merged_initial_offers)} initial offers. Slug_initial: {slug_initial}")
        else:
            logger.info("WebSocket: Phase 1 done. No initial offers from fast providers.")

        await websocket.send_json(
            WebSocketMessage(type="INITIAL_OFFERS", offers=merged_initial_offers, slug=slug_initial,
                             is_complete=False).model_dump(exclude_none=True))
    else:
        logger.info("WebSocket: No 'fast' providers. Skipping Phase 1.")
        await websocket.send_json(
            WebSocketMessage(type="STATUS_UPDATE", message="No fast providers for initial results.", slug=None,
                             is_complete=False).model_dump(exclude_none=True))

    # --- Phase 2: Comprehensive "Deep" Results ---
    logger.info(
        f"WebSocket: Phase 2. ServusSpeed: {'Yes' if servus_provider_instance else 'No'}. Retrying {len(providers_for_phase2_retry)} fast providers.")
    phase2_provider_tasks_to_run: List[ProviderBase] = []
    if servus_provider_instance: phase2_provider_tasks_to_run.append(servus_provider_instance)
    phase2_provider_tasks_to_run.extend(providers_for_phase2_retry)

    final_collected_offers: Dict[str, List[Offer]] = dict(collected_offers_phase1)

    if phase2_provider_tasks_to_run:
        phase2_tasks = [asyncio.create_task(_execute_provider_fetch(p, address, _shared_client)) for p in
            phase2_provider_tasks_to_run]
        results_phase2 = await asyncio.gather(*phase2_tasks, return_exceptions=False)
        for p_name, p_offers, p_success in results_phase2:
            if p_success:  # Only update/add if Phase 2 was successful for this provider
                final_collected_offers[p_name] = p_offers

    final_merged_offers_flat: List[Offer] = [o for ol in final_collected_offers.values() for o in ol]
    merged_final_offers = merge_offers(final_merged_offers_flat)

    # Generate slug for final offers, potentially overwriting initial if no new data
    slug_final_payload = {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "final"}
    slug_final = encode(slug_final_payload)

    # Cache the final results. If merged_final_offers is empty, still cache it with the slug.
    asyncio.create_task(_cache_set(slug_final, merged_final_offers, settings_dependency.cache_ttl_seconds))

    logger.info(f"WebSocket: Phase 2 done. Sending {len(merged_final_offers)} final offers. Slug_final: {slug_final}")
    await websocket.send_json(
        WebSocketMessage(type="FINAL_OFFERS", offers=merged_final_offers, slug=slug_final, is_complete=True).model_dump(
            exclude_none=True))
    logger.debug("WebSocket: All data sent.")


# --- Deprecated HTTP Endpoint (for reference or gradual phase-out) ---
@router.post("/compare", response_model=CompareResponse, deprecated=True, summary="Use WebSocket /ws/compare instead")
async def compare_fresh_http(address_payload: Dict[str, Any], background: BackgroundTasks,
        settings: Settings = Depends(get_settings), ):
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

    tasks = [_execute_provider_fetch(p, address, _shared_client) for p in all_provider_instances]
    results_http = await asyncio.gather(*tasks, return_exceptions=False)

    offers_flat: List[Offer] = [o for _p_name, p_offers, p_success in results_http if p_success for o in p_offers]
    merged = merge_offers(offers_flat)

    slug_payload = {"addr": address.model_dump(), "ts": time.monotonic(),
                    "phase": "http_deprecated"}  # Differentiate slug
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
        raise HTTPException(status_code=404, detail="Comparison data expired or slug unknown.")
    logger.info(f"Cache hit for slug: {slug}, returning {len(offers)} offers")
    decoded_slug = decode(slug)
    address_slug = Address(**decoded_slug["addr"] if "addr" in decoded_slug else {})
    return CompareResponse(slug=slug, offers=offers, address=address_slug)
