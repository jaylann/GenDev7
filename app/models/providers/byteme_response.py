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
    max_age: Optional[int]

    @classmethod
    def from_tuple(cls, row) -> Optional["ByteMeResponse"]:
        # skip rows without a valid intro price
        if pd.isna(row.monthlyCostInCent):
            return None
        tv_pkg = row.tv if isinstance(row.tv, str) and row.tv.strip() else None
        return cls(
            provider_name=row.providerName,
            product_id=str(int(row.productId)),
            speed_down_mbit=int(round(row.speed)),
            price_cents_month_intro=int(row.monthlyCostInCent),
            price_cents_month_regular=int(row.afterTwoYearsMonthlyCost),
            contract_duration_months=int(row.durationInMonths),
            connection_type=row.connectionType,
            installation_service_included=row.installationService,
            tv_included=bool(row.tv),
            tv_package_name=tv_pkg,
            data_cap_gb=int(row.limitFrom) if pd.notna(row.limitFrom) else None,
            voucher_type=row.voucherType if pd.notna(row.voucherType) else None,
            voucher_value_cents=(
                int(row.voucherValue) if pd.notna(row.voucherValue) else None
            ),
            max_age=int(row.maxAge) if pd.notna(row.maxAge) else None,
        )

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
            max_age=self.max_age,
        )
