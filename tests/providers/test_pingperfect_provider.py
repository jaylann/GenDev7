from __future__ import annotations

import asyncio
from typing import Any, Dict

import httpx
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from tenacity.wait import wait_fixed

from app.core import RetryConfig
from app.core.circuit_breaker import reset_all_breakers
from app.exceptions import ProviderError
from app.factories import PingPerfectFactory
from app.models import Address, Offer
from app.providers.pingperfect import (
    PingPerfectProvider,
)

# Utilities & fixtures
FAST_WAIT = wait_fixed(0)  # no back-off => ultra-fast tests


class _DummySettings:
    pingperfect_endpoint = "https://ping.perfect/api"


@pytest.fixture(autouse=True)
def _patch_settings(monkeypatch):
    """Patch the module-local get_settings used by the provider."""
    monkeypatch.setattr(
        "app.providers.pingperfect.get_settings",
        lambda: _DummySettings(),
    )
    yield


@pytest.fixture(autouse=True)
def _reset_breakers():
    yield
    reset_all_breakers()


@pytest.fixture(scope="session")
def dummy_address() -> Address:
    return Address(
        street="Teststraße",
        house_number="1",
        city="Berlin",
        plz="10115",
        country_code="DE",
    )


class _StubAsyncClient:
    """Tiny stand-in for httpx.AsyncClient with overridable *post*."""

    def __init__(self, post_impl):
        self._post_impl = post_impl

    async def post(self, *args, **kwargs):
        return await self._post_impl(*args, **kwargs)


# Sentinel offer we expect back
_SENTINEL_OFFER = Offer.model_construct()


class _DummyResp:
    """Mimics PingPerfectResponse; only *to_offer()* matters."""

    def to_offer(self, _provider: str):
        return _SENTINEL_OFFER


# 1. Happy-path fetch
@pytest.mark.asyncio
async def test_fetch_success(monkeypatch, dummy_address):
    # patch factory helpers
    build_calls: Dict[str, Any] = {}

    def fake_build_payload(addr: Address, wants_fiber: bool):
        # capture arguments for later asserts
        build_calls["addr"] = addr
        build_calls["fiber"] = wants_fiber
        return "{}", {"Content-Type": "application/json"}

    monkeypatch.setattr(PingPerfectFactory, "build_payload", fake_build_payload)
    monkeypatch.setattr(
        PingPerfectFactory, "parse_responses", lambda _items: [_DummyResp()]
    )

    async def fake_post(url, *, content=None, headers=None, timeout=None):
        return httpx.Response(200, json=[{}], request=httpx.Request("POST", url))

    provider = PingPerfectProvider(
        _StubAsyncClient(fake_post),
        wants_fiber=True,
        retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT),
    )

    offers = await provider(dummy_address)

    # Assertions -----------------------------------------------------------
    assert offers == [_SENTINEL_OFFER]
    assert build_calls["addr"] == dummy_address
    assert build_calls["fiber"] is True


# 2. HTTP errors are wrapped in ProviderError
@pytest.mark.asyncio
@pytest.mark.parametrize("status", [400, 500])
async def test_http_error_wrapped(status, dummy_address):
    async def fake_post(url, **_):
        return httpx.Response(status, request=httpx.Request("POST", url))

    provider = PingPerfectProvider(
        _StubAsyncClient(fake_post),
        retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT),
    )

    with pytest.raises(ProviderError):
        await provider(dummy_address)


# 3. Retry until success
@pytest.mark.asyncio
async def test_retry_until_success(monkeypatch, dummy_address):
    failures, counter = 2, {"calls": 0}
    monkeypatch.setattr(PingPerfectFactory, "build_payload", lambda *_: ("{}", {}))
    monkeypatch.setattr(
        PingPerfectFactory, "parse_responses", lambda _items: [_DummyResp()]
    )

    async def fake_post(url, **_):
        counter["calls"] += 1
        if counter["calls"] <= failures:
            raise httpx.ConnectTimeout("boom")
        return httpx.Response(200, json=[{}], request=httpx.Request("POST", url))

    provider = PingPerfectProvider(
        _StubAsyncClient(fake_post),
        retry_config=RetryConfig(max_attempts=5, wait=FAST_WAIT),
    )

    offers = await provider(dummy_address)
    assert offers == [_SENTINEL_OFFER]
    assert counter["calls"] == failures + 1


# 4. Retry exhaustion raises ProviderError
@pytest.mark.asyncio
async def test_retry_exhaustion(dummy_address):
    attempts, calls = 3, {"count": 0}

    async def always_timeout(url, **_):
        calls["count"] += 1
        raise httpx.ConnectTimeout("nope")

    provider = PingPerfectProvider(
        _StubAsyncClient(always_timeout),
        retry_config=RetryConfig(max_attempts=attempts, wait=FAST_WAIT),
    )

    with pytest.raises(ProviderError):
        await provider(dummy_address)

    assert calls["count"] == attempts


# 5. Property-based: wants_fiber flag is forwarded correctly
_valid_txt = st.text(
    alphabet=st.characters(
        min_codepoint=33, max_codepoint=126, blacklist_characters=",&?/"
    ),
    min_size=1,
    max_size=30,
)
plz_txt = st.text(
    alphabet=st.characters(min_codepoint=48, max_codepoint=57), min_size=5, max_size=5
)
housenr_txt = st.text(
    alphabet=st.characters(
        min_codepoint=33, max_codepoint=126, blacklist_characters=",/&?"
    ),
    min_size=1,
    max_size=10,
)


@settings(
    deadline=None,
    max_examples=25,
    suppress_health_check=(HealthCheck.function_scoped_fixture,),
)
@given(
    street=_valid_txt,
    housenr=housenr_txt,
    city=_valid_txt,
    plz=plz_txt,
    fiber=st.booleans(),
)
def test_wants_fiber_forwarding(monkeypatch, street, housenr, city, plz, fiber):
    addr = Address(
        street=street,
        house_number=housenr,
        city=city,
        plz=plz,
        country_code="DE",
    )

    captured: Dict[str, Any] = {}

    def fake_build_payload(a: Address, wants_fiber: bool):
        captured["addr"] = a
        captured["fiber"] = wants_fiber
        return "{}", {}

    monkeypatch.setattr(PingPerfectFactory, "build_payload", fake_build_payload)
    monkeypatch.setattr(
        PingPerfectFactory, "parse_responses", lambda _items: [_DummyResp()]
    )

    async def fake_post(url, **_):
        return httpx.Response(200, json=[{}], request=httpx.Request("POST", url))

    provider = PingPerfectProvider(
        _StubAsyncClient(fake_post),
        wants_fiber=fiber,
        retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT),
    )

    asyncio.run(provider(addr))

    assert captured["addr"] == addr
    assert captured["fiber"] is fiber
