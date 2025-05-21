from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.base.offer import VoucherKind, Offer
from app.utils import NonBlankStr, PosInt, OptStrClean, OptPosInt, OptPercent


class ByteMeResponse(BaseModel):
    provider_name: NonBlankStr = Field(..., description="Marketing name of the plan")
    product_id: NonBlankStr = Field(..., description="Provider-internal plan identifier")
    speed_down_mbit: PosInt = Field(..., description="Downstream bandwidth (Mbit/s)")
    price_cents_month_intro: OptPosInt = Field(default=None, description="Introductory monthly price in cents")
    price_cents_month_regular: OptPosInt = Field(default=None, description="Regular monthly price in cents")
    contract_duration_months: PosInt = Field(..., description="Minimum contract term in months")
    connection_type: NonBlankStr = Field(..., description="Physical medium (DSL, Cable, Fiber, Mobile)")
    installation_service_included: bool = Field(default=False, description="Whether installation service is included")
    tv_included: bool = Field(default=False, description="Whether TV is included")
    tv_package_name: OptStrClean = Field(default=None, description="Name of the TV package if included")
    data_cap_gb: OptPosInt = Field(default=None, description="Data cap in GB")
    voucher_type: OptStrClean | VoucherKind = Field(default=None, description="Type of voucher/incentive")
    voucher_value_cents: OptPosInt = Field(default=None, description="Absolute voucher value in cents or cashback amount")
    voucher_value_percent: OptPercent = Field(default=None, description="Percentage voucher value (0–100%)")
    max_age: OptPosInt = Field(default=None, description="Maximum customer age to qualify for voucher")

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.provider_name,
            product_id=self.product_id,
            speed_down_mbit=self.speed_down_mbit,
            price_cents_month_intro=self.price_cents_month_intro,
            price_cents_month_regular=self.price_cents_month_regular,
            contract_duration_months=self.contract_duration_months,
            contract_regular_months=24,
            connection_type=self.connection_type,
            installation_service_included=self.installation_service_included,
            tv_included=self.tv_included,
            tv_package_name=self.tv_package_name,
            data_cap_gb=self.data_cap_gb,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            voucher_value_percent=self.voucher_value_percent,
            max_age=self.max_age,
        )