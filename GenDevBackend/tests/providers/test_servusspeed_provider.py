from __future__ import annotations

import asyncio
from typing import Any, Dict

import httpx
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from tenacity.wait import wait_fixed

from app.exceptions import ProviderError
from app.models import Address, Offer
from app.providers.servusspeed import (
    _post_json,
    ServusSpeedProvider,
)

# Global helpers
FAST_WAIT = wait_fixed(0)


class _DummySettings:
    servusspeed_username = "user"
    servusspeed_password = "pw"
    servusspeed_base = "https://servus.speed"


@pytest.fixture(autouse=True)
def _patch_settings(monkeypatch):
    monkeypatch.setattr(
        "app.providers.servusspeed.get_settings", lambda: _DummySettings()
    )
    yield


@pytest.fixture(scope="session")
def dummy_addr() -> Address:
    return Address(
        street="Musterweg",
        house_number="1",
        city="München",
        plz="80331",
        country_code="DE",
    )


# Async client stub
class _StubClient:
    def __init__(self, post_impl):
        self._post_impl = post_impl

    async def post(self, *a, **kw):
        return await self._post_impl(*a, **kw)


# _post_json helper
@pytest.mark.asyncio
async def test_post_json_success():
    async def fake(url, **_):
        return httpx.Response(
            200, json={"ok": True}, request=httpx.Request("POST", url)
        )

    resp = await _post_json(
        _StubClient(fake),
        "https://x",
        {},
        ("u", "p"),
        httpx.Timeout(1.0),
    )
    assert resp.status_code == 200 and resp.json() == {"ok": True}


@pytest.mark.asyncio
async def test_post_json_redirect_raises():
    async def fake(url, **_):
        return httpx.Response(
            302, headers={"location": "https://new"}, request=httpx.Request("POST", url)
        )

    with pytest.raises(ProviderError):
        await _post_json(
            _StubClient(fake), "https://x", {}, ("u", "p"), httpx.Timeout(1.0)
        )


@pytest.mark.asyncio
async def test_post_json_http_error_raises():
    async def fake(url, **_):
        return httpx.Response(500, request=httpx.Request("POST", url))

    with pytest.raises(ProviderError):
        await _post_json(
            _StubClient(fake), "https://x", {}, ("u", "p"), httpx.Timeout(1.0)
        )


# Provider.fetch – happy path
@pytest.mark.asyncio
async def test_fetch_happy(monkeypatch, dummy_addr):
    sentinel_offer = Offer.model_construct()

    # patch factory helpers
    monkeypatch.setattr(
        "app.factories.ServusSpeedFactory.build_available_products_body",
        lambda addr: {"addr": str(addr)},
    )

    class _DummyResp:
        def __init__(self, pid):
            self.pid = pid

        def to_offer(self, _prov):
            return sentinel_offer

    monkeypatch.setattr(
        "app.factories.ServusSpeedFactory.parse_detail_response",
        lambda pid, payload: _DummyResp(pid),
    )

    # stub _post_json sequence
    calls: Dict[str, int] = dict(avail=0, detail=0)

    async def fake_post(url, **_):
        if url.endswith("/available-products"):
            calls["avail"] += 1
            return httpx.Response(
                200,
                json={"availableProducts": ["A", "B"]},
                request=httpx.Request("POST", url),
            )
        else:  # detail
            calls["detail"] += 1
            pid = url.rsplit("/", 1)[-1]
            return httpx.Response(
                200,
                json={"id": pid},
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr("app.providers.servusspeed._post_json", _post_json)  # restore
    provider = ServusSpeedProvider(
        client=_StubClient(fake_post),
        retry_config=None,
    )

    offers = await provider(dummy_addr)

    assert offers == [sentinel_offer, sentinel_offer]
    assert calls == {"avail": 1, "detail": 2}


# Provider.fetch – detail timeout handled gracefully
@pytest.mark.asyncio
async def test_fetch_detail_timeout(monkeypatch, dummy_addr):
    sentinel = Offer.model_construct()

    monkeypatch.setattr(
        "app.factories.ServusSpeedFactory.build_available_products_body",
        lambda *_: {},
    )
    monkeypatch.setattr(
        "app.factories.ServusSpeedFactory.parse_detail_response",
        lambda pid, payload: type("D", (), {"to_offer": lambda self, _: sentinel})(),
    )

    async def fake_post(url, **_):
        if url.endswith("/available-products"):
            return httpx.Response(
                200,
                json={"availableProducts": ["good", "slow"]},
                request=httpx.Request("POST", url),
            )
        # good → fast
        if url.endswith("/good"):
            return httpx.Response(200, json={}, request=httpx.Request("POST", url))
        # slow → simulate timeout
        raise httpx.TimeoutException("boom", request=httpx.Request("POST", url))

    provider = ServusSpeedProvider(_StubClient(fake_post))
    offers = await provider(dummy_addr)
    assert offers == [sentinel], "Only the fast product should survive"


# Property-based: available-product body is forwarded unchanged
@given(st.text(min_size=1, max_size=20))
@settings(
    deadline=None,
    max_examples=20,
    suppress_health_check=(HealthCheck.function_scoped_fixture,),
)
def test_body_forward(monkeypatch, token):
    addr = Address(
        street="X", house_number="1", city="X", plz="12345", country_code="DE"
    )

    def build_body(_):
        return {"magic": token}

    monkeypatch.setattr(
        "app.factories.ServusSpeedFactory.build_available_products_body", build_body
    )
    monkeypatch.setattr(
        "app.factories.ServusSpeedFactory.parse_detail_response",
        lambda *_: type(
            "D", (), {"to_offer": lambda self, _: Offer.model_construct()}
        )(),
    )

    captured: Dict[str, Any] = {}

    async def fake_post(url, *, json=None, **_):
        if url.endswith("/available-products"):
            captured["body"] = json
            return httpx.Response(
                200,
                json={"availableProducts": []},
                request=httpx.Request("POST", url),
            )
        return httpx.Response(200, json={}, request=httpx.Request("POST", url))

    provider = ServusSpeedProvider(_StubClient(fake_post))
    asyncio.run(provider(addr))

    assert captured["body"] == {"magic": token}
