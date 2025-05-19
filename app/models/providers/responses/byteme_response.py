from __future__ import annotations

from typing import Optional

from pydantic import (
    BaseModel,
    PositiveInt,
    NonNegativeFloat,
    Field,
    constr,
    field_validator,
)

from app.models import Offer
from app.models.base.offer import VoucherKind


class ByteMeResponse(BaseModel):
    """
    Data model for ByteMe API responses, mapping raw fields to a validated Pydantic model.

    Includes validators to clean and normalize input, and conversion to the internal Offer type.
    """
    provider_name: constr(strip_whitespace=True, min_length=1)
    product_id: constr(strip_whitespace=True, min_length=1)
    speed_down_mbit: PositiveInt
    price_cents_month_intro: Optional[PositiveInt] = Field(default=None)
    price_cents_month_regular: Optional[PositiveInt] = Field(default=None)
    contract_duration_months: PositiveInt
    connection_type: constr(strip_whitespace=True, min_length=1)
    installation_service_included: bool = False
    tv_included: bool = False
    tv_package_name: Optional[constr(strip_whitespace=True, min_length=1)]
    data_cap_gb: Optional[PositiveInt]
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[PositiveInt]
    voucher_value_percent: Optional[NonNegativeFloat]
    max_age: Optional[PositiveInt]

    @field_validator("provider_name", "product_id", "connection_type", mode="before")
    def must_not_be_blank(cls, v):
        """
        Validator to ensure required string fields contain non-whitespace characters.

        Raises:
            ValueError: If the input is empty or only whitespace.
        """
        s = str(v).strip()
        if not s:
            raise ValueError("must contain at least one non-whitespace character")
        return s

    @field_validator("tv_package_name", "voucher_type", mode="before")
    def empty_string_to_none(cls, v):
        """
        Validator to convert empty strings to None for optional string fields.

        Returns:
            Optional[str]: None if input is an empty string, otherwise the original value.
        """
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
        "price_cents_month_intro",
        "price_cents_month_regular",
        "contract_duration_months",
        "voucher_value_cents",
        "max_age",
        "data_cap_gb",
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
        """
        Convert this ByteMeResponse into the internal Offer model.

        Args:
            provider_name (str): Name of the provider context for the Offer.

        Returns:
            Offer: Populated Offer instance based on this response.
        """
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
