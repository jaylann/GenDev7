from __future__ import annotations

import json
import os
import time
from typing import List

from app.utils.hmac_sign import sign
from .base import ProviderBase, ProviderError
from ..models import Address, Offer

PP_ENDPOINT = os.getenv(
    "PINGPERFECT_ENDPOINT"
)
PP_CLIENT_ID = os.getenv("PINGPERFECT_CLIENT_ID", "REPLACE_ME")
PP_SECRET = os.getenv("PINGPERFECT_SECRET", "REPLACE_ME")


class PingPerfectProvider(ProviderBase):
    name = "Ping Perfect"

    async def fetch(self, address: Address) -> List[Offer]:
        body = {
            "street": address.street,
            "houseNumber": address.house_number,
            "plz": address.plz,
            "city": address.city,
            # let users toggle this in the future; DSL default for MVP
            "wantsFiber": False,
        }
        payload = json.dumps(body, separators=(",", ":"))
        ts = str(int(time.time()))

        headers = {
            "X-Client-Id": PP_CLIENT_ID,
            "X-Timestamp": ts,
            "X-Signature": sign(payload, ts, PP_SECRET),
            "Content-Type": "application/json",
        }

        try:
            resp = await self.client.post(PP_ENDPOINT, content=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            raise ProviderError(f"Ping Perfect failed: {exc}") from exc

        offers: List[Offer] = []
        for item in data:
            info = item["productInfo"]
            price = item["pricingDetails"]
            offers.append(
                Offer(
                    provider=item.get("providerName", self.name),
                    product_id=str(hash(payload + PP_CLIENT_ID)),
                    speed_mbit=info["speed"],
                    price_cents_month=price["monthlyCostInCent"],
                    price_cents_month_after24=price["monthlyCostInCent"],
                    duration_months=info["contractDurationInMonths"],
                    connection_type=info["connectionType"],
                    installation_service=price["installationService"] == "YES",
                    tv=info.get("tv") == "YES",
                    data_limit_gb=info.get("limitFrom"),
                    voucher=None,
                )
            )
        return offers
