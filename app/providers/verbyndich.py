from __future__ import annotations

import os
import re
from typing import List

from .base import ProviderBase, ProviderError
from ..models import Address, Offer

VB_BASE = os.getenv("VERBYNDICH_BASE")
VB_API_KEY = os.getenv("VERBYNDICH_API_KEY")

# crude helpers
SPEED_RE = re.compile(r"(\d+)\s?Mbit", re.I)
PRICE_RE = re.compile(r"(\d+[,.]?\d*)\s?€")


class VerbynDichProvider(ProviderBase):
    name = "VerbynDich"

    async def fetch(self, address: Address) -> List[Offer]:
        page = 0
        offers: List[Offer] = []

        while True:
            body = f"{address.street};{address.house_number};{address.city};{address.plz}"
            params = {"apiKey": VB_API_KEY, "page": page}
            try:
                r = await self.client.post(VB_BASE, params=params, content=body)
                r.raise_for_status()
                data = r.json()
            except Exception as exc:
                raise ProviderError(f"VerbynDich failed: {exc}") from exc

            if not data["valid"]:
                break  # skip invalid blobs

            desc: str = data["description"]
            speed = int(SPEED_RE.search(desc).group(1)) if SPEED_RE.search(desc) else 16
            price_eur = PRICE_RE.search(desc)
            price_cents = int(float(price_eur.group(1).replace(",", ".")) * 100) if price_eur else 0

            offers.append(
                Offer(
                    provider=self.name,
                    product_id=data["product"],
                    speed_mbit=speed,
                    price_cents_month=price_cents,
                    price_cents_month_after24=price_cents,
                    duration_months=24,
                    connection_type="DSL",
                    installation_service=False,
                    tv="tv" in desc.lower(),
                    data_limit_gb=None,
                    voucher=None,
                )
            )
            if data["last"]:
                break
            page += 1

        return offers
