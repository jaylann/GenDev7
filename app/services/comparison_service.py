"""
Business logic for comparing network service offers via HTTP and WebSocket.

Provides helper functions to execute provider fetches, manage a two-phase
comparison flow over WebSocket (initial and final offers), and handle
ServusSpeed-only scenarios with caching.
"""

from __future__ import annotations

import asyncio
import time
from typing import Dict, List, Tuple

import httpx
from fastapi import WebSocket
from pydantic import ValidationError

from app.api import get_providers
from app.api.schemas import WsCompareAddressRequest, WsMessage
from app.core import Settings
from app.models import Address, Offer
from app.providers import ServusSpeedProvider
from app.providers.base import ProviderBase
from app.services import cache_set
from app.utils import logger, shared_client, merge_offers, encode


# Helper: run a provider (with its retry config inside ProviderBase
async def execute_provider_fetch(
    provider: ProviderBase,
    address: Address,
    client: httpx.AsyncClient,
) -> Tuple[str, List[Offer], bool]:
    """
    Execute a provider fetch and capture its result.

    Args:
        provider (ProviderBase): The provider instance to call.
        address (Address): The address to look up.
        client (httpx.AsyncClient): HTTP client to use for the request.

    Returns:
        Tuple[str, List[Offer], bool]: Provider name, list of offers, and success flag.
    """
    provider.client = client
    try:
        logger.debug(f"[provider] → {provider.name}")
        offers = await provider(address)
        logger.info(f"[provider] ✓ {provider.name} {len(offers)} offers")
        return provider.name, offers, True
    except Exception as exc:
        logger.error(f"[provider] ✗ {provider.name} {exc!r}")
        return provider.name, [], False


# 2. WebSocket helpers
PHASE_1_TIMEOUT = 15.0


async def websocket_comparison_flow(
    websocket: WebSocket,
    payload: dict,
    settings: Settings,
) -> None:
    """
    Run the two-phase comparison flow over a WebSocket connection.

    Args:
        websocket (WebSocket): The WebSocket to send messages on.
        payload (dict): The incoming comparison request payload.
        settings (Settings): Application settings, including cache TTL.

    Returns:
        None: Streams INITIAL_OFFERS and FINAL_OFFERS messages, then closes.
    """
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

    providers = await get_providers(address.providers, wants_fiber=address.wants_fiber)
    if not providers:
        await websocket.send_json(
            WsMessage(type="ERROR", message="No providers available.").model_dump()
        )
        await websocket.close()
        return

    fast_providers = [p for p in providers if not isinstance(p, ServusSpeedProvider)]
    servus = next((p for p in providers if isinstance(p, ServusSpeedProvider)), None)

    # --- If ONLY ServusSpeed (rare) ----------------------------------------
    if servus and not fast_providers:
        await _send_final_for_servus_only(websocket, servus, address, settings)
        return

    # --- Phase 1 -----------------------------------------------------------
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

    offers_phase1: Dict[str, List[Offer]] = {}
    for name, task in phase1_tasks.items():
        if task in done:
            pname, poffers, ok = task.result()
            if ok:
                offers_phase1[pname] = poffers

    if servus_task and servus_task.done():
        pname, poffers, ok = servus_task.result()
        if ok:
            offers_phase1[pname] = poffers

    merged_initial = merge_offers([o for sub in offers_phase1.values() for o in sub])
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

    # --- Phase 2 -----------------------------------------------------------
    phase2_tasks: List[asyncio.Task] = list(pending)
    if servus_task and not servus_task.done():
        phase2_tasks.append(servus_task)

    final_offers_map = {**offers_phase1}
    if phase2_tasks:
        results = await asyncio.gather(*phase2_tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, Exception):
                logger.error(f"[ws] provider task failed in Phase 2: {res!r}")
                continue
            pname, poffers, ok = res
            if ok:
                final_offers_map[pname] = poffers

    merged_final = merge_offers([o for sub in final_offers_map.values() for o in sub])
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


# Helper for “ServusSpeed-only” scenario
async def _send_final_for_servus_only(
    websocket: WebSocket,
    servus: ServusSpeedProvider,
    address: Address,
    settings: Settings,
) -> None:
    """
    Handle the scenario where only ServusSpeedProvider is used.

    Fetches, merges, and caches offers, then sends a FINAL_OFFERS message.

    Args:
        websocket (WebSocket): The WebSocket connection to send on.
        servus (ServusSpeedProvider): The ServusSpeedProvider instance.
        address (Address): The address model to query.
        settings (Settings): Application settings, for cache TTL.

    Returns:
        None
    """
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
