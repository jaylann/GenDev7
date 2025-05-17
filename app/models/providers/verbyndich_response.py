from __future__ import annotations

import uuid
from typing import Optional

from pydantic import (
    BaseModel,
    PositiveInt,
    NonNegativeFloat,
    constr,
    field_validator,
)

from app.models.base.offer import VoucherKind, Offer


class VerbynDichResponse(BaseModel):
    valid: bool
    last: bool

    price_cents_month: PositiveInt
    speed_down_mbit: PositiveInt
    contract_duration_months: PositiveInt
    max_age: Optional[PositiveInt]
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[PositiveInt]
    voucher_value_percent: Optional[NonNegativeFloat]
    voucher_value_cap: Optional[PositiveInt]
    voucher_until_month: Optional[PositiveInt]
    connection_type: constr(strip_whitespace=True, min_length=1)
    tv_package_name: Optional[constr(strip_whitespace=True, min_length=1)]
    tv_included: bool
    data_cap_gb: Optional[PositiveInt]

    promo_month: Optional[PositiveInt]
    promo_price_cents: Optional[PositiveInt]
    min_order_cents: Optional[PositiveInt]
    plan_name: constr(strip_whitespace=True, min_length=1)

    @field_validator("plan_name", mode="before")
    def must_not_be_blank(cls, v):
        s = str(v).strip()
        # Remove leading "verbyndich " prefix if present (case-insensitive)
        prefix = "verbyndich "
        if s.lower().startswith(prefix):
            s = s[len(prefix) :].lstrip()
        if not s:
            raise ValueError("must contain at least one non-whitespace character")
        return s

    @field_validator("tv_package_name", mode="before")
    def empty_string_to_none(cls, v, info):
        if v == "":
            return None
        return v

    @field_validator("speed_down_mbit", mode="before")
    def validate_speed_down_mbit(cls, v):
        """
        Ensure speed_down_mbit is a positive integer.
        """
        if v is None:
            return None
        try:
            int_v = int(round(float(v)))
        except (TypeError, ValueError):
            return None
        if int_v <= 0:
            return None
        return int_v

    @field_validator(
        "contract_duration_months",
        "max_age",
        "voucher_value_cents",
        "voucher_until_month",
        "promo_month",
        "promo_price_cents",
        "min_order_cents",
        "data_cap_gb",
        "price_cents_month",
        "voucher_value_cap",
        mode="before",
    )
    def validate_positive_int_fields(cls, v, info):
        """
        Ensure positive integer fields are positive. If not, set to None to avoid validation error.
        """
        if v is None:
            return None
        try:
            int_v = int(v)
        except (TypeError, ValueError):
            # if that fails, try float→int
            try:
                int_v = int(float(v))
            except (TypeError, ValueError):
                return None
        if int_v <= 0:
            return None
        return int_v

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
        )
