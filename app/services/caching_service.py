"""
Redis-backed caching layer for offer lookups.

Uses Redis to store Offer lists by slug with TTL-based expiration,
so all Gunicorn/Uvicorn workers share the same cache.
"""

import os
import json
from typing import List, Optional

import redis.asyncio as redis
from app.models import Offer
from app.utils import logger

# Initialize Redis client from the REDIS_URL env var (default to 'redis' service)
_redis = redis.from_url(
    os.getenv("REDIS_URL", "redis://redis:6379/0"),
    encoding="utf-8",
    decode_responses=True,
)

async def cache_set(slug: str, offers: List[Offer], ttl_seconds: int) -> None:
    """
    Cache offers under a unique slug for a specified TTL.
    Serializes offers to JSON and uses Redis SETEX.

    Args:
        slug (str): Unique key to store the offers.
        offers (List[Offer]): List of Offer instances to cache.
        ttl_seconds (int): Time-to-live in seconds.
    """
    # Convert Pydantic models to dicts
    payload = [offer.model_dump() for offer in offers]
    data = json.dumps(payload)
    await _redis.setex(slug, ttl_seconds, data)
    logger.debug(f"[cache] set slug={slug!r} offers={len(offers)} ttl={ttl_seconds}s")

async def cache_get(slug: str) -> Optional[List[Offer]]:
    """
    Retrieve cached offers for a given slug if not expired.

    Args:
        slug (str): Key for the cached offers.

    Returns:
        Optional[List[Offer]]: List of Offer instances, or None on miss/expiry.
    """
    raw = await _redis.get(slug)
    if raw is None:
        logger.debug(f"[cache] miss slug={slug!r}")
        return None

    try:
        items = json.loads(raw)
        offers = [Offer(**data) for data in items]
        logger.debug(f"[cache] hit slug={slug!r}")
        return offers
    except Exception as e:
        # On any parse error, delete the corrupted entry and return miss
        await _redis.delete(slug)
        logger.error(f"[cache] error decoding slug={slug!r}: {e}")
        return None
