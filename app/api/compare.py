from __future__ import annotations

import asyncio
import time
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks


from app.api.dependencies import get_providers
from app.core.config import Settings, get_settings
from app.models import Offer, Address
from app.providers.base import ProviderBase
from app.services.merge import merge_offers
from app.utils.slug import encode

router = APIRouter()
_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0))  # global shared client

# very small in-memory TTL cache (slug -> (expires_ts, List[Offer]))
_cache: dict[str, tuple[float, List[Offer]]] = {}


def _cache_set(slug: str, offers: List[Offer], ttl: int) -> None:
    _cache[slug] = (time.time() + ttl, offers)


def _cache_get(slug: str) -> List[Offer] | None:
    item = _cache.get(slug)
    if not item:
        return None
    expires, offers = item
    if expires < time.time():
        _cache.pop(slug, None)
        return None
    return offers


# -----------------------------------  Schemas -------------------------------------------

from pydantic import BaseModel


class CompareResponse(BaseModel):
    slug: str
    offers: List[Offer]


# -----------------------------------  Routes  -------------------------------------------

@router.post("/compare", response_model=CompareResponse)
async def compare_fresh(
        address: Address,
        background: BackgroundTasks,
        providers: List[ProviderBase] = Depends(get_providers),
        settings: Settings = Depends(get_settings),
):
    """
    Gather provider data in parallel, merge, slug-encode and cache.
    """
    # Run all provider fetches concurrently
    results = await asyncio.gather(
        *[p(address) for p in providers], return_exceptions=True
    )

    offers: List[Offer] = []
    for res in results:
        if isinstance(res, Exception):
            # provider failed – just skip, we already retried in adapter
            continue
        offers.extend(res)

    merged = merge_offers(offers)
    slug = encode({"addr": address.model_dump()})

    # Cache in background so the response returns instantly
    background.add_task(_cache_set, slug, merged, settings.cache_ttl_seconds)

    return CompareResponse(slug=slug, offers=merged)


@router.get("/compare/{slug}", response_model=CompareResponse)
async def compare_by_slug(slug: str):
    """
    Re-hydrate a shared link. If the slug isn't cached any more, 404.
    """
    offers = _cache_get(slug)
    if offers is None:
        raise HTTPException(status_code=404, detail="Expired or unknown slug")

    return CompareResponse(slug=slug, offers=offers)
