from __future__ import annotations

from typing import Dict, Any, Optional

from pydantic import BaseModel

from app.models.base.offer import VoucherKind, Offer


class ServusSpeedResponse(BaseModel):
    provider_name: str
    product_id: str
    speed_down_mbit: int
    data_cap_gb: Optional[int]
    connection_type: str
    price_cents_month: int
    contract_duration_months: int
    installation_service_included: bool
    tv_included: bool
    tv_package_name: Optional[str]
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[int]
    max_age: Optional[int]

    @classmethod
    def from_json(cls, pid: str, payload: Dict[str, Any]) -> "ServusSpeedResponse":
        prod = payload["servusSpeedProduct"]
        info = prod["productInfo"]
        price = prod["pricingDetails"]
        discount = int(prod.get("discount") or 0)
        return cls(
            provider_name=prod["providerName"],
            product_id=pid,
            speed_down_mbit=int(info["speed"]),
            data_cap_gb=info.get("limitFrom"),
            connection_type=info["connectionType"],
            price_cents_month=int(price["monthlyCostInCent"]),
            contract_duration_months=int(info["contractDurationInMonths"]),
            installation_service_included=bool(price.get("installationService", False)),
            tv_included=bool(info.get("tv")),
            tv_package_name=info.get("tv"),
            voucher_type=VoucherKind.ABSOLUTE if discount else None,
            voucher_value_cents=discount or None,
            max_age=info.get("maxAge"),
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
