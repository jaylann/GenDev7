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

    @classmethod
    def from_item(cls, item: Dict[str, Any]) -> Optional["PingPerfectResponse"]:
        info = item.get("productInfo")
        price = item.get("pricingDetails")
        if info is None or price is None:
            return None
        provider_name = item.get("providerName", "")
        speed_val = info.get("speed")
        term_val = info.get("contractDurationInMonths")
        product_uuid = uuid.uuid5(
            uuid.NAMESPACE_DNS,
            f"{provider_name}-{speed_val}-{term_val}",
        ).hex
        installation_raw = str(price.get("installationService", "")).strip().lower()
        installation_included = installation_raw in {"yes", "included", "true"}
        return cls(
            provider_name=provider_name,
            product_id=product_uuid,
            speed_down_mbit=int(speed_val) if speed_val is not None else None,
            connection_type=info.get("connectionType"),
            data_cap_gb=(
                int(info.get("limitFrom"))
                if info.get("limitFrom") is not None
                else None
            ),
            price_cents_month=(
                int(price.get("monthlyCostInCent"))
                if price.get("monthlyCostInCent")
                else None
            ),
            contract_duration_months=int(term_val) if term_val is not None else None,
            installation_service_included=installation_included,
            tv_included=bool(info.get("tv")),
            tv_package_name=info.get("tv"),
            voucher_type=None,
            voucher_value_cents=None,
            max_age=int(info.get("maxAge")) if info.get("maxAge") is not None else None,
        )

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
