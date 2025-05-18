from typing import List, Optional

from pydantic import BaseModel, Field

from app.models import Offer


class WsMessage(BaseModel):
    """
    Standard WebSocket message model for comparison updates, including message type, payload, and status flags.
    """

    type: str = Field(
        ...,
        description="Type of the message, e.g., 'update', 'error', or 'complete'",
        examples=["update"],
    )
    offers: Optional[List[Offer]] = Field(
        None,
        description="List of offers included in this message, if any",
        examples=[
            [
                {
                    "provider": "ByteMe",
                    "speed_down_mbit": 100,
                    "contract_duration_months": 12,
                    "monthly_price_eur": 29.99,
                }
            ]
        ],
    )
    slug: Optional[str] = Field(
        None,
        description="Comparison session slug for correlating updates",
        examples=["main-offer-list-2025-05-18"],
    )
    message: Optional[str] = Field(
        None,
        description="Optional human-readable status or error message",
        examples=["Fetching offers from provider..."],
    )
    provider_name: Optional[str] = Field(
        None,
        description="Name of the provider sending this update, if applicable",
        examples=["ByteMe"],
    )
    is_complete: Optional[bool] = Field(
        None,
        description="Flag indicating whether the comparison process is complete",
        examples=[True],
    )
    will_refine: Optional[bool] = Field(
        None,
        description="Flag indicating whether further refinement messages will follow",
        examples=[False],
    )
