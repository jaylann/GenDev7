from typing import Optional

from pydantic import (
    BaseModel,
    PositiveInt,
    Field,
    constr,
    field_validator,
    PositiveFloat,
)

from app.models.base.offer import VoucherKind, Offer


class WebWunderResponse(BaseModel):
    """
    Response DTO from WebWunder; convertible into our domain Offer.
    """

    provider_name: constr(strip_whitespace=True, min_length=1) = Field(
        ..., description="Marketing name of the plan"
    )
    product_id: constr(strip_whitespace=True, min_length=1) = Field(
        ..., description="Provider-internal plan identifier"
    )
    speed_down_mbit: PositiveInt = Field(
        ..., description="Downstream bandwidth (Mbit/s)"
    )
    price_cents_month_intro: PositiveInt = Field(
        ..., description="Introductory monthly price in cents"
    )
    price_cents_month_regular: PositiveInt = Field(
        ..., description="Regular monthly price in cents after promo"
    )
    contract_duration_months: PositiveInt = Field(
        ..., description="Minimum contract term in months"
    )
    connection_type: constr(strip_whitespace=True, min_length=1) = Field(
        ..., description="Physical medium (DSL, Cable, Fiber, Mobile)"
    )
    voucher_type: Optional[VoucherKind] = Field(
        None, description="Type of voucher/incentive"
    )
    voucher_value_cents: Optional[PositiveInt] = Field(
        None, description="Absolute voucher value in cents or cashback amount"
    )
    voucher_value_percent: Optional[PositiveFloat] = Field(
        None, ge=0, le=100, description="Percentage voucher value (0–100%)"
    )
    voucher_min_order_value_cents: Optional[PositiveInt] = Field(
        None, description="Minimum order value in cents to apply voucher"
    )
    voucher_max_value_cents: Optional[PositiveInt] = Field(
        None, description="Maximum discount/applyable voucher value in cents"
    )

    @field_validator("voucher_value_percent", mode="before")
    def validate_positive_float_fields(cls, v, info):
        """
        Ensure positive integer fields are positive. If not, set to None to avoid validation error.
        """
        if v is None:
            return None
        try:
            float_v = float(v)
            epsilon = 1e-6
        except (TypeError, ValueError):
            return None
        if abs(float_v) < epsilon:
            return None
        return float_v

    @field_validator("voucher_type", mode="before")
    def empty_string_to_none(cls, v):
        if isinstance(v, str) and v == "":
            return None
        return v

    @field_validator("provider_name", "product_id", "connection_type", mode="before")
    def must_not_be_blank(cls, v):
        s = str(v).strip()
        if not s:
            raise ValueError("must contain at least one non-whitespace character")
        return s

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
        "price_cents_month_intro",
        "price_cents_month_regular",
        "contract_duration_months",
        "voucher_value_cents",
        "voucher_min_order_value_cents",
        "voucher_max_value_cents",
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

    def to_offer(self, provider: str) -> Offer:
        """
        Convert this response DTO into our core Offer model,
        carrying over all voucher fields.
        """
        return Offer(
            provider=provider,
            plan_name=self.provider_name,
            product_id=self.product_id,
            speed_down_mbit=self.speed_down_mbit,
            data_cap_gb=None,
            connection_type=self.connection_type,
            contract_regular_months=24,
            price_cents_month_intro=self.price_cents_month_intro,
            price_cents_month_regular=self.price_cents_month_regular,
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
