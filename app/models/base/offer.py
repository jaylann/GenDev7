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
from pydantic import PositiveFloat


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
    All speeds are **downstream** unless explicitly marked otherwise.
    """

    # --- Identification -----------------------------------------------------
    provider: str = Field(..., description="Company selling the tariff", examples=["ByteMe"])
    plan_name: str = Field(..., description="Marketing / commercial name of the plan",
                           examples=["Ultra 70", "Premium 200 Young"])
    product_id: str = Field(..., description="Provider-internal identifier", examples=["501", "PROD-1234"])

    # --- Performance --------------------------------------------------------
    speed_down_mbit: PositiveInt = Field(
        None,
        description="Advertised downstream rate (Mbit/s)",
        examples=[70]
    )

    data_cap_gb: Optional[PositiveInt] = Field(None, description="Monthly data cap in GB (None == flat rate)", examples=[300])

    connection_type: Literal["DSL", "Cable", "Fiber", "Mobile"] = Field(
        None,
        description="Physical access medium"
    )

    # --- Commercials --------------------------------------------------------
    price_cents_month_intro: Optional[PositiveInt] = Field(
        None,
        description="Price per month during the initial term / promo period"
    )

    price_cents_month_regular: Optional[PositiveInt] = Field(None,
        description="Price per month after *price_cents_month_intro* expires" )

    contract_duration_months: PositiveInt = Field(
        None,
        description="Minimum term",
        examples=[12, 24]
    )
    contract_regular_months: Optional[PositiveInt] = Field(
        12,
        description="Regular contract duration (after promo period)",
        examples=[12, 24]
    )

    installation_service_included: bool = Field(default=False, description="True if an on-site technician is free")

    # --- TV & Media ---------------------------------------------------------
    tv_included: Optional[bool] = Field(..., description="True if *any* TV product is bundled")
    tv_package_name: Optional[str] = Field(None, description="Name of bundled TV option",
                                           examples=["ByteLive Basic", "Ping TV Plus"])

    # --- Promotions & Audience ---------------------------------------------
    voucher_type: Optional[VoucherKind] = Field(None, description="Kind of voucher / incentive")
    voucher_value_cents: Optional[PositiveInt] = Field(None, description="Face value in cent for absolute types")
    voucher_value_percent: Optional[PositiveFloat] = Field(None, ge=0, le=100, description="Discount percentage (0 – 100)")
    voucher_min_order_value_cents: Optional[PositiveInt] = Field(
        None,
        description="Minimum order value in cents required to use the voucher",
        examples=[763],
    )
    voucher_max_value_cents: Optional[PositiveInt] = Field(
        None,
        description="Maximum value of the voucher in cents",
        examples=[1000],
    )
    voucher_max_runtime_months: Optional[PositiveInt] = Field(
        None,
        description="Maximum runtime of the voucher in months",
        examples=[12],
    )

    max_age: Optional[PositiveInt] = Field(None, description="Upper age limit for special youth / student tariffs",
        examples=[27])

    # -----------------------------------------------------------------------
    class Config:
        extra = "ignore"

    # --- Validators ---------------------------------------------------------
    @field_validator("connection_type", mode="before")
    @classmethod
    def _normalize_conn_type(cls, v: str) -> str:
        mapping = {"dsl": "DSL", "cable": "Cable", "fiber": "Fiber", "fibEr": "Fiber", "mobile": "Mobile"}
        return mapping.get(v.lower(), v)


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
        if values.tv_included is None:
            values.tv_included = bool(values.tv_package_name)
        return values

    @model_validator(mode="after")
    @classmethod
    def _ensure_price_present(cls, values: Offer) -> Offer:
        """
        Ensure that either price_cents_month_intro or price_cents_month_regular is provided.
        """
        if values.price_cents_month_intro is None and values.price_cents_month_regular is None:
            raise ValueError("Either price_cents_month_intro or price_cents_month_regular must be provided")
        return values
