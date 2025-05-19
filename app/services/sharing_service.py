from __future__ import annotations

import time

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.schemas import (
    CompareResponse,
    SingleOfferShareRequest,
    SingleOfferShareResponse,
)
from app.core import Settings
from app.models import Address
from app.utils import decode, encode
from app.utils import logger
from app.services import cache_get, cache_set

# --------------------------------------------------------------------------- #
# 1. HTTP helpers                                                             #
# --------------------------------------------------------------------------- #
async def get_comparison_by_slug(slug: str) -> CompareResponse:
    """
    Validate slug, fetch offers from cache, hydrate address → `CompareResponse`.
    """
    decoded = decode(slug)
    if not decoded:
        logger.warning(f"Invalid slug format: {slug}")
        raise HTTPException(status_code=400, detail="Invalid slug format.")

    offers = cache_get(slug)
    if offers is None:
        logger.warning(f"Cache miss for slug: {slug}")
        raise HTTPException(
            status_code=404, detail="Comparison data expired or slug unknown."
        )

    addr_data = decoded.get("addr")
    api_address: Address | None = None
    if addr_data:
        try:
            api_address = Address(**addr_data)
        except ValidationError as e:
            logger.error(f"Failed to parse address from slug: {e}")

    return CompareResponse(slug=slug, offers=offers, address=api_address)


async def generate_share_link(
    request: SingleOfferShareRequest,
    settings: Settings,
) -> SingleOfferShareResponse:
    """
    Create a single-offer share slug and cache that single offer.
    """
    original_offers = cache_get(request.original_page_slug)
    if not original_offers:
        raise HTTPException(
            status_code=404,
            detail="Original offer list not found or expired.",
        )

    decoded_original = decode(request.original_page_slug)
    if not decoded_original or "addr" not in decoded_original:
        raise HTTPException(status_code=400, detail="Invalid original slug.")

    address_data = decoded_original["addr"]

    try:
        provider_name, product_id_str = request.offer_key.split(":", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid offer key format.")

    found_offer = next(
        (
            offer
            for offer in original_offers
            if offer.provider == provider_name
            and str(offer.product_id) == product_id_str
        ),
        None,
    )
    if not found_offer:
        raise HTTPException(
            status_code=404, detail="Specified offer not found in the original list."
        )

    payload = {
        "addr": address_data,
        "ts": time.monotonic(),
        "offer_key": request.offer_key,
    }
    shared_slug = encode(payload)
    await cache_set(shared_slug, [found_offer], settings.cache_ttl_seconds)

    return SingleOfferShareResponse(shared_slug=shared_slug)
