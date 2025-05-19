"""
Plain-in-memory caching layer used by both HTTP and WebSocket comparisons.
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
    Cache *offers* under *slug* for *ttl_seconds* seconds.
    """
    _cache[slug] = (time.monotonic() + ttl_seconds, offers)
    logger.debug(f"[cache] set slug={slug!r} offers={len(offers)} ttl={ttl_seconds}s")


def get(slug: str) -> Optional[List[Offer]]:
    """
    Retrieve cached offers for *slug*.

    Returns `None` on miss / expiry.
    """
    entry = _cache.get(slug)
    if not entry:
        return None

    expires_at, offers = entry
    if time.monotonic() > expires_at:
        logger.info(f"[cache] expired slug={slug!r}")
        _cache.pop(slug, None)
        return None

    logger.debug(f"[cache] hit slug={slug!r}")
    return offers
