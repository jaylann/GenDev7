"""
Tests for the WebSocket comparison flow.

All external deps are stubbed; the suite is hermetic and fast.
"""

from __future__ import annotations

import asyncio
import importlib
import json
from typing import List
from unittest.mock import AsyncMock

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
from pydantic import BaseModel

try:
    WS_MODULE = importlib.import_module("app.services.comparison_service")
except ModuleNotFoundError:
    raise ImportError("Could not import comparison flow module")


# shared stubs
class DummyOffer(BaseModel):
    id: str
    price: float


class DummyAddress(BaseModel):
    street: str
    providers: List[str] | None = None
    wants_fiber: bool = False

    def model_dump(self, **kw):
        return super().model_dump(**kw)


class DummySettings:
    cache_ttl_seconds = 42


class FakeWebSocket:
    """Captures all send_json calls and close() codes."""

    def __init__(self):
        self.sent: List[dict] = []
        self.closed = False
        self.close_code: int | None = None

    async def send_json(self, d: dict):
        def _default(o):  # json fallback – handle any pydantic-ish obj
            return o.model_dump() if hasattr(o, "model_dump") else str(o)

        self.sent.append(json.loads(json.dumps(d, default=_default)))

    async def close(self, code: int = 1000):
        self.closed = True
        self.close_code = code


class DummyProvider:
    def __init__(self, name: str, offers: List[DummyOffer], delay=0.0):
        self.name = name
        self._offers = offers
        self._delay = delay
        self.client = None

    async def __call__(self, _addr):
        if self._delay:
            await asyncio.sleep(self._delay)
        return self._offers


class ServusStub(DummyProvider):
    """Marker subclass so isinstance(..., ServusSpeedProvider) passes."""


class DummyWsMessage:
    """Replacement for the Pydantic WsMessage – accepts any fields."""

    def __init__(self, **data):
        self._d = data

    def model_dump(self, exclude_none=False):
        if exclude_none:
            return {k: v for k, v in self._d.items() if v is not None}
        return dict(self._d)


class FakeAddrValidator:
    @staticmethod
    def validate_address(_addr):
        return {}  # patched per-test


# autouse patching
@pytest.fixture(autouse=True)
def _common_patches(monkeypatch):
    # light replacements
    monkeypatch.setattr(
        WS_MODULE, "WsCompareAddressRequest", DummyAddress, raising=True
    )
    monkeypatch.setattr(WS_MODULE, "Address", DummyAddress, raising=True)
    monkeypatch.setattr(WS_MODULE, "Offer", DummyOffer, raising=True)
    monkeypatch.setattr(WS_MODULE, "WsMessage", DummyWsMessage, raising=True)
    monkeypatch.setattr(WS_MODULE, "AddressValidator", FakeAddrValidator, raising=True)
    monkeypatch.setattr(WS_MODULE, "ServusSpeedProvider", ServusStub, raising=True)

    # default: *no* domain-level validation issues
    monkeypatch.setattr(
        FakeAddrValidator,
        "validate_address",
        staticmethod(lambda _addr: {}),
        raising=True,
    )

    # determinism helpers
    monkeypatch.setattr(
        WS_MODULE,
        "encode",
        lambda d: f"slug-{d['phase']}-{int(d['ts']*1000)}",
        raising=True,
    )
    monkeypatch.setattr(WS_MODULE, "merge_offers", lambda xs: xs, raising=True)

    async def _noop_cache_set(*_):
        pass

    monkeypatch.setattr(
        WS_MODULE, "cache_set", AsyncMock(side_effect=_noop_cache_set), raising=True
    )

    # shorter timeout keeps tests snappy
    monkeypatch.setattr(WS_MODULE, "PHASE_1_TIMEOUT", 0.01, raising=True)


# unit tests
@pytest.mark.asyncio
async def test_invalid_payload():
    ws = FakeWebSocket()
    await WS_MODULE.websocket_comparison_flow(ws, {}, DummySettings)
    assert ws.closed and ws.close_code == 1003
    assert ws.sent[0]["type"] == "ERROR"


@pytest.mark.asyncio
async def test_domain_validation_failure(monkeypatch):
    monkeypatch.setattr(
        FakeAddrValidator,
        "validate_address",
        staticmethod(lambda _a: {"street": "bad"}),
        raising=True,
    )
    ws = FakeWebSocket()
    payload = {"street": "Main", "providers": [], "wants_fiber": False}
    await WS_MODULE.websocket_comparison_flow(ws, payload, DummySettings)
    assert ws.closed and ws.close_code == 1003
    assert ws.sent[0]["type"] == "ERROR"
    assert "validation_issues" in ws.sent[0]


@pytest.mark.asyncio
async def test_no_providers(monkeypatch):
    monkeypatch.setattr(
        WS_MODULE, "get_providers", AsyncMock(return_value=[]), raising=True
    )
    ws = FakeWebSocket()
    payload = {"street": "Main", "providers": [], "wants_fiber": False}
    await WS_MODULE.websocket_comparison_flow(ws, payload, DummySettings)
    assert ws.closed
    assert ws.sent[0]["type"] == "ERROR"


@pytest.mark.asyncio
async def test_servus_only_shortcut(monkeypatch):
    # ensure validator passes for this scenario
    monkeypatch.setattr(
        FakeAddrValidator,
        "validate_address",
        staticmethod(lambda _a: {}),
        raising=True,
    )
    offers = [DummyOffer(id="s1", price=9.99)]
    servus = ServusStub("Servus", offers)

    async def _gp(names, wants_fiber):
        return [servus]

    monkeypatch.setattr(WS_MODULE, "get_providers", _gp, raising=True)
    ws = FakeWebSocket()
    payload = {"street": "Foo", "providers": [], "wants_fiber": False}
    await WS_MODULE.websocket_comparison_flow(ws, payload, DummySettings)

    assert not ws.closed
    assert ws.sent[-1]["type"] == "FINAL_OFFERS"
    assert ws.sent[-1]["offers"] == [o.model_dump() for o in offers]
    WS_MODULE.cache_set.assert_awaited_once()


@pytest.mark.asyncio
async def test_two_phase_flow(monkeypatch):
    # ensure validator passes
    monkeypatch.setattr(
        FakeAddrValidator,
        "validate_address",
        staticmethod(lambda _a: {}),
        raising=True,
    )
    fast_offers = [DummyOffer(id="f1", price=1)]
    serv_offers = [DummyOffer(id="s1", price=2)]

    fast = DummyProvider("Fast", fast_offers)
    servus = ServusStub("Servus", serv_offers, delay=0.05)

    async def _gp(names, wants_fiber):
        return [fast, servus]

    monkeypatch.setattr(WS_MODULE, "get_providers", _gp, raising=True)

    ws = FakeWebSocket()
    payload = {"street": "Bar", "providers": [], "wants_fiber": False}
    await WS_MODULE.websocket_comparison_flow(ws, payload, DummySettings)
    # let background cache_set tasks run
    await asyncio.sleep(0)

    initial, final = ws.sent
    assert initial["type"] == "INITIAL_OFFERS"
    assert initial["offers"] == [o.model_dump() for o in fast_offers]
    assert final["type"] == "FINAL_OFFERS"
    assert final["offers"] == [o.model_dump() for o in (*fast_offers, *serv_offers)]
    assert WS_MODULE.cache_set.await_count == 2


# property test for _ensure_domain_validity
issues_st = st.dictionaries(
    keys=st.text(min_size=1, max_size=3),
    values=st.text(min_size=1, max_size=5),
    max_size=3,
)


@given(issues=issues_st)
@settings(
    max_examples=60,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
    deadline=None,
)
def test_ensure_domain_validity_property(issues):
    FakeAddrValidator.validate_address = staticmethod(lambda _a: issues)
    ws = FakeWebSocket()
    ok = asyncio.run(WS_MODULE._ensure_domain_validity(ws, DummyAddress(street="x")))
    if issues:
        assert not ok and ws.closed and ws.sent[0]["type"] == "ERROR"
    else:
        assert ok and not ws.closed
