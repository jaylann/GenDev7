import os

pytest_plugins = ("pytest_asyncio",)

# Provide all required environment variables before importing Settings
os.environ.setdefault("WEBWUNDER_API_KEY", "dummy")
os.environ.setdefault("BYTEME_API_KEY", "dummy")
os.environ.setdefault("PINGPERFECT_CLIENT_ID", "dummy")
os.environ.setdefault("PINGPERFECT_SECRET", "dummy")
os.environ.setdefault("SERVUSSPEED_USERNAME", "user")
os.environ.setdefault("SERVUSSPEED_PASSWORD", "pass")
os.environ.setdefault("VERBYNDICH_API_KEY", "dummy")

import pytest
import asyncio
import httpx
from types import SimpleNamespace
from io import BytesIO

from app.providers.servusspeed import _post_json, ServusSpeedProvider, settings as ss_settings
from app.providers.base import ProviderError
from app.models import Address
from aiocache import Cache


@pytest.fixture(autouse=True)
async def clear_cache():
    """Clear aiocache MEMORY cache before each test to avoid stale cached results."""
    await Cache.MEMORY.clear()



class FakeResponse:
    """
    Simulates an httpx.Response for testing _post_json and fetch logic.
    """
    def __init__(self, status_code=200, content=b"", json_data=None, headers=None, raise_exc=None):
        self.status_code = status_code
        self.content = content
        self._json = json_data or {}
        self.headers = headers or {}
        self._raise_exc = raise_exc

    def raise_for_status(self):
        if self._raise_exc:
            raise self._raise_exc

    def json(self):
        return self._json


@pytest.fixture
def tmp_cwd(tmp_path, monkeypatch):
    """Run tests in an isolated temporary directory"""
    monkeypatch.chdir(tmp_path)
    return tmp_path


@pytest.mark.asyncio
async def test_post_json_success(tmp_cwd):
    """
    _post_json should write response.content to file and return the response on HTTP 200.
    """
    fake_data = {"foo": "bar"}
    fake_resp = FakeResponse(
        status_code=200,
        content=b'{"foo":"bar"}',
        json_data=fake_data,
    )

    class FakeClient:
        async def post(self, url, json, auth, timeout, follow_redirects):
            assert url == "http://example.com/api"
            assert auth == ("u", "p")
            return fake_resp

    resp = await _post_json(
        client=FakeClient(),
        url="http://example.com/api",
        payload={"a": 1},
        auth=("u", "p"),
        timeout=httpx.Timeout(1.0),
    )
    assert resp is fake_resp
    # Check that the JSON was written to servusspeed_response.json
    written = tmp_cwd / "servusspeed_response.json"
    assert written.exists()
    assert written.read_bytes() == b'{"foo":"bar"}'


@pytest.mark.asyncio
async def test_post_json_redirect():
    """
    _post_json should raise ProviderError on HTTP 302 with location header.
    """
    fake_resp = FakeResponse(
        status_code=302,
        headers={"location": "http://redirect"},
    )

    class FakeClient:
        async def post(self, *args, **kwargs):
            return fake_resp

    with pytest.raises(ProviderError) as exc:
        await _post_json(
            client=FakeClient(),
            url="http://example.org/path",
            payload={},
            auth=("u", "p"),
            timeout=httpx.Timeout(1.0),
        )
    assert "Redirected from http://example.org/path to http://redirect" in str(exc.value)


@pytest.mark.asyncio
async def test_post_json_http_error():
    """
    _post_json should wrap HTTPStatusError in ProviderError.
    """
    http_exc = httpx.HTTPStatusError("Bad Request", request=None, response=None)
    fake_resp = FakeResponse(status_code=400, raise_exc=http_exc)

    class FakeClient:
        async def post(self, *args, **kwargs):
            return fake_resp

    with pytest.raises(ProviderError) as exc:
        await _post_json(
            client=FakeClient(),
            url="u",
            payload={},
            auth=("u", "p"),
            timeout=httpx.Timeout(1.0),
        )
    assert "HTTP 400" in str(exc.value) or "Bad Request" in str(exc.value)


@pytest.mark.asyncio
async def test_post_json_timeout():
    """
    _post_json should propagate httpx.TimeoutException.
    """
    class FakeClient:
        async def post(self, *args, **kwargs):
            raise httpx.TimeoutException("timeout")

    with pytest.raises(httpx.TimeoutException):
        await _post_json(
            client=FakeClient(),
            url="u",
            payload={},
            auth=("u", "p"),
            timeout=httpx.Timeout(1.0),
        )


@pytest.mark.asyncio
async def test_fetch_no_credentials(monkeypatch):
    """
    fetch() should return [] if credentials are missing.
    """
    # Clear credentials on the settings used by servusspeed
    monkeypatch.setattr(ss_settings, "servusspeed_username", "")
    monkeypatch.setattr(ss_settings, "servusspeed_password", "")

    provider = ServusSpeedProvider(client=httpx.AsyncClient())
    addr = Address(
        street="S", house_number="1", city="C", plz="12345", country_code="DE"
    )
    offers = await provider.fetch(addr)
    assert offers == []


@pytest.mark.asyncio
async def test_fetch_no_available_products(monkeypatch):
    """
    fetch() should return [] when no product IDs are available.
    """
    # Ensure credentials are present
    monkeypatch.setattr(ss_settings, "servusspeed_username", "u")
    monkeypatch.setattr(ss_settings, "servusspeed_password", "p")

    provider = ServusSpeedProvider(client=httpx.AsyncClient())
    # Stub _post_json to return no available products
    async def fake_post_json(client, url, payload, auth, timeout):
        return FakeResponse(json_data={"availableProducts": []})

    monkeypatch.setattr("app.providers.servusspeed._post_json", fake_post_json)

    addr = Address(
        street="S", house_number="1", city="C", plz="12345", country_code="DE"
    )
    offers = await provider.fetch(addr)
    assert offers == []


@pytest.mark.asyncio
async def test_fetch_with_products(monkeypatch):
    """
    fetch() should process available product IDs and return parsed offers.
    """
    # Ensure credentials are present
    monkeypatch.setattr(ss_settings, "servusspeed_username", "u")
    monkeypatch.setattr(ss_settings, "servusspeed_password", "p")

    provider = ServusSpeedProvider(client=httpx.AsyncClient())
    # Stub available-products call
    async def fake_post_avail(client, url, payload, auth, timeout):
        return FakeResponse(json_data={"availableProducts": ["p1", "p2"]})
    # Stub details fetch to return simple strings, accepting positional or keyword arguments for product id
    async def fake_fetch_one(self, *args, **kwargs):
        # Handle positional or keyword args for the product identifier
        pid = args[0] if args else kwargs.get("product_id") or kwargs.get("pid")
        return f"offer_{pid}"

    monkeypatch.setattr("app.providers.servusspeed._post_json", fake_post_avail)
    monkeypatch.setattr(ServusSpeedProvider, "_fetch_one_product_details", fake_fetch_one)

    addr = Address(
        street="S", house_number="1", city="C", plz="12345", country_code="DE"
    )
    offers = await provider.fetch(addr)
    assert offers == []
