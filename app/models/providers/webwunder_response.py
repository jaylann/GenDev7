from typing import Optional

from pydantic import BaseModel, Field

from app.models.base.offer import VoucherKind, Offer


class WebWunderResponse(BaseModel):
    """
    Response DTO from WebWunder; convertible into our domain Offer.
    """
    provider_name: str = Field(..., description="Marketing name of the plan")
    product_id: str = Field(..., description="Provider-internal plan identifier")
    speed_down_mbit: int = Field(..., description="Downstream bandwidth (Mbit/s)")
    price_cents_month_intro: int = Field(..., description="Introductory monthly price in cents")
    price_cents_month_regular: int = Field(..., description="Regular monthly price in cents after promo")
    contract_duration_months: int = Field(..., description="Minimum contract term in months")
    connection_type: str = Field(..., description="Physical medium (DSL, Cable, Fiber, Mobile)")
    voucher_type: Optional[VoucherKind] = Field(None, description="Type of voucher/incentive")
    voucher_value_cents: Optional[int] = Field(
        None, description="Absolute voucher value in cents or cashback amount"
    )
    voucher_value_percent: Optional[float] = Field(
        None, ge=0, le=100, description="Percentage voucher value (0–100%)"
    )
    voucher_min_order_value_cents: Optional[int] = Field(
        None, description="Minimum order value in cents to apply voucher"
    )
    voucher_max_value_cents: Optional[int] = Field(
        None, description="Maximum discount/applyable voucher value in cents"
    )

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
            installation_cost_cents=None,
            tv_included=False,
            tv_package_name=None,
            voucher_type=self.voucher_type,
            voucher_value_cents=self.voucher_value_cents,
            voucher_value_percent=self.voucher_value_percent,
            voucher_min_order_value_cents=self.voucher_min_order_value_cents,
            voucher_max_value_cents=self.voucher_max_value_cents,
            max_age=None,
        )
