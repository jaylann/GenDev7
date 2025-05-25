"""
Hermetic test-suite for the Redis-backed offer cache.

• No live Redis – an in-memory FakeRedis is injected.
• No production Offer – we replace the module's `Offer` with a DummyOffer.
• No noisy logs – logger.debug / .error are patched to no-ops.
"""

from __future__ import annotations

import asyncio
import importlib
import json
from string import ascii_letters, digits
from types import SimpleNamespace
from typing import Dict
from unittest.mock import AsyncMock

import pytest
from hypothesis import given, settings, strategies as st, HealthCheck
from pydantic import BaseModel


#  Mini-helper types
class DummyOffer(BaseModel):
    id: str
    price: float


class FakeRedis:
    """Tiny in-memory subset of redis.asyncio just for the cache layer."""

    def __init__(self) -> None:
        self._store: Dict[str, str] = {}

    async def setex(self, key: str, ttl: int, value: str) -> bool:  # noqa: D401
        self._store[key] = value
        return True

    async def get(self, key: str):  # noqa: D401
        return self._store.get(key)

    async def delete(self, key: str) -> int:  # noqa: D401
        return 1 if self._store.pop(key, None) is not None else 0


#  Locate the service-under-test (SUT)
try:
    service = importlib.import_module("app.services.caching_service")
except ModuleNotFoundError:
    raise ImportError("Could not locate the caching module")


# Replace the Offer class *inside* that module so only it sees DummyOffer
service.Offer = DummyOffer

# Silence logs coming from the cache module
service.logger = SimpleNamespace(
    debug=lambda *_, **__: None, error=lambda *_, **__: None
)


pytestmark = pytest.mark.asyncio


#  White-box unit tests
async def test_cache_set_serialises_and_writes(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(service, "_redis", fake, raising=True)

    slug = "unit-slug"
    offers = [DummyOffer(id="a", price=1.23), DummyOffer(id="b", price=4.56)]
    ttl = 30

    spy_setex = AsyncMock(wraps=fake.setex)
    monkeypatch.setattr(fake, "setex", spy_setex, raising=True)

    await service.cache_set(slug, offers, ttl)

    spy_setex.assert_awaited_once()
    called_slug, called_ttl, called_json = spy_setex.await_args.args
    assert (called_slug, called_ttl) == (slug, ttl)
    assert [DummyOffer(**d) for d in json.loads(called_json)] == offers


async def test_cache_get_miss(monkeypatch):
    monkeypatch.setattr(service, "_redis", FakeRedis(), raising=True)
    assert await service.cache_get("does-not-exist") is None


async def test_cache_get_hit(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(service, "_redis", fake, raising=True)

    slug = "hit"
    src_offers = [DummyOffer(id="x", price=9.99)]
    await fake.setex(slug, 10, json.dumps([o.model_dump() for o in src_offers]))

    assert await service.cache_get(slug) == src_offers


async def test_cache_get_corrupted_json(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(service, "_redis", fake, raising=True)

    slug = "corrupt"
    await fake.setex(slug, 10, "☠️ not-json ☠️")

    spy_delete = AsyncMock(wraps=fake.delete)
    monkeypatch.setattr(fake, "delete", spy_delete, raising=True)

    assert await service.cache_get(slug) is None
    spy_delete.assert_awaited_once_with(slug)


async def test_cache_get_invalid_offer(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(service, "_redis", fake, raising=True)

    slug = "invalid-offer"
    await fake.setex(slug, 10, json.dumps([{"unexpected": "field"}]))

    spy_delete = AsyncMock(wraps=fake.delete)
    monkeypatch.setattr(fake, "delete", spy_delete, raising=True)

    assert await service.cache_get(slug) is None
    spy_delete.assert_awaited_once_with(slug)


#  Property-based round-trip with Hypothesis
slug_st = st.text(ascii_letters + digits + "-_", min_size=1, max_size=64)
price_st = st.floats(min_value=0, max_value=1e6, allow_nan=False, allow_infinity=False)
offer_st = st.builds(DummyOffer, id=slug_st, price=price_st)
offers_st = st.lists(offer_st, min_size=0, max_size=20)
ttl_st = st.integers(min_value=1, max_value=86_400)


@given(slug=slug_st, offers=offers_st, ttl=ttl_st)
@settings(
    max_examples=75,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_roundtrip(monkeypatch, slug, offers, ttl):
    """cache_set → cache_get preserves the payload for arbitrary inputs."""
    fake = FakeRedis()
    monkeypatch.setattr(service, "_redis", fake, raising=True)

    asyncio.run(service.cache_set(slug, offers, ttl))
    result = asyncio.run(service.cache_get(slug))

    assert [o.model_dump() for o in (result or [])] == [o.model_dump() for o in offers]
