"""
Service functions for creating and retrieving shared offer comparisons.

Encodes and decodes shareable slugs, interacts with cache for storing and fetching offers,
and validates input before responding with API schemas.
"""

from __future__ import annotations

import time
from typing import List, Any, Dict

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.schemas import (
    CompareResponse,
    SingleOfferShareRequest,
    SingleOfferShareResponse,
)
from app.core import Settings
from app.models import Address, Offer
from app.services import cache_get, cache_set
from app.utils import decode, encode
from app.utils import logger


async def get_comparison_by_slug(slug: str) -> CompareResponse:
    """
    Retrieve comparison data using an encoded slug.

    Decodes the slug to extract address data, fetches cached offers,
    and constructs a CompareResponse.

    Args:
        slug (str): Encoded identifier for the comparison.

    Returns:
        CompareResponse: Schema containing slug, offers list, and optional address.

    Raises:
        HTTPException: 400 if slug decoding fails;
                       404 if no cached data is found for the slug.
    """
    decoded: Dict[str, Any] | None = decode(slug)
    if not decoded:
        logger.warning(f"Invalid slug format: {slug}")
        raise HTTPException(status_code=400, detail="Invalid slug format.")

    offers: List[Offer] | None = cache_get(slug)
    if offers is None:
        logger.warning(f"Cache miss for slug: {slug}")
        raise HTTPException(
            status_code=404, detail="Comparison data expired or slug unknown."
        )

    addr_data: Dict[str, Any] | None = decoded.get("addr")
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
    Generate a shareable link for a single offer from an existing comparison.

    Looks up the original comparison in cache, validates the offer key,
    caches the selected offer under a new slug, and returns the share link.

    Args:
        request (SingleOfferShareRequest): Payload with original slug and offer key.
        settings (Settings): Application settings (e.g., cache TTL).

    Returns:
        SingleOfferShareResponse: Schema containing the new shared slug.

    Raises:
        HTTPException: 400 for invalid original slug or offer key format;
                       404 if original comparison or specified offer is not found.
    """
    original_offers: List[Offer] | None = cache_get(request.original_page_slug)
    if not original_offers:
        raise HTTPException(
            status_code=404,
            detail="Original offer list not found or expired.",
        )

    decoded_original: Dict[str, Any] | None = decode(request.original_page_slug)
    if not decoded_original or "addr" not in decoded_original:
        raise HTTPException(status_code=400, detail="Invalid original slug.")

    address_data: Dict[str, Any] = decoded_original["addr"]

    # Extract provider name and product ID from the offer key
    try:
        provider_name: str
        product_id_str: str
        provider_name, product_id_str = request.offer_key.split(":", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid offer key format.")

    found_offer: Offer | None = next(
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

    payload: Dict[str, Any] = {
        "addr": address_data,
        "ts": time.monotonic(),
        "offer_key": request.offer_key,
    }
    shared_slug: str = encode(payload)
    await cache_set(shared_slug, [found_offer], settings.cache_ttl_seconds)

    return SingleOfferShareResponse(shared_slug=shared_slug)
