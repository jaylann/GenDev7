from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_validator

from app.models.base import VoucherKind, Offer
from app.models.validators import NonBlankStr, PosInt, OptStrClean, OptPosInt, OptPercent


class VerbynDichResponse(BaseModel):
    valid: bool
    last: bool

    price_cents_month: PosInt = Field(..., description="Introductory monthly price in cents")
    speed_down_mbit: PosInt
    contract_duration_months: PosInt
    max_age: OptPosInt = Field(None, description="Maximum customer age to qualify for voucher")
    contract_regular_months: OptPosInt = Field(
        None, description="Standard contract term in months (optional)"
    )

    voucher_type: OptStrClean | VoucherKind = Field(
        None, description="Type of voucher/incentive (optional)"
    )
    voucher_value_cents: OptPosInt = Field(
        None, description="Absolute voucher value in cents or cashback amount"
    )
    voucher_value_percent: OptPercent = Field(
        None, description="Percentage voucher value (0–100; optional)"
    )
    voucher_value_cap: OptPosInt = Field(
        None, description="Maximum voucher value cap in cents (optional)"
    )
    voucher_until_month: OptPosInt = Field(
        None, description="Voucher valid until month number (optional)"
    )

    connection_type: NonBlankStr
    tv_package_name: OptStrClean = Field(None, description="Name of the TV package if included")
    tv_included: bool = Field(..., description="Whether TV is included")
    data_cap_gb: OptPosInt = Field(None, description="Data cap in GB")

    promo_month: OptPosInt = Field(
        None, description="Number of promotional months (optional)"
    )
    promo_price_cents: OptPosInt = Field(
        None, description="Promotional monthly price in cents (optional)"
    )
    min_order_cents: OptPosInt = Field(
        None, description="Minimum order value in cents (optional)"
    )

    plan_name: NonBlankStr

    @field_validator("plan_name", mode="before")
    @classmethod
    def strip_prefix(cls, v: str) -> str:
        s = v.strip()
        prefix = "verbyndich "
        if s.lower().startswith(prefix):
            s = s[len(prefix) :].lstrip()
        if not s:
            raise ValueError("must contain at least one non-whitespace character")
        return s

    def to_offer(self, provider_name: str) -> Offer:
        return Offer(
            provider=provider_name,
            plan_name=self.plan_name,
            product_id=str(uuid.uuid4()),
            speed_down_mbit=self.speed_down_mbit,
            connection_type=self.connection_type,
            price_cents_month_intro=self.price_cents_month,
            price_cents_month_regular=self.promo_price_cents or self.price_cents_month,
            contract_duration_months=self.contract_duration_months,
            installation_service_included=False,
            voucher_max_runtime_months=self.voucher_until_month,
            tv_included=self.tv_included,
            voucher_max_value_cents=self.voucher_value_cap,
            tv_package_name=self.tv_package_name,
            data_cap_gb=self.data_cap_gb,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            voucher_min_order_value_cents=self.min_order_cents,
            voucher_value_percent=self.voucher_value_percent,
            max_age=self.max_age,
            contract_regular_months=self.contract_regular_months,
        )
