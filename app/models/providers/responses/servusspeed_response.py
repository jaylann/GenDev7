from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, PositiveInt, constr, field_validator

from app.models.base.offer import VoucherKind, Offer


class ServusSpeedResponse(BaseModel):
    """
    Data model for ServusSpeed API responses, mapping raw fields to the internal Offer model.

    Includes validators to normalize optional fields and ensure integer conversion where needed.
    """

    provider_name: constr(strip_whitespace=True, min_length=1)
    product_id: constr(strip_whitespace=True, min_length=1)
    speed_down_mbit: PositiveInt
    data_cap_gb: Optional[PositiveInt]
    connection_type: constr(strip_whitespace=True, min_length=1)
    price_cents_month: Optional[PositiveInt] = None
    contract_duration_months: PositiveInt
    installation_service_included: bool
    tv_included: bool
    tv_package_name: Optional[constr(strip_whitespace=True, min_length=1)]
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[PositiveInt]
    max_age: Optional[PositiveInt]

    @field_validator("tv_package_name", "voucher_type", mode="before")
    def empty_string_to_none(cls, v):
        """
        Convert empty string inputs to None for optional fields.

        Args:
            v (Any): The incoming value.

        Returns:
            Optional[str]: None if the input was an empty string, otherwise the original value.
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
        "price_cents_month",
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
        # try direct integer conversion
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
        Convert this response into an internal Offer instance.

        Args:
            provider_name (str): Name of the provider for context.

        Returns:
            Offer: Populated Offer object based on this response data.
        """
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
