from __future__ import annotations

import os
from typing import List

from async_lru import alru_cache

from .base import ProviderBase, ProviderError
from ..models import Address, Offer

SS_BASE = os.getenv("SERVUSSPEED_BASE")
SS_USER = os.getenv("SERVUSSPEED_USERNAME")
SS_PASS = os.getenv("SERVUSSPEED_PASSWORD")

DETAILS_EP = f"{SS_BASE}/api/external/product-details"
AVAILABLE_EP = f"{SS_BASE}/api/external/available-products"


class ServusSpeedProvider(ProviderBase):
    name = "Servus Speed"

    async def fetch(self, address: Address) -> List[Offer]:
        req_body = {
            "address": {
                "strasse": address.street,
                "hausnummer": address.house_number,
                "postleitzahl": address.plz,
                "stadt": address.city,
                "land": address.country_code,
            }
        }

        try:
            # basic-auth is built-in to httpx
            auth = (SS_USER, SS_PASS)
            r = await self.client.post(AVAILABLE_EP, json=req_body, auth=auth)
            r.raise_for_status()
            product_ids = r.json()["availableProducts"]
        except Exception as exc:
            raise ProviderError(f"Servus Speed list failed: {exc}") from exc

        offers: List[Offer] = []
        for pid in product_ids:
            try:
                offers.append(await self._fetch_details(pid, req_body, auth))
            except Exception:
                # skip bad products but continue
                continue
        return offers

    @alru_cache(maxsize=128)  # async-aware LRU cache
    async def _fetch_details(self, pid: str, body, auth):
        r = await self.client.post(f"{DETAILS_EP}/{pid}", json=body, auth=auth)
        r.raise_for_status()
        prod = r.json()["servusSpeedProduct"]
        info = prod["productInfo"]
        price = prod["pricingDetails"]
        discount = prod["discount"] or 0

        return Offer(
            provider=prod["providerName"],
            product_id=pid,
            speed_mbit=info["speed"],
            price_cents_month=price["monthlyCostInCent"] - discount,
            price_cents_month_after24=price["monthlyCostInCent"],
            duration_months=info["contractDurationInMonths"],
            connection_type=info["connectionType"],
            installation_service=price["installationService"],
            tv=info.get("tv") == "YES",
            data_limit_gb=info.get("limitFrom"),
            voucher=None,
        )
