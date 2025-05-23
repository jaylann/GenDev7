from __future__ import annotations

import asyncio
from typing import Any, Dict

import httpx
import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.core import RetryConfig
from app.core.circuit_breaker import reset_all_breakers
from app.exceptions import ProviderError
from app.factories import ByteMeFactory
from app.models import Address, Offer
from app.providers.byteme import ByteMeProvider
from tests.providers.test_base_provider import FAST_WAIT


# Dummy App-Settings replacement
class _DummySettings:
    byteme_api_key = "TEST_KEY"
    byteme_endpoint = "https://byte.me/api/offers"


@pytest.fixture(autouse=True)
def _patch_settings(monkeypatch):
    """ByteMeProvider fetches settings at instantiation time."""
    # provider module already imported get_settings; patch there
    monkeypatch.setattr("app.providers.byteme.get_settings", lambda: _DummySettings())
    yield


@pytest.fixture(autouse=True)
def _reset_breakers():
    """Keep global circuit-breaker registry pristine."""
    yield
    reset_all_breakers()


@pytest.fixture(scope="session")
def dummy_address() -> Address:  # type: ignore[valid-type]
    return Address(
        street="Teststraße",
        house_number="1",
        city="Berlin",
        plz="10115",
        country_code="DE",
    )


@pytest.fixture(scope="session")
def csv_text() -> str:
    """Single-row CSV matching ByteMeResponse header order."""
    return (
        "provider_name,product_id,speed_down_mbit,price_cents_month_intro,"
        "price_cents_month_regular,contract_duration_months,connection_type,"
        "installation_service_included,tv_included,tv_package_name,data_cap_gb,"
        "voucher_type,voucher_value_cents,voucher_value_percent,max_age\n"
        "Ultra 100,PROD-1,100,1999,2999,24,DSL,True,False,,,"
    )


# Utility – AsyncClient monkey
class _StubAsyncClient:
    """Minimal stand-in for httpx.AsyncClient with injectable *get*."""

    def __init__(self, get_impl):
        self._get_impl = get_impl

    async def get(self, *args, **kwargs):  # noqa: D401
        return await self._get_impl(*args, **kwargs)


# 1. Happy-path fetch
@pytest.mark.asyncio
async def test_fetch_success(monkeypatch, dummy_address, csv_text):
    sentinel_offer = Offer.model_construct()  # unvalidated dummy

    # patch factory
    def fake_make_offers(df: pd.DataFrame, provider_name: str):
        # simple sanity-check on plumbing
        assert provider_name == "ByteMe"
        assert not df.empty
        return [sentinel_offer]

    monkeypatch.setattr(ByteMeFactory, "make_offers", fake_make_offers)

    # patch client.get
    captured: Dict[str, Any] = {}

    async def fake_get(url, *, params=None, headers=None, timeout=None):
        captured.update(dict(url=url, params=params, headers=headers, timeout=timeout))
        return httpx.Response(
            200,
            content=csv_text,
            request=httpx.Request("GET", url),
        )

    client = _StubAsyncClient(fake_get)
    provider = ByteMeProvider(
        client, retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT)
    )

    offers = await provider(dummy_address)

    assert offers == [sentinel_offer]
    # URL must equal the endpoint from the dummy settings
    assert captured["url"] == _DummySettings.byteme_endpoint
    # parameters & headers mapping
    expected_params = {
        "street": dummy_address.street,
        "houseNumber": dummy_address.house_number,
        "city": dummy_address.city,
        "plz": dummy_address.plz,
    }
    assert captured["params"] == expected_params
    assert captured["headers"] == {"X-Api-Key": _DummySettings.byteme_api_key}


# 2. HTTP error → ProviderError
@pytest.mark.asyncio
@pytest.mark.parametrize("status", [400, 500])
async def test_http_error_raises(monkeypatch, dummy_address, status):
    async def fake_get(url, **_):
        return httpx.Response(status, request=httpx.Request("GET", url))

    client = _StubAsyncClient(fake_get)
    provider = ByteMeProvider(
        client, retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT)
    )

    # HTTP failures must be wrapped into ProviderError
    with pytest.raises(ProviderError):
        await provider(dummy_address)


# 3. CSV parse error → ProviderError
@pytest.mark.asyncio
async def test_parse_error_raises(monkeypatch, dummy_address):
    async def fake_get(url, **_):
        return httpx.Response(
            200,
            content="this;is;not;csv",
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(
        pd,
        "read_csv",
        lambda *_args, **_kw: (_ for _ in ()).throw(pd.errors.ParserError("bad csv")),
    )

    client = _StubAsyncClient(fake_get)
    provider = ByteMeProvider(
        client, retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT)
    )

    # Provider doesn't catch ParserError, so expect the raw exception
    with pytest.raises(pd.errors.ParserError):
        await provider(dummy_address)


# 4. Retry until success
@pytest.mark.asyncio
async def test_retry_until_success(monkeypatch, dummy_address, csv_text):
    failures, calls = 2, {"count": 0}
    sentinel = Offer.model_construct()

    monkeypatch.setattr(ByteMeFactory, "make_offers", lambda *_: [sentinel])

    async def fake_get(url, **_):
        calls["count"] += 1
        if calls["count"] <= failures:
            raise httpx.TimeoutException("boom")
        return httpx.Response(200, content=csv_text, request=httpx.Request("GET", url))

    cfg = RetryConfig(max_attempts=5, wait=FAST_WAIT)
    provider = ByteMeProvider(_StubAsyncClient(fake_get), retry_config=cfg)

    offers = await provider(dummy_address)

    assert offers == [sentinel]
    assert calls["count"] == failures + 1  # retried exactly as needed


# 5. Retry exhaustion → ProviderError
@pytest.mark.asyncio
async def test_retry_exhaustion(monkeypatch, dummy_address):
    attempts, calls = 3, {"count": 0}

    async def fake_get(_url, **_):
        calls["count"] += 1
        raise httpx.TimeoutException("still failing")

    provider = ByteMeProvider(
        _StubAsyncClient(fake_get),
        retry_config=RetryConfig(max_attempts=attempts, wait=FAST_WAIT),
    )

    with pytest.raises(ProviderError):
        await provider(dummy_address)

    assert calls["count"] == attempts


# Strategies
_valid_txt = st.text(
    alphabet=st.characters(
        min_codepoint=33, max_codepoint=126, blacklist_characters=",/&?"
    ),
    min_size=1,
    max_size=30,
)
# house number ≤ 10 chars
housenr_txt = st.text(
    alphabet=st.characters(
        min_codepoint=33, max_codepoint=126, blacklist_characters=",/&?"
    ),
    min_size=1,
    max_size=10,
)
plz_txt = st.text(
    alphabet=st.characters(min_codepoint=48, max_codepoint=57), min_size=5, max_size=5
)


@settings(
    deadline=None,
    max_examples=30,
    suppress_health_check=(HealthCheck.function_scoped_fixture,),
)
@given(
    street=_valid_txt,
    housenr=housenr_txt,
    city=_valid_txt,
    plz=plz_txt,
)
def test_param_mapping_property(monkeypatch, street, housenr, city, plz):
    """Whatever the address, the outgoing request params must mirror it 1-1."""
    addr = Address(
        street=street,
        house_number=housenr,
        city=city,
        plz=plz,
        country_code="DE",
    )
    sentinel = Offer.model_construct()
    monkeypatch.setattr(ByteMeFactory, "make_offers", lambda *_: [sentinel])

    captured: Dict[str, Any] = {}

    async def fake_get(url, *, params=None, headers=None, **_kw):
        captured["params"] = params
        return httpx.Response(
            200,
            content="provider_name,product_id,speed_down_mbit,contract_duration_months,connection_type\nx,y,1,1,DSL",
            request=httpx.Request("GET", url),
        )

    provider = ByteMeProvider(
        _StubAsyncClient(fake_get),
        retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT),
    )

    asyncio.run(provider(addr))
    assert captured["params"] == {
        "street": street,
        "houseNumber": housenr,
        "city": city,
        "plz": plz,
    }
