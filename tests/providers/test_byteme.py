import os

pytest_plugins = ("pytest_asyncio",)

# Set required environment variables so Settings() in config can initialize without missing fields
os.environ.setdefault("WEBWUNDER_API_KEY", "dummy")
os.environ.setdefault("BYTEME_API_KEY", "dummy")
# byteme_endpoint has a default, so env var is optional
os.environ.setdefault("PINGPERFECT_CLIENT_ID", "dummy")
os.environ.setdefault("PINGPERFECT_SECRET", "dummy")
os.environ.setdefault("SERVUSSPEED_USERNAME", "dummy")
os.environ.setdefault("SERVUSSPEED_PASSWORD", "dummy")
os.environ.setdefault("VERBYNDICH_API_KEY", "dummy")

import pytest
import httpx
import pandas as pd
from io import StringIO

# Adjust import paths to your project structure
from app.providers.byteme import ByteMeProvider, settings
from app.models import Address
from app.providers.base import ProviderError
from app.factories.byteme_factory import ByteMeOfferFactory


class FakeResponse:
    """
    A fake HTTP response for simulating httpx responses in tests.
    """
    def __init__(self, status_code=200, content=b"", text="", raise_exc=None):
        self.status_code = status_code
        self.content = content
        self._text = text
        self._raise_exc = raise_exc

    @property
    def text(self) -> str:
        return self._text

    def raise_for_status(self) -> None:
        if self._raise_exc:
            raise self._raise_exc


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch):
    """
    Override API key and endpoint on the provider settings for all tests.
    """
    monkeypatch.setattr(settings, "byteme_api_key", "test-api-key")
    monkeypatch.setattr(settings, "byteme_endpoint", "http://test-endpoint")


@pytest.fixture
def provider():
    """
    Provides a fresh ByteMeProvider for each test.
    """
    # Provide a default HTTP client for the provider
    client = httpx.AsyncClient()
    return ByteMeProvider(client=client)


@pytest.mark.asyncio
async def test_fetch_success(monkeypatch, provider, tmp_path):
    """
    Test that fetch() successfully parses a CSV response,
    calls the ByteMeOfferFactory, and writes a CSV file.
    """
    # Redirect working directory so file writes go to tmp_path
    monkeypatch.chdir(tmp_path)

    # Prepare a fake CSV payload
    csv_text = "foo,bar\nbaz,qux\n"
    fake_resp = FakeResponse(
        status_code=200,
        content=csv_text.encode("utf-8"),
        text=csv_text,
    )

    # Patch the HTTP client on the provider to return our fake response
    class FakeClient:
        async def get(self, url, params=None, headers=None, timeout=None):
            # Verify correct arguments
            assert url == settings.byteme_endpoint
            assert headers == {"X-Api-Key": settings.byteme_api_key}
            assert timeout == 10
            # Ensure params include required fields
            assert all(key in params for key in ("street", "houseNumber", "city", "plz"))
            return fake_resp

    provider.client = FakeClient()

    # Capture DataFrame and provider name passed to the factory
    captured = {}
    def fake_make_offers(df: pd.DataFrame, name: str) -> list:
        captured["df"] = df.copy()
        captured["name"] = name
        return ["offerA", "offerB"]

    monkeypatch.setattr(ByteMeOfferFactory, "make_offers", fake_make_offers)

    # Create a test address (include country_code) and call fetch
    addr = Address(street="Main St", house_number="1A", city="Testville", plz="12345", country_code="DE")
    offers = await provider.fetch(addr)

    # Verify the returned offers
    assert offers == ["offerA", "offerB"]

    # Verify the DataFrame contents
    df = captured["df"]
    assert list(df.columns) == ["foo", "bar"]
    assert df.iloc[0]["foo"] == "baz"
    assert captured["name"] == provider.name

    # Ensure the CSV file was written
    assert (tmp_path / "byteme_response.csv").exists()


@pytest.mark.asyncio
async def test_fetch_client_error(provider):
    """
    Test that a network or client error raises ProviderError.
    """
    network_error = httpx.HTTPError("Network down")

    class BrokenClient:
        async def get(self, *args, **kwargs):
            raise network_error

    provider.client = BrokenClient()
    # Include country_code
    addr = Address(street="X", house_number="Y", city="Z", plz="00000", country_code="DE")

    with pytest.raises(ProviderError) as excinfo:
        await provider.fetch(addr)
    assert "ByteMe download failed" in str(excinfo.value)


@pytest.mark.asyncio
async def test_fetch_http_status_error(provider):
    """
    Test that an HTTP status error during raise_for_status is wrapped in ProviderError.
    """
    status_exception = httpx.HTTPStatusError("Bad status", request=None, response=None)
    fake_resp = FakeResponse(status_code=500, content=b"", text="", raise_exc=status_exception)

    class FakeClient:
        async def get(self, *args, **kwargs):
            return fake_resp

    provider.client = FakeClient()
    addr = Address(street="X", house_number="Y", city="Z", plz="00000", country_code="DE")

    with pytest.raises(ProviderError) as excinfo:
        await provider.fetch(addr)
    assert "ByteMe download failed" in str(excinfo.value)
