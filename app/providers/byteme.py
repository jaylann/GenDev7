from __future__ import annotations

import os
from io import StringIO
from typing import List

import pandas as pd

from .base import ProviderBase, ProviderError
from ..models import Offer, Address

BYTEME_ENDPOINT = os.getenv("BYTEME_ENDPOINT", "https://byteme.gendev7.check24.fun/app/api/products/data", )
BYTEME_API_KEY = os.getenv("BYTEME_API_KEY", "REPLACE_ME")


class ByteMeProvider(ProviderBase):
    name = "ByteMe"

    async def fetch(self, address: Address) -> List[Offer]:
        params = {"street": address.street, "houseNumber": address.house_number, "city": address.city,
                  "plz": address.plz, }
        headers = {"X-Api-Key": BYTEME_API_KEY}

        try:
            resp = await self.client.get(BYTEME_ENDPOINT, params=params, headers=headers, timeout=10,
                                         # httpx default docs on timeouts.  :contentReference[oaicite:9]{index=9}
                                         )
            resp.raise_for_status()
        except Exception as exc:
            raise ProviderError(f"ByteMe download failed: {exc}") from exc

        # CSV → DataFrame → dedup → records   :contentReference[oaicite:10]{index=10}
        df = pd.read_csv(StringIO(resp.text), header=None)
        df.columns = ["productId", "providerName", "speed", "monthlyCostInCent", "afterTwoYearsMonthlyCost",
                      "durationInMonths", "connectionType", "installationService", "tv", "limitFrom", "maxAge",
                      "voucherType",
                      "voucherValue", ]
        df = df.drop_duplicates()

        offers: List[Offer] = []
        for row in df.itertuples(index=False):
            offers.append(
                Offer(provider=row.providerName or self.name, product_id=row.productId, speed_mbit=int(row.speed),
                      price_cents_month=int(row.monthlyCostInCent),
                      price_cents_month_after24=int(row.afterTwoYearsMonthlyCost),
                      duration_months=int(row.durationInMonths), connection_type=row.connectionType,
                      installation_service=bool(row.installationService), tv=bool(row.tv),
                      data_limit_gb=row.limitFrom if pd.notna(row.limitFrom) else None,
                      voucher=row.voucherValue if pd.notna(row.voucherValue) else None, ))

        return offers
