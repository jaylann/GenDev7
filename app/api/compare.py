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
from pydantic import BaseModel, ValidationError, Field

from app.api.dependencies import get_providers
from app.core.config import Settings, get_settings
from app.models import Offer, Address # Ensure Offer model has product_id
from app.providers.base import ProviderBase
from app.providers.servusspeed import ServusSpeedProvider
from app.services.merge import merge_offers
from app.utils.logger import logger
from app.utils.slug import encode, decode

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
    providers: Optional[List[str]] = None
    wants_fiber: Optional[bool] = False


class WebSocketMessage(BaseModel):
    type: str
    offers: Optional[List[Offer]] = None
    slug: Optional[str] = None
    message: Optional[str] = None
    provider_name: Optional[str] = None
    is_complete: Optional[bool] = None


class CompareResponse(BaseModel):
    slug: str
    offers: List[Offer]
    address: Optional[Address] = None


# --- New Pydantic Models for Single Offer Sharing ---
class SingleOfferShareRequest(BaseModel):
    original_page_slug: str = Field(..., description="The slug of the page containing the full list of offers.")
    offer_key: str = Field(..., description="A unique key identifying the offer, e.g., 'ProviderName:ProductID'.")

class SingleOfferShareResponse(BaseModel):
    shared_slug: str = Field(..., description="The new slug that directly points to the single shared offer.")


# --- Helper for individual provider calls ---
PROVIDER_EXECUTION_BUDGET_SECONDS = 90.0 # This seems unused in the provided snippet, but keeping it.


async def _execute_provider_fetch(
        provider: ProviderBase, address: Address, client: httpx.AsyncClient
) -> Tuple[str, List[Offer], bool]:
    """
    Runs the full Tenacity‐wrapped provider call, unbounded except by the provider's own retry_config.
    """
    provider.client = client
    try:
        logger.debug(f"Starting full retry loop for provider: {provider.name}")
        offers = await provider(address)
        logger.info(f"Provider {provider.name} succeeded with {len(offers)} offers")
        return provider.name, offers, True
    except Exception as exc:
        logger.error(
            f"Provider {provider.name} ultimately failed after retries: {exc!r}"
        )
        return provider.name, [], False


# --- WebSocket Endpoint ---
@router.websocket("/ws/compare")
async def compare_websocket(websocket: WebSocket):
    await websocket.accept()
    settings: Settings = get_settings() # Renamed for clarity

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

    all_provider_instances = await get_providers(address.providers, wants_fiber=address.wants_fiber)
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

    if servus_provider_instance and not fast_providers:
        name, offers, success = await _execute_provider_fetch(
            servus_provider_instance, address, _shared_client
        )
        merged = merge_offers(offers) if success else []
        slug = None
        if merged:
            slug = encode(
                {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "final"}
            )
            asyncio.create_task(
                _cache_set(
                    slug, merged, settings.cache_ttl_seconds # use renamed settings
                )
            )
        await websocket.send_json(
            WebSocketMessage(
                type="FINAL_OFFERS",
                offers=merged,
                slug=slug,
                is_complete=True
            ).model_dump(exclude_none=True)
        )
        return

    PHASE_1_TIMEOUT = 15.0
    phase1_tasks: Dict[str, Tuple[ProviderBase, asyncio.Task]] = {
        p.name: (
            p,
            asyncio.create_task(_execute_provider_fetch(p, address, _shared_client)),
        )
        for p in fast_providers
    }

    done, pending = await asyncio.wait(
        [t for _, t in phase1_tasks.values()],
        timeout=PHASE_1_TIMEOUT,
        return_when=asyncio.ALL_COMPLETED,
    )

    collected_offers_phase1: Dict[str, List[Offer]] = {}
    for name, (prov, task) in phase1_tasks.items():
        if task in done:
            try:
                p_name, p_offers, p_success = task.result()
                if p_success:
                    collected_offers_phase1[p_name] = p_offers
            except Exception as e: # Catch exceptions from tasks themselves
                logger.error(f"Task for provider {prov.name} in Phase 1 failed: {e!r}")


    pending_providers = [
        prov for name, (prov, task) in phase1_tasks.items() if task in pending
    ]

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
                slug_initial, merged_initial, settings.cache_ttl_seconds # use renamed settings
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

    phase2_tasks: List[asyncio.Task] = []
    for prov in pending_providers:
        _, task = phase1_tasks[prov.name]
        phase2_tasks.append(task)

    if servus_provider_instance:
        phase2_tasks.append(
            asyncio.create_task(
                _execute_provider_fetch(
                    servus_provider_instance, address, _shared_client
                )
            )
        )

    final_offers_map = {**collected_offers_phase1}
    if phase2_tasks: # Only gather if there are tasks for phase 2
        results2 = await asyncio.gather(*phase2_tasks, return_exceptions=True) # Allow individual failures

        for result_item in results2:
            if isinstance(result_item, Exception):
                logger.error(f"A provider task in Phase 2 failed: {result_item!r}")
                continue
            # Assuming result_item is (name, offers, success)
            name, offers, success = result_item
            if success:
                final_offers_map[name] = offers

    merged_final = merge_offers([o for sub in final_offers_map.values() for o in sub])
    slug_final = None
    if merged_final:
        slug_final = encode(
            {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "final"}
        )
        asyncio.create_task(
            _cache_set(slug_final, merged_final, settings.cache_ttl_seconds) # use renamed settings
        )

    await websocket.send_json(
        WebSocketMessage(
            type="FINAL_OFFERS", offers=merged_final, slug=slug_final, is_complete=True
        ).model_dump(exclude_none=True)
    )


@router.get("/compare/{slug}", response_model=CompareResponse)
async def compare_by_slug(slug: str):
    logger.info(f"HTTP /compare/{slug} called")

    decoded_slug_data = decode(slug)
    if not decoded_slug_data:
        logger.warning(f"Invalid or unparsable slug: {slug}")
        raise HTTPException(status_code=400, detail="Invalid slug format.")

    is_single_offer_slug = "offer_key" in decoded_slug_data

    offers = _cache_get(slug)
    if offers is None:
        logger.warning(f"Cache miss for slug: {slug} (single_offer_slug: {is_single_offer_slug})")
        # Potentially, if it's a single offer slug and missed, one could try to reconstruct it
        # from an original_page_slug if that was also encoded. But for now, simple miss is 404.
        raise HTTPException(
            status_code=404, detail="Comparison data expired or slug unknown."
        )

    logger.info(f"Cache hit for slug: {slug}, returning {len(offers)} offers (single_offer_slug: {is_single_offer_slug})")

    # The address in the slug should always be the primary address of the search
    address_data_from_slug = decoded_slug_data.get("addr")
    if not address_data_from_slug:
        logger.error(f"Slug {slug} is missing address information after decoding.")
        # This case should ideally not happen if slugs are generated correctly.
        # Fallback or error based on requirements. For now, proceed if offers found.
        # Consider raising HTTPException if address is strictly needed for all responses.
        api_address = None
    else:
        try:
            api_address = Address(**address_data_from_slug)
        except ValidationError as e:
            logger.error(f"Failed to parse address from slug {slug}: {e}")
            api_address = None # Or handle as an error

    return CompareResponse(slug=slug, offers=offers, address=api_address)


@router.post("/offers/share-link", response_model=SingleOfferShareResponse)
async def generate_single_offer_share_link(
        request_data: SingleOfferShareRequest,
        settings: Settings = Depends(get_settings),
):
    """
    Generates a unique, shareable slug for a single offer.
    """
    logger.info(f"Request to share single offer: original_slug={request_data.original_page_slug}, offer_key={request_data.offer_key}")

    original_offers = _cache_get(request_data.original_page_slug)
    if not original_offers:
        logger.warning(f"Original page slug {request_data.original_page_slug} not found in cache or expired.")
        raise HTTPException(status_code=404, detail="Original offer list not found or expired. Please search again.")

    decoded_original_slug = decode(request_data.original_page_slug)
    if not decoded_original_slug or "addr" not in decoded_original_slug:
        logger.error(f"Original page slug {request_data.original_page_slug} is invalid or missing address data.")
        raise HTTPException(status_code=400, detail="Invalid original slug.")

    address_data = decoded_original_slug["addr"]

    found_offer: Optional[Offer] = None
    try:
        provider_name, product_id_str = request_data.offer_key.split(":", 1)
    except ValueError:
        logger.error(f"Invalid offer_key format: {request_data.offer_key}. Expected 'provider:product_id'.")
        raise HTTPException(status_code=400, detail="Invalid offer key format.")

    for offer in original_offers:
        # Ensure product_id is string for comparison, as it might be int/str in source data.
        # The Offer model should ideally enforce product_id as string.
        if offer.provider == provider_name and str(offer.product_id) == product_id_str:
            found_offer = offer
            break

    if not found_offer:
        logger.warning(f"Offer with key {request_data.offer_key} not found in list from {request_data.original_page_slug}.")
        raise HTTPException(status_code=404, detail="Specified offer not found in the original list.")

    # Create a new slug for this single offer
    # It includes the address (for context on the page) and the offer_key.
    shared_offer_slug_payload = {
        "addr": address_data,
        "ts": time.monotonic(),
        "offer_key": request_data.offer_key, # Identifies it as a single-offer slug
        # Optionally, include original_page_slug for potential re-hydration, but adds complexity
        # "original_slug": request_data.original_page_slug
    }
    shared_slug_str = encode(shared_offer_slug_payload)

    # Cache this single offer (as a list with one item) under the new slug
    await _cache_set(shared_slug_str, [found_offer], settings.cache_ttl_seconds)

    logger.info(f"Generated shared_slug: {shared_slug_str} for offer_key: {request_data.offer_key}")
    return SingleOfferShareResponse(shared_slug=shared_slug_str)