# app/services/websocket_flow.py

from __future__ import annotations

import asyncio
import time
from typing import Dict, List, Tuple

import httpx
from fastapi import WebSocket
from loguru import logger
from pydantic import ValidationError

from app.api import get_providers
from app.api.schemas import WsCompareAddressRequest, WsMessage
from app.core import Settings
from app.models import Offer
from app.models.base.address import Address
from app.models.validators.address_validator import AddressValidator
from app.providers import ServusSpeedProvider
from app.providers.base import ProviderBase
from app.services import cache_set
from app.utils import shared_client, merge_offers, encode

PHASE_1_TIMEOUT = 10.0


async def _ensure_domain_validity(
    websocket: WebSocket,
    address: Address,
) -> bool:
    """
    Run enhanced domain-level address validation.

    If AddressValidator finds any issues, formats them into a list of strings,
    sends a single ERROR message with all issues, closes the websocket, and returns False.

    Returns:
        True  – no domain validation issues, caller may proceed.
        False – issues found, error sent, connection closed.
    """
    issues_dict: Dict[str, str] = AddressValidator.validate_address(address)
    if not issues_dict:
        return True

    # Convert to list[str], including field names for context
    issues_list: List[str] = [f"{field}: {msg}" for field, msg in issues_dict.items()]

    logger.warning("[ws] Address failed domain validation: {}", issues_list)
    await websocket.send_json(
        WsMessage(
            type="ERROR",
            message="Address failed validation.",
            validation_issues=issues_list,
        ).model_dump(exclude_none=True)
    )
    await websocket.close(code=1003)
    return False


async def execute_provider_fetch(
    provider: ProviderBase,
    address: Address,
    client: httpx.AsyncClient,
) -> Tuple[str, List[Offer], bool]:
    """
    Execute a provider’s fetch logic and capture its result.

    Returns:
        (provider.name, offers, success_flag)
    """
    provider.client = client
    try:
        logger.debug(f"[provider] → {provider.name}")
        offers = await provider(address)
        logger.info(f"[provider] ✓ {provider.name} returned {len(offers)} offers")
        return provider.name, offers, True
    except Exception as exc:
        logger.error(f"[provider] ✗ {provider.name} failed: {exc!r}")
        return provider.name, [], False


async def websocket_comparison_flow(
    websocket: WebSocket,
    payload: dict,
    settings: Settings,
) -> None:
    """
    Run the two-phase comparison flow over a WebSocket connection.

    Streams INITIAL_OFFERS then FINAL_OFFERS messages, handling errors and caching.
    """
    # Step 0: parse & basic schema validation
    try:
        address = WsCompareAddressRequest(**payload)
    except ValidationError as e:
        await websocket.send_json(
            WsMessage(
                type="ERROR", message=f"Invalid address: {e.errors()}"
            ).model_dump()
        )
        await websocket.close(code=1003)
        return

    # Step 1: enhanced domain validation
    if not await _ensure_domain_validity(websocket, address):
        return

    # Step 2: fetch provider list
    providers = await get_providers(
        address.providers,
        wants_fiber=address.wants_fiber,
    )
    if not providers:
        await websocket.send_json(
            WsMessage(type="ERROR", message="No providers available.").model_dump()
        )
        await websocket.close()
        return

    fast_providers = [p for p in providers if not isinstance(p, ServusSpeedProvider)]
    servus = next((p for p in providers if isinstance(p, ServusSpeedProvider)), None)

    # Servus-only shortcut
    if servus and not fast_providers:
        await _send_final_for_servus_only(websocket, servus, address, settings)
        return

    # Phase 1: launch all fast providers (and servus in background)
    servus_task = (
        asyncio.create_task(execute_provider_fetch(servus, address, shared_client))
        if servus
        else None
    )
    phase1_tasks = {
        p.name: asyncio.create_task(execute_provider_fetch(p, address, shared_client))
        for p in fast_providers
    }
    done, pending = await asyncio.wait(
        phase1_tasks.values(),
        timeout=PHASE_1_TIMEOUT,
        return_when=asyncio.ALL_COMPLETED,
    )

    # Collect Phase 1 results
    offers_phase1: Dict[str, List[Offer]] = {}
    for name, task in phase1_tasks.items():
        if task in done:
            pname: str
            poffers: List[Offer]
            ok: bool
            pname, poffers, ok = task.result()
            if ok:
                offers_phase1[pname] = poffers
    if servus_task and servus_task.done():
        pname: str
        poffers: List[Offer]
        ok: bool
        pname, poffers, ok = servus_task.result()
        if ok:
            offers_phase1[pname] = poffers

    # Merge, slug, cache, and send INITIAL_OFFERS
    merged_initial = merge_offers([o for subs in offers_phase1.values() for o in subs])
    slug_initial = None
    if merged_initial:
        slug_initial = encode(
            {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "initial"}
        )
        asyncio.create_task(
            cache_set(slug_initial, merged_initial, settings.cache_ttl_seconds)
        )
    will_refine = bool(pending or (servus_task and not servus_task.done()))
    await websocket.send_json(
        WsMessage(
            type="INITIAL_OFFERS",
            offers=merged_initial,
            slug=slug_initial,
            is_complete=False,
            will_refine=will_refine,
        ).model_dump(exclude_none=True)
    )

    # Phase 2: finish any pending tasks (including servus)
    phase2_tasks: List[asyncio.Task] = list(pending)
    if servus_task and not servus_task.done():
        phase2_tasks.append(servus_task)

    final_offers_map = {**offers_phase1}
    if phase2_tasks:
        results = await asyncio.gather(*phase2_tasks, return_exceptions=True)
        for res in results:
            # res is either Exception or (provider_name, offers, ok)
            if isinstance(res, Exception):
                logger.error(f"[ws] provider task failed in Phase 2: {res!r}")
                continue
            pname: str
            poffers: List[Offer]
            ok: bool
            pname, poffers, ok = res
            if ok:
                final_offers_map[pname] = poffers

    # Merge, slug, cache, and send FINAL_OFFERS
    merged_final = merge_offers([o for subs in final_offers_map.values() for o in subs])
    slug_final = None
    if merged_final:
        slug_final = encode(
            {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "final"}
        )
        asyncio.create_task(
            cache_set(slug_final, merged_final, settings.cache_ttl_seconds)
        )

    await websocket.send_json(
        WsMessage(
            type="FINAL_OFFERS",
            offers=merged_final,
            slug=slug_final,
            is_complete=True,
            will_refine=False,
        ).model_dump(exclude_none=True)
    )


async def _send_final_for_servus_only(
    websocket: WebSocket,
    servus: ServusSpeedProvider,
    address: Address,
    settings: Settings,
) -> None:
    """
    Handle the scenario where only a ServusSpeedProvider is used.

    Fetches offers, merges them, caches, and sends a single FINAL_OFFERS message.
    """
    _ignored: str
    offers: List[Offer]
    ok: bool
    _, offers, ok = await execute_provider_fetch(servus, address, shared_client)
    merged = merge_offers(offers) if ok else []
    slug = None
    if merged:
        slug = encode(
            {"addr": address.model_dump(), "ts": time.monotonic(), "phase": "final"}
        )
        await cache_set(slug, merged, settings.cache_ttl_seconds)

    await websocket.send_json(
        WsMessage(
            type="FINAL_OFFERS",
            offers=merged,
            slug=slug,
            is_complete=True,
            will_refine=False,
        ).model_dump(exclude_none=True)
    )
