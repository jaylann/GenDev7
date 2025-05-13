from typing import Optional, Literal

from pydantic import PositiveInt, BaseModel, Field


class Offer(BaseModel):
    provider: str = Field(..., description="Name of the service provider", examples=["Acme Telecom"])
    product_id: str = Field(..., description="Unique product identifier", examples=["PROD-1234"])
    speed_mbit: PositiveInt = Field(..., description="Speed in megabits per second", examples=[50])
    price_cents_month: PositiveInt = Field(..., description="Monthly price in cents", examples=[4999])
    price_cents_month_after24: PositiveInt = Field(...,
                                                   description="Monthly price in cents after the initial 24 months",
                                                   examples=[5999])
    duration_months: PositiveInt = Field(..., description="Duration of the contract in months", examples=[24])
    connection_type: Literal["DSL", "Cable", "Fiber"] = Field(..., description="Type of internet connection",
                                                              examples=["Fiber"])
    installation_service: bool = Field(..., description="Whether installation service is included", examples=[True])
    tv: bool = Field(..., description="Whether TV service is included", examples=[False])
    data_limit_gb: Optional[int] = Field(None, description="Data limit in GB, or None for unlimited", examples=[500])
    voucher: Optional[str] = Field(None, description="Promotional voucher code", examples=["SUMMER2025"])
