from __future__ import annotations

from typing import Optional, Literal

from pydantic import (
    BaseModel,
    Field,
    field_validator,
    model_validator,
)

from app.models.base.voucher_kind import VoucherKind
from app.models.validators import (
    OptPosInt,
    OptPercent,
    OptStrClean,
    NonBlankStr,
    PosInt,
)


class Offer(BaseModel):
    """
    Representation of a single tariff / plan shown to the user.

    Monetary values are **cent-accurate integers (EUR-cent)**.
    """

    # — Identification —
    provider: NonBlankStr = Field(..., examples=["ByteMe"])
    plan_name: NonBlankStr = Field(..., examples=["Ultra 70", "Premium 200 Young"])
    product_id: NonBlankStr = Field(..., examples=["501", "PROD-1234"])

    # — Performance —
    speed_down_mbit: PosInt = Field(..., description="Advertised downstream rate (Mbit/s)")
    data_cap_gb: OptPosInt = Field(
        default=None,
        description="Monthly data cap in GB (None ⇒ flat rate)",
    )
    connection_type: Literal["DSL", "Cable", "Fiber", "Mobile"]

    # — Commercials —
    price_cents_month_intro: OptPosInt = Field(
        default=None,
        description="Price per month during the initial promo term",
    )
    price_cents_month_regular: OptPosInt = Field(
        default=None,
        description="Price per month after *price_cents_month_intro* expires",
    )
    contract_duration_months: PosInt
    contract_regular_months: OptPosInt = Field(
        default=12,
        description="Regular contract duration (after promo period)",
    )
    installation_service_included: bool = Field(
        default=False, description="True if an on-site technician is free"
    )

    # — TV & Media —
    tv_included: Optional[bool] = Field(
        default=False, description="True if *any* TV product is bundled"
    )
    tv_package_name: OptStrClean = Field(
        default=None,
        examples=["ByteLive Basic", "Ping TV Plus"],
    )

    # — Promotions & Audience —
    voucher_type: Optional[VoucherKind] = Field(
        default=None, description="Kind of voucher / incentive"
    )
    voucher_value_cents: OptPosInt = None
    voucher_value_percent: OptPercent = Field(
        default=None, description="Discount percentage (0–100)"
    )
    voucher_min_order_value_cents: OptPosInt = None
    voucher_max_value_cents: OptPosInt = None
    voucher_max_runtime_months: OptPosInt = None
    max_age: OptPosInt = Field(
        default=None,
        description="Upper age limit for special youth / student tariffs",
    )

    # — Model configuration —
    class Config:
        extra = "ignore"

    # -----------------------------------------------------------------------
    # Validators — only domain logic that *cannot* be expressed via the
    # reusable Annotated types lives here.
    # -----------------------------------------------------------------------
    @field_validator("connection_type", mode="before")
    @classmethod
    def _normalize_conn_type(cls, v: str) -> str:
        mapping = {
            "dsl": "DSL",
            "cable": "Cable",
            "fiber": "Fiber",
            "fibre": "Fiber",
            "mobile": "Mobile",
        }
        return mapping.get(v.lower(), v) if isinstance(v, str) else v

    @field_validator("voucher_value_percent", mode="after")
    @classmethod
    def _percent_sets_voucher_type(cls, v: float | None, info):  # noqa: D401
        """Auto-set *voucher_type* to *PERCENTAGE* when a % value is given."""
        if v is not None:
            info.data["voucher_type"] = VoucherKind.PERCENTAGE
        return v

    # -------------------- model-level cross-field rules --------------------
    @model_validator(mode="after")
    def _derive_tv_included(self) -> "Offer":
        """Back-fill *tv_included* from *tv_package_name* if needed."""
        self.tv_included = bool(self.tv_package_name or self.tv_included)
        return self

    @model_validator(mode="after")
    def _ensure_price_present(self) -> "Offer":
        """Require at least one monthly price."""
        if self.price_cents_month_intro is None and self.price_cents_month_regular is None:
            raise ValueError(
                "Either price_cents_month_intro or price_cents_month_regular must be provided."
            )
        return self

    @model_validator(mode="after")
    def _validate_contract_regular_price(self) -> "Offer":
        """
        If *contract_regular_months* differs from *contract_duration_months*,
        both intro & regular prices must be specified.
        """
        if (
                self.contract_regular_months is not None
                and self.contract_regular_months != self.contract_duration_months
                and (
                self.price_cents_month_intro is None
                or self.price_cents_month_regular is None
        )
        ):
            raise ValueError(
                "When *contract_regular_months* differs from *contract_duration_months*, "
                "both *price_cents_month_intro* and *price_cents_month_regular* "
                "must be supplied."
            )
        return self
