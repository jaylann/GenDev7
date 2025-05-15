from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel

from app.models.base.offer import VoucherKind, Offer


class VerbynDichResponse(BaseModel):
    description: str
    product: str
    valid: bool
    last: bool

    price_cents_month: int
    speed_down_mbit: int
    contract_duration_months: int
    max_age: Optional[int]
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[int]
    voucher_value_percent: Optional[float]
    voucher_value_cap: Optional[float]
    connection_type: str
    tv_package_name: Optional[str]
    tv_included: bool
    data_cap_gb: Optional[int]

    promo_month: Optional[int]
    promo_price_cents: Optional[int]
    min_order_cents: Optional[int]
    plan_name: str

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.plan_name,
            product_id=self.product,
            speed_down_mbit=self.speed_down_mbit,
            connection_type=self.connection_type,
            price_cents_month_intro=self.price_cents_month,
            price_cents_month_regular=self.promo_price_cents or self.price_cents_month,
            contract_duration_months=self.contract_duration_months,
            installation_service_included=False,
            installation_cost_cents=None,
            tv_included=self.tv_included,
            voucher_max_value_cents=self.voucher_value_cap,
            tv_package_name=self.tv_package_name,
            data_cap_gb=self.data_cap_gb,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            voucher_min_order_value_cents=self.min_order_cents,
            voucher_value_percent=self.voucher_value_percent,
            max_age=self.max_age,
        )
