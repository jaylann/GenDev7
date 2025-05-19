from fastapi import APIRouter, Depends

from app.api.schemas import (
    CompareResponse,
    SingleOfferShareResponse,
    SingleOfferShareRequest,
)
from app.core import Settings
from app.services import get_comparison_by_slug, generate_share_link
from app.utils import get_settings

# Create API router for comparison and share-link endpoints
router = APIRouter()


@router.get("/compare/{slug}", response_model=CompareResponse)
async def compare_by_slug(slug: str) -> CompareResponse:
    """
    Retrieve a comparison result identified by its slug.

    Args:
        slug: Unique identifier for the comparison.

    Returns:
        CompareResponse: The comparison data structure.
    """
    return await get_comparison_by_slug(slug)


@router.post("/offers/share-link", response_model=SingleOfferShareResponse)
async def generate_single_offer_share_link(
    request: SingleOfferShareRequest,
    settings: Settings = Depends(get_settings),
) -> SingleOfferShareResponse:
    """
    Generate a shareable link for a single offer.

    Args:
        request: Payload containing offer details to share.
        settings: Application settings (dependency-injected).

    Returns:
        SingleOfferShareResponse: The generated share link and metadata.
    """
    return await generate_share_link(request, settings)
