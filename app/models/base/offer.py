from __future__ import annotations

from enum import Enum
from typing import Optional, Literal

from pydantic import (
    BaseModel,
    Field,
    PositiveInt,
    field_validator,
    model_validator,
)
from pydantic import NonNegativeFloat


class VoucherKind(str, Enum):
    """Canonical voucher / incentive categories we support."""

    ABSOLUTE = "absolute"  # e.g. 10 € cash-back
    PERCENTAGE = "percentage"  # e.g. 10 % off
    CASHBACK = "cashback"  # provider pays X € back after activation
    DISCOUNT = "discount"  # generic discount that doesn’t fit the others


class Offer(BaseModel):
    """
    A single tariff / plan that can be shown to the user.

    All monetary values are **cent‐accurate integers** (EUR-cent).
    """

    # --- Identification -----------------------------------------------------
    provider: str = Field(
        ..., description="Company selling the tariff", examples=["ByteMe"]
    )
    plan_name: str = Field(
        ...,
        description="Marketing / commercial name of the plan",
        examples=["Ultra 70", "Premium 200 Young"],
    )
    product_id: str = Field(
        ..., description="Provider-internal identifier", examples=["501", "PROD-1234"]
    )

    # --- Performance --------------------------------------------------------
    speed_down_mbit: PositiveInt = Field(
        ..., description="Advertised downstream rate (Mbit/s)", examples=[70]
    )

    data_cap_gb: Optional[PositiveInt] = Field(
        default=None,
        description="Monthly data cap in GB (None == flat rate)",
        examples=[300],
    )

    connection_type: Literal["DSL", "Cable", "Fiber", "Mobile"] = Field(
        ..., description="Physical access medium"
    )

    # --- Commercials --------------------------------------------------------
    price_cents_month_intro: Optional[PositiveInt] = Field(
        None, description="Price per month during the initial term / promo period"
    )

    price_cents_month_regular: Optional[PositiveInt] = Field(
        None, description="Price per month after *price_cents_month_intro* expires"
    )

    contract_duration_months: PositiveInt = Field(
        ..., description="Minimum term", examples=[12, 24]
    )
    contract_regular_months: Optional[PositiveInt] = Field(
        12,
        description="Regular contract duration (after promo period)",
        examples=[12, 24],
    )

    installation_service_included: bool = Field(
        default=False, description="True if an on-site technician is free"
    )

    # --- TV & Media ---------------------------------------------------------
    tv_included: Optional[bool] = Field(
        default=False, description="True if *any* TV product is bundled"
    )
    tv_package_name: Optional[str] = Field(
        default=None,
        description="Name of bundled TV option",
        examples=["ByteLive Basic", "Ping TV Plus"],
    )

    # --- Promotions & Audience ---------------------------------------------
    voucher_type: Optional[VoucherKind] = Field(
        default=None, description="Kind of voucher / incentive"
    )
    voucher_value_cents: Optional[PositiveInt] = Field(
        default=None, description="Face value in cent for absolute types"
    )
    voucher_value_percent: Optional[NonNegativeFloat] = Field(
        default=None, le=100, description="Discount percentage (0 – 100)"
    )
    voucher_min_order_value_cents: Optional[PositiveInt] = Field(
        default=None,
        description="Minimum order value in cents required to use the voucher",
        examples=[763],
    )
    voucher_max_value_cents: Optional[PositiveInt] = Field(
        default=None,
        description="Maximum value of the voucher in cents",
        examples=[1000],
    )
    voucher_max_runtime_months: Optional[PositiveInt] = Field(
        default=None,
        description="Maximum runtime of the voucher in months",
        examples=[12],
    )

    max_age: Optional[PositiveInt] = Field(
        default=None,
        description="Upper age limit for special youth / student tariffs",
        examples=[27],
    )

    # -----------------------------------------------------------------------
    class Config:
        extra = "ignore"

    # --- Validators ---------------------------------------------------------
    @field_validator(
        "speed_down_mbit",
        "data_cap_gb",
        "price_cents_month_intro",
        "price_cents_month_regular",
        "contract_duration_months",
        "contract_regular_months",
        "voucher_value_cents",
        "voucher_min_order_value_cents",
        "voucher_max_value_cents",
        "voucher_max_runtime_months",
        "max_age",
        mode="before",
    )
    @classmethod
    def _positive_int_to_none(cls, v, info):
        """
        Convert non-positive integer values to None for optional positive integer fields.
        """
        if v is not None and isinstance(v, int) and v <= 0:
            return None
        return v

    @field_validator("voucher_value_percent", mode="before")
    @classmethod
    def _nonneg_float_to_none(cls, v, info):
        """
        Convert negative float values to None for non-negative float fields.
        """
        if v is not None and isinstance(v, (int, float)) and v < 0:
            return None
        return v

    @field_validator("connection_type", mode="before")
    @classmethod
    def _normalize_conn_type(cls, v: str, info) -> str:
        if isinstance(v, str):
            mapping = {
                "dsl": "DSL",
                "cable": "Cable",
                "fiber": "Fiber",
                "mobile": "Mobile",
                "fibre": "Fiber",
            }
            return mapping.get(v.lower(), v)
        else:
            return v

    @field_validator("voucher_value_percent", mode="after")
    @classmethod
    def _percent_sets_voucher_type(cls, v, info):
        """
        If a percentage voucher value is provided, automatically set voucher_type to PERCENTAGE.
        """
        if v is not None:
            info.data["voucher_type"] = VoucherKind.PERCENTAGE
        return v

    @model_validator(mode="after")
    @classmethod
    def _derive_tv_included(cls, values: Offer) -> Offer:
        """
        Derive tv_included from tv_package_name if not explicitly set.
        """
        if (
            values.tv_package_name or values.tv_included
        ):  # If tv_package_name is truthy (not None, not empty string)
            values.tv_included = True
        else:  # If tv_package_name is None or empty
            values.tv_included = False
        return values

    @model_validator(mode="after")
    @classmethod
    def _ensure_price_present(cls, values: Offer) -> Offer:
        """
        Ensure that either price_cents_month_intro or price_cents_month_regular is provided.
        """
        if (
            values.price_cents_month_intro is None
            and values.price_cents_month_regular is None
        ):
            raise ValueError(
                "Either price_cents_month_intro or price_cents_month_regular must be provided"
            )
        return values

    @model_validator(mode="after")
    @classmethod
    def _validate_contract_regular_price(cls, values: Offer) -> Offer:
        """
        If contract_regular_months is provided and differs from contract_duration_months,
        ensure both price_cents_month_intro and price_cents_month_regular are provided.
        """
        if (
            values.contract_regular_months is not None
            and values.contract_regular_months != values.contract_duration_months
        ):
            if values.price_cents_month_intro is None or values.price_cents_month_regular is None:
                raise ValueError(
                    "Both price_cents_month_intro and price_cents_month_regular must be provided "
                    "when contract_regular_months differs from contract_duration_months"
                )
        return values
