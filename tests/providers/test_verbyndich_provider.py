

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import httpx
import pytest

from app.core.circuit_breaker import reset_all_breakers
from app.factories import VerbynDichFactory
from app.models import Address, Offer
from app.providers.verbyndich import (
    VerbynDichProvider,
    _fetch_page as real_fetch_page,
)


# Patching helpers
class _DummySettings:
    verbyndich_base = "https://verbyn.dich/api"
    verbyndich_api_key = "TEST_VERBYN_API_KEY"


@pytest.fixture(autouse=True)
def _patch_settings(monkeypatch):
    # Provider imports get_settings inside its module
    monkeypatch.setattr(
        "app.providers.verbyndich.get_settings", lambda: _DummySettings()
    )
    yield


@pytest.fixture(autouse=True)
def _adjust_constants(monkeypatch):
    """Shrink concurrency to make call-count assertions predictable."""
    mp = "app.providers.verbyndich"
    monkeypatch.setattr(f"{mp}.PARALLEL", 3)
    monkeypatch.setattr(f"{mp}.MAX_PAGES", 10)
    yield


@pytest.fixture(autouse=True)
def _reset_lru_and_breakers():
    real_fetch_page.cache_clear()  # ensure clean alru_cache
    yield
    real_fetch_page.cache_clear()
    reset_all_breakers()


@pytest.fixture(scope="session")
def dummy_addr() -> Address:
    return Address(
        street="Teststraße",
        house_number="1",
        city="Berlin",
        plz="10115",
        country_code="DE",
    )


# Common stubs
SentinelOffer = Offer.model_construct()  # unvalidated dummy object


@dataclass
class _RespStub:  # mimics VerbynDichResponse
    valid: bool
    last: bool

    def to_offer(self, _provider: str) -> Offer:
        return SentinelOffer


def _build_body_stub(addr: Address) -> str:
    """Return a deterministic request body for assertion."""
    return f"{addr.street}-{addr.house_number}-{addr.plz}"


# 1. Happy-path pagination
@pytest.mark.asyncio
async def test_fetch_happy_path(monkeypatch, dummy_addr):
    """
    Pages 0–2 are valid, page 2 has *last=True*. Provider must
    return exactly 3 offers and stop early (no attempts beyond page 3).
    """
    calls: List[int] = []

    async def fake_fetch_page(_client, _base, _key, _body, page):
        calls.append(page)
        return {"page": page}

    def fake_parse(data: Dict[str, Any]):
        p = data["page"]
        return _RespStub(valid=True, last=(p == 2))

    monkeypatch.setattr("app.providers.verbyndich._fetch_page", fake_fetch_page)
    monkeypatch.setattr(VerbynDichFactory, "build_body", _build_body_stub)
    monkeypatch.setattr(VerbynDichFactory, "parse_response", fake_parse)

    provider = VerbynDichProvider(httpx.AsyncClient())

    offers = await provider(dummy_addr)

    assert offers == [SentinelOffer] * 3
    # First PARALLEL pages (0-2) were scheduled; after *last* seen,
    # no further pages should be fetched.
    assert set(calls).issubset({0, 1, 2})


# 2. Page-level failures are tolerated
@pytest.mark.asyncio
async def test_fetch_with_page_errors(monkeypatch, dummy_addr):
    """
    Page 0 raises, page 1 valid+last=True.
    Provider should skip the failing page and still return the single offer.
    """

    async def fake_fetch_page(_c, _b, _k, _body, page):
        if page == 0:
            raise httpx.TimeoutException("boom")
        return {"page": page}

    def fake_parse(data):
        p = data["page"]
        return _RespStub(valid=True, last=True) if p == 1 else None

    monkeypatch.setattr("app.providers.verbyndich._fetch_page", fake_fetch_page)
    monkeypatch.setattr(VerbynDichFactory, "build_body", _build_body_stub)
    monkeypatch.setattr(VerbynDichFactory, "parse_response", fake_parse)

    provider = VerbynDichProvider(httpx.AsyncClient())
    offers = await provider(dummy_addr)

    assert offers == [SentinelOffer]


# 3. No valid offers ⇒ empty list
@pytest.mark.asyncio
async def test_fetch_no_valid(monkeypatch, dummy_addr):
    async def fake_fetch_page(_c, _b, _k, _body, page):
        return {"page": page}

    monkeypatch.setattr("app.providers.verbyndich._fetch_page", fake_fetch_page)
    monkeypatch.setattr(VerbynDichFactory, "build_body", _build_body_stub)
    monkeypatch.setattr(VerbynDichFactory, "parse_response", lambda _d: None)

    provider = VerbynDichProvider(httpx.AsyncClient())
    offers = await provider(dummy_addr)

    assert offers == []
