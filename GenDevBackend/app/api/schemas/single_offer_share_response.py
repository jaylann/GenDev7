from pydantic import BaseModel, Field


class SingleOfferShareResponse(BaseModel):
    shared_slug: str = Field(
        ..., description="The new slug that directly points to the single shared offer."
    )
