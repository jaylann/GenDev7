from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.base import VoucherKind, Offer
from app.models.validators import NonBlankStr, PosInt, OptStrClean, OptPosInt


class PingPerfectResponse(BaseModel):
    provider_name: NonBlankStr = Field(..., description="Marketing name of the plan")
    product_id: NonBlankStr = Field(
        ..., description="Provider-internal plan identifier"
    )
    speed_down_mbit: PosInt = Field(..., description="Downstream bandwidth (Mbit/s)")
    connection_type: NonBlankStr = Field(
        ..., description="Physical medium (DSL, Cable, Fiber, Mobile)"
    )
    data_cap_gb: OptPosInt = Field(None, description="Data cap in GB")
    price_cents_month: OptPosInt = Field(
        None, description="Introductory monthly price in cents"
    )
    contract_duration_months: PosInt = Field(
        ..., description="Minimum contract term in months"
    )
    installation_service_included: bool = Field(
        ..., description="Whether installation service is included"
    )
    tv_included: bool = Field(..., description="Whether TV is included")
    tv_package_name: OptStrClean = Field(
        None, description="Name of the TV package if included"
    )
    voucher_type: OptStrClean | VoucherKind = Field(
        None, description="Type of voucher/incentive"
    )
    voucher_value_cents: OptPosInt = Field(
        None, description="Absolute voucher value in cents or cashback amount"
    )
    max_age: OptPosInt = Field(
        None, description="Maximum customer age to qualify for voucher"
    )

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.provider_name,
            product_id=self.product_id,
            speed_down_mbit=self.speed_down_mbit,
            data_cap_gb=self.data_cap_gb,
            connection_type=self.connection_type,
            price_cents_month_intro=self.price_cents_month,
            price_cents_month_regular=self.price_cents_month,
            contract_duration_months=self.contract_duration_months,
            installation_service_included=self.installation_service_included,
            tv_included=self.tv_included,
            tv_package_name=self.tv_package_name,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            max_age=self.max_age,
        )
