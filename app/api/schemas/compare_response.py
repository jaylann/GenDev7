from typing import List, Optional

from pydantic import BaseModel, Field

from app.models import Offer, Address



class CompareResponse(BaseModel):
    """
    Response model for a comparison query, containing the comparison slug,
    a list of offers, and an optional address.
    """
    slug: str = Field(
        ...,
        description="Unique identifier for the comparison session",
    )
    offers: List[Offer] = Field(
        ...,
        description="List of available offers returned by providers",
    )
    address: Optional[Address] = Field(
        None,
        description="Address associated with the comparison, if provided",
        examples=[{
            "street": "Boltzmannstraße",
            "house_number": "3",
            "city": "Garching bei München",
            "plz": "85748",
            "country_code": "DE"
        }]
    )
