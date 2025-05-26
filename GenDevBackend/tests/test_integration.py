# tests/test_integration_api.py
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.api.schemas import CompareResponse, SingleOfferShareResponse
from app.models import Offer
from main import app


# --------------------------------------------------------------------------- #
# Fixtures & monkey-patches                                                   #
# --------------------------------------------------------------------------- #


@pytest.fixture
def anyio_backend() -> str:
    """Force AnyIO to use asyncio only (avoids Trio import errors)."""
    return "asyncio"


@pytest.fixture(autouse=True)
def _patch_route_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Patch the helper symbols **inside** the http_compare route module
    (that’s where FastAPI bound them at import-time).
    """

    # -- a minimal but VALID Offer ----------------------------------------- #
    valid_offer = Offer(  # full validation passes
        provider="MockProvider",
        plan_name="Mock DSL 100",
        product_id="PROD-1",
        speed_down_mbit=100,
        connection_type="DSL",
        contract_duration_months=12,
        price_cents_month_regular=1999,
    )

    async def fake_get_comp(slug: str) -> CompareResponse:  # type: ignore[override]
        """Return a CompareResponse with one real Offer object."""
        return CompareResponse(slug=slug, offers=[valid_offer])

    async def fake_share(_req, _settings) -> SingleOfferShareResponse:  # type: ignore[override]
        """Return the new simple response model (shared_slug only)."""
        return SingleOfferShareResponse(shared_slug="dummy-shared-slug")

    monkeypatch.setattr(
        "app.api.routes.http_compare.get_comparison_by_slug", fake_get_comp
    )
    monkeypatch.setattr("app.api.routes.http_compare.generate_share_link", fake_share)


# --------------------------------------------------------------------------- #
# HTTP integration tests                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.anyio
async def test_compare_by_slug_returns_data() -> None:
    slug = "integration-slug"

    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.get(f"/compare/{slug}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == slug
    assert data["offers"], "offers list should not be empty"


@pytest.mark.anyio
async def test_generate_single_offer_share_link() -> None:
    payload = {"original_page_slug": "foo", "offer_key": "MockProvider:1"}

    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.post("/offers/share-link", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert "shared_slug" in data and data["shared_slug"]


# --------------------------------------------------------------------------- #
# WebSocket integration test                                                  #
# --------------------------------------------------------------------------- #


def test_compare_websocket_roundtrip() -> None:
    client = TestClient(app)

    minimal_address = {
        "street": "Boltzmannstraße",
        "house_number": "3",
        "city": "Garching bei München",
        "plz": "85748",
        "country_code": "DE",
    }

    with client.websocket_connect("/ws/compare") as ws:
        ws.send_json(minimal_address)
        first_msg = ws.receive_json()

    assert first_msg, "WebSocket response is empty"
    assert "type" in first_msg
