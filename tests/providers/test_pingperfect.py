import os

pytest_plugins = ("pytest_asyncio",)

# Ensure required env vars for settings
os.environ.setdefault("WEBWUNDER_API_KEY", "dummy")
os.environ.setdefault("BYTEME_API_KEY", "dummy")
os.environ.setdefault("PINGPERFECT_CLIENT_ID", "dummy")
os.environ.setdefault("PINGPERFECT_SECRET", "dummy")
os.environ.setdefault("SERVUSSPEED_USERNAME", "dummy")
os.environ.setdefault("SERVUSSPEED_PASSWORD", "dummy")
os.environ.setdefault("VERBYNDICH_API_KEY", "dummy")

import pytest
import httpx

# Adjust imports to match project structure
from app.providers.pingperfect import PingPerfectProvider, settings
from app.models import Address, Offer
from app.providers.base import ProviderError
from app.factories.pingperfect_factory import PingPerfectFactory
from app.core.retry_config import RetryConfig


def make_fake_response(raw_items, status_code=200, raise_exc=None):
    """
    Creates a fake HTTPX response object with a .json() method.
    """

    class FakeResp:
        def __init__(self):
            self.status_code = status_code
            self._raw = raw_items
            self._exc = raise_exc

        def raise_for_status(self):
            if self._exc:
                raise self._exc

        def json(self):
            return self._raw

    return FakeResp()


@pytest.fixture
def provider():
    """
    Provides a PingPerfectProvider instance with default client and retry_config.
    """
    client = httpx.AsyncClient()
    retry_cfg = RetryConfig(max_retries=0, backoff_factor=0)
    return PingPerfectProvider(client=client, retry_config=retry_cfg, wants_fiber=True)


@pytest.mark.asyncio
async def test_fetch_success(monkeypatch, provider):
    """
    When the HTTP POST succeeds, PingPerfectFactory.build_payload, .parse_responses,
    and each PingPerfectResponse.to_offer() should be called to produce offers.
    """
    # Prepare raw JSON items and fake responses
    raw_items = [{"id": 1}, {"id": 2}, {"id": 3}]
    fake_resp = make_fake_response(raw_items)

    # Patch build_payload to return dummy payload and headers
    captured = {}

    def fake_build_payload(address, wants_fiber):
        captured["address"] = address
        captured["wants_fiber"] = wants_fiber
        return ("{}", {"X-API": "key"})

    monkeypatch.setattr(PingPerfectFactory, "build_payload", fake_build_payload)

    # Patch client.post to return our fake response
    class FakeClient:
        async def post(self, url, content=None, headers=None, timeout=None):
            assert url == settings.pingperfect_endpoint
            assert headers == {"X-API": "key"}
            assert timeout == 10
            return fake_resp

    provider.client = FakeClient()

    # Create dummy PingPerfectResponse-like objects with to_offer()
    class DummyResp:
        def __init__(self, idx: int):
            self.id = idx

        def to_offer(self, provider_name: str) -> Offer:
            return Offer(
                id=self.id,
                provider=provider_name,
                details={},
                plan_name=f"plan_{self.id}",
                product_id=f"prod_{self.id}",
                installation_service_included=False,
                tv_included=False,
            )

    dummy_responses = [DummyResp(idx) for idx in [1, 2, 3]]
    # Monkey-patch parse_responses to return our dummy objects
    monkeypatch.setattr(
        PingPerfectFactory, "parse_responses", lambda items: dummy_responses
    )

    # Expected offers from dummy responses
    expected_offers = [resp.to_offer(provider.name) for resp in dummy_responses]

    # Run fetch
    addr = Address(
        street="A", house_number="1", city="C", plz="00000", country_code="DE"
    )
    result = await provider.fetch(addr)

    # Assertions
    assert captured["address"] == addr
    assert captured["wants_fiber"] == True
    assert result == expected_offers


@pytest.mark.asyncio
async def test_fetch_client_error(provider):
    """
    If the HTTP client throws an exception, it should be wrapped in ProviderError.
    """
    err = httpx.HTTPError("fail")

    class BrokenClient:
        async def post(self, *args, **kwargs):
            raise err

    provider.client = BrokenClient()
    addr = Address(
        street="X", house_number="Y", city="Z", plz="00000", country_code="DE"
    )

    with pytest.raises(ProviderError) as excinfo:
        await provider.fetch(addr)
    assert "Ping Perfect failed" in str(excinfo.value)


@pytest.mark.asyncio
async def test_fetch_http_status_error(provider):
    """
    If status code is non-200 and raise_for_status errors, wrap in ProviderError.
    """
    status_exc = httpx.HTTPStatusError("bad status", request=None, response=None)
    fake_resp = make_fake_response([], raise_exc=status_exc)

    class FakeClient2:
        async def post(self, *args, **kwargs):
            return fake_resp

    provider.client = FakeClient2()
    addr = Address(
        street="X", house_number="Y", city="Z", plz="00000", country_code="DE"
    )

    with pytest.raises(ProviderError) as excinfo:
        await provider.fetch(addr)
    assert "Ping Perfect failed" in str(excinfo.value)
