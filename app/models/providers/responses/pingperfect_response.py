from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, PositiveInt, constr, field_validator

from app.models.base.offer import VoucherKind, Offer


class PingPerfectResponse(BaseModel):
    """
    Pydantic model for PingPerfect API responses.

    Provides validated fields for provider data and transforms into an internal Offer.
    """

    provider_name: constr(strip_whitespace=True, min_length=1)
    product_id: constr(strip_whitespace=True, min_length=1)
    speed_down_mbit: PositiveInt
    connection_type: constr(strip_whitespace=True, min_length=1)
    data_cap_gb: Optional[PositiveInt]
    price_cents_month: Optional[PositiveInt]
    contract_duration_months: PositiveInt
    installation_service_included: bool
    tv_included: bool
    tv_package_name: Optional[constr(strip_whitespace=True, min_length=1)]
    voucher_type: Optional[VoucherKind]
    voucher_value_cents: Optional[PositiveInt]
    max_age: Optional[PositiveInt]

    @field_validator("provider_name", "product_id", "connection_type", mode="before")
    def must_not_be_blank(cls, v):
        """
        Ensure that a string field is not empty or whitespace.

        Args:
            v (Any): The value to validate.

        Returns:
            str: The stripped non-empty string.

        Raises:
            ValueError: If the input is blank or all whitespace.
        """
        s = str(v).strip()
        if not s:
            raise ValueError("must contain at least one non-whitespace character")
        return s

    @field_validator("connection_type", "tv_package_name", mode="before")
    def empty_string_to_none(cls, v):
        """
        Convert empty string values to None for optional fields.

        Args:
            v (Any): The input value.

        Returns:
            Optional[str]: None if the input is an empty string, otherwise the original value.
        """
        if v == "":
            return None
        return v

    @field_validator("speed_down_mbit", mode="before")
    def validate_speed_down_mbit(cls, v):
        """
        Validate and coerce the downstream speed to a positive integer.

        Args:
            v (Any): The raw speed value to validate.

        Returns:
            Optional[int]: Rounded positive integer speed, or None if invalid.
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
        Validate that numeric fields are positive integers.

        Args:
            v (Any): The raw numeric value.
            info (ModelField): Field metadata (ignored).

        Returns:
            Optional[int]: The integer value if positive, otherwise None.
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
        Convert this response into an internal Offer model.

        Args:
            provider_name (str): The name of the provider for the Offer.

        Returns:
            Offer: The constructed Offer instance.
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
