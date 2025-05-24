"""
Plain in-memory caching layer for offer lookups.

Provides functions to cache Offer lists by slug with TTL-based expiration
and retrieve them, automatically handling expiry.
"""

from __future__ import annotations

import time
from typing import Dict, List, Optional, Tuple

from app.models import Offer
from app.utils import logger

# slug  -> (expires_ts, offers)
_cache: Dict[str, Tuple[float, List[Offer]]] = {}


async def set(slug: str, offers: List[Offer], ttl_seconds: int) -> None:
    """
    Cache offers under a unique slug for a specified time-to-live.

    Args:
        slug (str): Unique key to store the offers.
        offers (List[Offer]): List of offers to cache.
        ttl_seconds (int): Expiration time in seconds.

    Returns:
        None
    """
    _cache[slug] = (time.monotonic() + ttl_seconds, offers)
    logger.debug(f"[cache] set slug={slug!r} offers={len(offers)} ttl={ttl_seconds}s")


def get(slug: str) -> Optional[List[Offer]]:
    """
    Retrieve cached offers for a given slug if not expired.

    Args:
        slug (str): Key for the cached offers.

    Returns:
        Optional[List[Offer]]: Cached offers list, or None on miss/expiry.
    """
    entry: Optional[Tuple[float, List[Offer]]] = _cache.get(slug)
    if entry is None:
        return None

    expires_at: float
    offers: List[Offer]
    expires_at, offers = entry
    if time.monotonic() > expires_at:
        logger.info(f"[cache] expired slug={slug!r}")
        _cache.pop(slug, None)
        return None

    logger.debug(f"[cache] hit slug={slug!r}")
    return offers
