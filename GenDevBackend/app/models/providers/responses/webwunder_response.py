from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.base import VoucherKind, Offer
from app.models.validators import (
    NonBlankStr,
    PosInt,
    OptStrClean,
    OptPosInt,
    OptPercent,
)


class WebWunderResponse(BaseModel):
    provider_name: NonBlankStr = Field(..., description="Marketing name of the plan")
    product_id: NonBlankStr = Field(
        ..., description="Provider-internal plan identifier"
    )
    speed_down_mbit: PosInt = Field(..., description="Downstream bandwidth (Mbit/s)")
    price_cents_month_intro: PosInt = Field(
        None, description="Introductory monthly price in cents"
    )
    price_cents_month_regular: OptPosInt = Field(
        ..., description="Regular monthly price in cents"
    )
    contract_duration_months: PosInt = Field(
        ..., description="Minimum contract term in months"
    )
    connection_type: NonBlankStr = Field(
        ..., description="Physical medium (DSL, Cable, Fiber, Mobile)"
    )

    voucher_type: OptStrClean | VoucherKind = Field(
        None, description="Type of voucher/incentive"
    )
    voucher_value_cents: OptPosInt = Field(
        None, description="Absolute voucher value in cents or cashback amount"
    )
    voucher_value_percent: OptPercent = Field(
        None, ge=0, le=100, description="Percentage voucher value (0–100%)"
    )
    voucher_min_order_value_cents: OptPosInt = Field(
        None, description="Minimum order value in cents to apply voucher"
    )
    voucher_max_value_cents: OptPosInt = Field(
        None, description="Maximum voucher value in cents"
    )

    def to_offer(self, provider: str) -> Offer:
        return Offer(
            provider=provider,
            plan_name=self.provider_name,
            product_id=self.product_id,
            speed_down_mbit=self.speed_down_mbit,
            data_cap_gb=None,
            connection_type=self.connection_type,
            contract_regular_months=24,
            price_cents_month_intro=self.price_cents_month_intro,
            price_cents_month_regular=self.price_cents_month_regular
            or self.price_cents_month_intro,
            contract_duration_months=self.contract_duration_months,
            installation_service_included=True,
            tv_included=False,
            tv_package_name=None,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            voucher_value_percent=self.voucher_value_percent,
            voucher_min_order_value_cents=self.voucher_min_order_value_cents,
            voucher_max_value_cents=self.voucher_max_value_cents,
            max_age=None,
        )
