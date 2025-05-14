from typing import Optional

from pydantic import BaseModel

from app.models.base.offer import VoucherKind, Offer


class WebWunderResponse(BaseModel):
    provider_name: str
    product_id: str
    speed_down_mbit: int
    price_cents_month_intro: int
    price_cents_month_regular: int
    contract_duration_months: int
    connection_type: str
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[int]
    voucher_min_order_value_cents: Optional[int]

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.provider_name,
            product_id=self.product_id,
            speed_down_mbit=self.speed_down_mbit,
            speed_up_mbit=None,
            data_cap_gb=None,
            connection_type=self.connection_type,
            price_cents_month_intro=self.price_cents_month_intro,
            price_cents_month_regular=self.price_cents_month_regular,
            contract_duration_months=self.contract_duration_months,
            installation_service_included=True,
            installation_cost_cents=None,
            tv_included=False,
            tv_package_name=None,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            voucher_min_order_value_cents=self.voucher_min_order_value_cents,
            voucher_value_percent=None,
            max_age=None,
        )
