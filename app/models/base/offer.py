from __future__ import annotations

from enum import Enum
from typing import Optional, Literal

from pydantic import (BaseModel, Field, PositiveInt, field_validator, )


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
    speed_down_mbit: Optional[PositiveInt] = Field(
        None,
        description="Advertised downstream rate (Mbit/s)",
        examples=[70]
    )
    speed_up_mbit: Optional[PositiveInt] = Field(None, description="Advertised upstream rate (Mbit/s)", examples=[20])

    data_cap_gb: Optional[int] = Field(None, description="Monthly data cap in GB (None == flat rate)", examples=[300])

    connection_type: Optional[Literal["DSL", "Cable", "Fiber", "Mobile"]] = Field(
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

    contract_duration_months: Optional[PositiveInt] = Field(
        None,
        description="Minimum term",
        examples=[12, 24]
    )

    installation_service_included: Optional[bool] = Field(..., description="True if an on-site technician is free")
    installation_cost_cents: Optional[PositiveInt] = Field(None,
        description="One-off setup / activation fee (if not included)")

    # --- TV & Media ---------------------------------------------------------
    tv_included: Optional[bool] = Field(..., description="True if *any* TV product is bundled")
    tv_package_name: Optional[str] = Field(None, description="Name of bundled TV option",
                                           examples=["ByteLive Basic", "Ping TV Plus"])

    # --- Promotions & Audience ---------------------------------------------
    voucher_type: Optional[VoucherKind] = Field(None, description="Kind of voucher / incentive")
    voucher_value_cents: Optional[PositiveInt] = Field(None, description="Face value in cent for absolute types")
    voucher_value_percent: Optional[float] = Field(None, ge=0, le=100, description="Discount percentage (0 – 100)")
    voucher_min_order_value_cents: Optional[PositiveInt] = Field(
        None,
        description="Minimum order value in cents required to use the voucher",
        examples=[763],
    )

    max_age: Optional[int] = Field(None, description="Upper age limit for special youth / student tariffs",
        examples=[27])

    # -----------------------------------------------------------------------
    model_config = {"populate_by_name": True,  # allow “old” adapter field names to keep working
        "extra": "allow",  # ignore unexpected keys → forward compat
    }

    # --- Validators ---------------------------------------------------------
    @field_validator("connection_type", mode="before")
    @classmethod
    def _normalize_conn_type(cls, v: str | None) -> str | None:
        if v is None:
            return v
        mapping = {"dsl": "DSL", "cable": "Cable", "fiber": "Fiber", "fibEr": "Fiber", "mobile": "Mobile"}
        return mapping.get(v.lower(), v)

    @field_validator("tv_included", mode="before")
    @classmethod
    def _derive_tv_bool(cls, v, values):
        """
        Accept provider booleans **or** derive from *tv_package_name*.
        """
        if isinstance(v, bool):
            return v
        # Fall back to presence of a package name
        return bool(values.get("tv_package_name"))

    @field_validator("voucher_value_percent")
    @classmethod
    def _percent_requires_type(cls, v, values):
        """
        Ensure that a percentage value is accompanied by the correct voucher_type.
        """
        if v is not None:
            if values.data.get("voucher_type") not in {VoucherKind.PERCENTAGE, VoucherKind.DISCOUNT}:
                raise ValueError("voucher_value_percent set but voucher_type is not 'percentage' or 'discount'")
        return v
