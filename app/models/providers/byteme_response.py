from __future__ import annotations

from typing import Optional

import pandas as pd

# ───────────────────────────────────────────────────────────────────────────────
# Response model and helpers for ByteMe
# ───────────────────────────────────────────────────────────────────────────────
from pydantic import BaseModel

from app.models import Offer


class ByteMeResponse(BaseModel):
    provider_name: str
    product_id: str
    speed_down_mbit: int
    price_cents_month_intro: int
    price_cents_month_regular: int
    contract_duration_months: int
    connection_type: str
    installation_service_included: bool
    tv_included: bool
    tv_package_name: Optional[str]
    data_cap_gb: Optional[int]
    voucher_type: Optional[str]
    voucher_value_cents: Optional[int]
    voucher_value_percent: Optional[float]
    max_age: Optional[int]

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.provider_name,
            product_id=self.product_id,
            speed_down_mbit=self.speed_down_mbit,
            price_cents_month_intro=self.price_cents_month_intro,
            price_cents_month_regular=self.price_cents_month_regular,
            contract_duration_months=self.contract_duration_months,
            connection_type=self.connection_type,
            installation_service_included=self.installation_service_included,
            installation_cost_cents=None,
            tv_included=self.tv_included,
            tv_package_name=self.tv_package_name,
            data_cap_gb=self.data_cap_gb,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            voucher_value_percent=self.voucher_value_percent,
            max_age=self.max_age,
        )
