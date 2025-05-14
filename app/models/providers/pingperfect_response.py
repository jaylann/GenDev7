from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from pydantic import BaseModel

from app.models.base.offer import VoucherKind, Offer


class PingPerfectResponse(BaseModel):
    provider_name: str
    product_id: str
    speed_down_mbit: Optional[int]
    connection_type: Optional[str]
    data_cap_gb: Optional[int]
    price_cents_month: Optional[int]
    contract_duration_months: Optional[int]
    installation_service_included: bool
    tv_included: bool
    tv_package_name: Optional[str]
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[int]
    max_age: Optional[int]

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.provider_name,
            product_id=self.product_id,
            speed_down_mbit=self.speed_down_mbit,
            speed_up_mbit=None,
            data_cap_gb=self.data_cap_gb,
            connection_type=self.connection_type,
            price_cents_month_intro=self.price_cents_month,
            price_cents_month_regular=self.price_cents_month,
            contract_duration_months=self.contract_duration_months,
            installation_service_included=self.installation_service_included,
            installation_cost_cents=None,
            tv_included=self.tv_included,
            tv_package_name=self.tv_package_name,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            max_age=self.max_age,
        )
