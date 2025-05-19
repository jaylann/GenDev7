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
    """
    Pydantic model for VerbynDich API responses, validating and normalizing plan data.

    Includes custom validators for field cleaning and conversion to the internal Offer model.
    """

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
        """
        Clean the plan name by stripping whitespace and removing the 'verbyndich ' prefix.

        Raises:
            ValueError: If the resulting name is empty.
        """
        s = str(v).strip()
        prefix = "verbyndich "
        if s.lower().startswith(prefix):
            s = s[len(prefix) :].lstrip()
        if not s:
            raise ValueError("must contain at least one non-whitespace character")
        return s

    @field_validator("tv_package_name", mode="before")
    def empty_string_to_none(cls, v, info):
        """
        Convert empty TV package names to None for optional handling.

        Args:
            v (Any): The raw input value.

        Returns:
            Optional[str]: None if the input is an empty string, otherwise the original value.
        """
        if v == "":
            return None
        return v

    @field_validator("speed_down_mbit", mode="before")
    def validate_speed_down_mbit(cls, v):
        """
        Validate and normalize the download speed value.

        Attempts to convert the input to a positive integer, returning None on failure or non-positive values.

        Args:
            v (Any): The raw speed value.

        Returns:
            Optional[int]: The rounded positive integer speed, or None.
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
        Ensure multiple numeric fields are positive integers or set to None.

        Converts various input types to int, returning None for invalid or non-positive values.

        Args:
            v (Any): The raw input value.
        Returns:
            Optional[int]: A positive integer or None.
        """
        if v is None:
            return None
        try:
            int_v = int(v)
        except (TypeError, ValueError):
            try:
                int_v = int(float(v))
            except (TypeError, ValueError):
                return None
        if int_v <= 0:
            return None
        return int_v

    def to_offer(self, provider_name: str) -> Offer:
        """
        Convert this model into the internal Offer representation.

        Args:
            provider_name (str): Name of the provider for the generated Offer.

        Returns:
            Offer: An Offer instance populated with response data.
        """
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
