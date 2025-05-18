from pydantic import BaseModel, Field


# --- New Pydantic Models for Single Offer Sharing ---
class SingleOfferShareRequest(BaseModel):
    """
    Request model for sharing a single offer, including the originating page slug and the specific offer key.
    """
    original_page_slug: str = Field(
        ...,
        description="The slug of the page containing the full list of offers.",
    )
    offer_key: str = Field(
        ...,
        description="A unique key identifying the offer, e.g., 'ProviderName:ProductID'.",
    )
