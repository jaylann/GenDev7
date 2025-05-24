"""
Utilities to deduplicate and sort Offer objects based on their effective price.
"""

from __future__ import annotations

import sys
from typing import Dict, Tuple, List

from app.models import Offer
from app.utils.logger import logger


def _key(o: Offer) -> Tuple[str, str]:
    """
    Generate a deduplication key using provider and product_id (case-insensitive).

    Args:
        o: The Offer instance.

    Returns:
        A tuple of (provider.lower(), product_id.lower()).
    """
    return o.provider.lower(), o.product_id.lower()


def _effective_price(o: Offer) -> int:
    """
    Determine the effective price for an offer.

    Priority:
      1. price_cents_month_intro
      2. price_cents_month_regular
      3. treated as infinity (i.e. unknown price)

    Args:
        o: The Offer.

    Returns:
        int: Effective monthly price in cents, prioritizing intro then regular;
             returns math.inf if no price is available.
    """
    if o.price_cents_month_intro is not None:
        return o.price_cents_month_intro
    if o.price_cents_month_regular is not None:
        return o.price_cents_month_regular
    return sys.maxsize


def merge_offers(raw: List[Offer]) -> List[Offer]:
    """
    Merge a list of offers by removing duplicates and sorting by effective price.

    1. Deduplicate on (provider, product_id), keeping the offer with the lower effective price.
    2. Return the merged list ordered by effective price ascending (unknown prices go last).

    Args:
        raw: A list of Offer objects to merge.

    Returns:
        A list of unique Offer objects, sorted by effective price.
    """
    seen: Dict[Tuple[str, str], Offer] = {}

    for offer in raw:
        key = _key(offer)
        offer_price: int = _effective_price(offer)
        existing: Offer | None = seen.get(key)

        if existing is None:
            seen[key] = offer
            logger.debug(f"Added offer {key}", extra={"price": offer_price})
        else:
            existing_price: int = _effective_price(existing)
            if offer_price < existing_price:
                seen[key] = offer
                logger.debug(
                    f"Replaced offer {key}: {existing_price}¢ → {offer_price}¢"
                )
            else:
                logger.debug(
                    f"Kept existing offer {key}: {existing_price}¢ ≤ {offer_price}¢"
                )
    merged: List[Offer] = list(seen.values())
    merged.sort(key=_effective_price)
    logger.info(f"Merged {len(raw)} raw offers into {len(merged)} unique offers")
    return merged
