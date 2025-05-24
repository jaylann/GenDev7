from __future__ import annotations

import asyncio
import xml.etree.ElementTree as ET
from typing import Any, Dict

import httpx
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from tenacity.wait import wait_fixed

from app.core import RetryConfig
from app.core.circuit_breaker import reset_all_breakers
from app.exceptions import ProviderError
from app.factories import WebWunderFactory
from app.models import Address, Offer
from app.providers.webwunder import WebWunderProvider

# Globals / helpers
FAST_WAIT = wait_fixed(0)


class _DummySettings:
    webwunder_api_key = "XTEST123"
    webwunder_wsdl = "https://web.wunder/soap"


@pytest.fixture(autouse=True)
def _patch_settings(monkeypatch):
    # patch where get_settings is imported (inside provider module)
    monkeypatch.setattr(
        "app.providers.webwunder.get_settings", lambda: _DummySettings()
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


# Stub client
class _StubAsyncClient:
    def __init__(self, post_impl):
        self._impl = post_impl

    async def post(self, *a, **kw):
        return await self._impl(*a, **kw)


# Happy-path fetch
@pytest.mark.asyncio
async def test_fetch_success(monkeypatch, dummy_address):
    sentinel_offer = Offer.model_construct()

    # patch factory helpers
    monkeypatch.setattr(WebWunderFactory, "build_xml", lambda addr: "<xml>REQ</xml>")

    # post-process returns an XML tree with one <products> node
    def fake_postprocess(resp):
        root = ET.Element("Envelope")
        ET.SubElement(root, "products")
        return root

    monkeypatch.setattr(WebWunderFactory, "postprocess_response", fake_postprocess)
    monkeypatch.setattr(
        WebWunderFactory,
        "parse_responses",
        lambda _: [type("R", (), {"to_offer": lambda _s, _p: sentinel_offer})()],
    )

    # capture outgoing request
    captured: Dict[str, Any] = {}

    async def fake_post(url, *, content=None, headers=None, timeout=None):
        captured.update(url=url, content=content, headers=headers, timeout=timeout)
        return httpx.Response(
            200, text="<xml>RESP</xml>", request=httpx.Request("POST", url)
        )

    provider = WebWunderProvider(
        _StubAsyncClient(fake_post),
        retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT),
    )

    offers = await provider(dummy_address)

    assert offers == [sentinel_offer]
    assert captured["url"] == _DummySettings.webwunder_wsdl
    # verify SOAP headers
    assert captured["headers"]["X-Api-Key"] == _DummySettings.webwunder_api_key
    assert captured["headers"]["SOAPAction"] == "legacyGetInternetOffers"
    assert captured["content"] == "<xml>REQ</xml>"


# HTTP transport failure → ProviderError
@pytest.mark.asyncio
async def test_http_exception(monkeypatch, dummy_address):
    async def boom(*_a, **_kw):
        raise httpx.TimeoutException("boom")

    provider = WebWunderProvider(
        _StubAsyncClient(boom),
        retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT),
    )
    with pytest.raises(ProviderError):
        await provider(dummy_address)


# Empty <products> list → ProviderError
@pytest.mark.asyncio
async def test_empty_products(monkeypatch, dummy_address):
    monkeypatch.setattr(WebWunderFactory, "build_xml", lambda _addr: "<xml/>")

    def postproc(_resp):
        return ET.Element("Envelope")  # no <products>

    monkeypatch.setattr(WebWunderFactory, "postprocess_response", postproc)

    async def fake_post(url, **_):
        return httpx.Response(200, text="<xml/>", request=httpx.Request("POST", url))

    provider = WebWunderProvider(
        _StubAsyncClient(fake_post),
        retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT),
    )
    with pytest.raises(ProviderError):
        await provider(dummy_address)


# Retry until success
@pytest.mark.asyncio
async def test_retry_until_success(monkeypatch, dummy_address):
    failures, calls = 2, {"n": 0}
    sentinel_offer = Offer.model_construct()

    monkeypatch.setattr(WebWunderFactory, "build_xml", lambda _a: "<xml/>")

    root_ok = ET.Element("Envelope")
    ET.SubElement(root_ok, "products")
    monkeypatch.setattr(WebWunderFactory, "postprocess_response", lambda _r: root_ok)
    monkeypatch.setattr(
        WebWunderFactory,
        "parse_responses",
        lambda _e: [type("R", (), {"to_offer": lambda _s, _p: sentinel_offer})()],
    )

    async def maybe_timeout(*_a, **_kw):
        calls["n"] += 1
        if calls["n"] <= failures:
            raise httpx.ConnectError("fail")
        return httpx.Response(
            200,
            text="<xml/>",
            request=httpx.Request("POST", _DummySettings.webwunder_wsdl),
        )

    provider = WebWunderProvider(
        _StubAsyncClient(maybe_timeout),
        retry_config=RetryConfig(max_attempts=5, wait=FAST_WAIT),
    )

    offers = await provider(dummy_address)
    assert offers == [sentinel_offer]
    assert calls["n"] == failures + 1


# Property-based: build_xml is called with the exact Address
_valid = st.text(
    alphabet=st.characters(
        min_codepoint=33, max_codepoint=126, blacklist_characters="<>&"
    ),
    min_size=1,
    max_size=30,
)
plz_txt = st.text(
    alphabet=st.characters(min_codepoint=48, max_codepoint=57), min_size=5, max_size=5
)
housenr_txt = st.text(
    alphabet=st.characters(
        min_codepoint=33, max_codepoint=126, blacklist_characters="<>&"
    ),
    min_size=1,
    max_size=10,
)


@settings(
    deadline=None,
    max_examples=20,
    suppress_health_check=(HealthCheck.function_scoped_fixture,),
)
@given(street=_valid, housenr=housenr_txt, city=_valid, plz=plz_txt)
def test_build_xml_called(monkeypatch, street, housenr, city, plz):
    called: Dict[str, Address] = {}

    def spy(addr: Address):
        called["addr"] = addr
        return "<xml/>"

    monkeypatch.setattr(WebWunderFactory, "build_xml", spy)

    # minimal stubs to proceed
    root = ET.Element("Envelope")
    ET.SubElement(root, "products")
    monkeypatch.setattr(WebWunderFactory, "postprocess_response", lambda _r: root)
    monkeypatch.setattr(
        WebWunderFactory,
        "parse_responses",
        lambda _e: [
            type("R", (), {"to_offer": lambda _s, _p: Offer.model_construct()})()
        ],
    )

    async def fake_post(*_a, **_kw):
        return httpx.Response(
            200,
            text="<xml/>",
            request=httpx.Request("POST", _DummySettings.webwunder_wsdl),
        )

    provider = WebWunderProvider(
        _StubAsyncClient(fake_post),
        retry_config=RetryConfig(max_attempts=1, wait=FAST_WAIT),
    )

    addr = Address(
        street=street, house_number=housenr, city=city, plz=plz, country_code="DE"
    )
    asyncio.run(provider(addr))

    assert called["addr"] == addr
