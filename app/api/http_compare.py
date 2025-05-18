from fastapi import APIRouter, Depends

from app.api.schemas.compare_response import CompareResponse
from app.api.schemas.single_offer_share_request import SingleOfferShareRequest
from app.api.schemas.single_offer_share_response import SingleOfferShareResponse
from app.core.config import Settings, get_settings
from app.services.sharing_service import get_comparison_by_slug, generate_share_link

router = APIRouter()


@router.get("/compare/{slug}", response_model=CompareResponse)
async def compare_by_slug(slug: str):
    return await get_comparison_by_slug(slug)


@router.post("/offers/share-link", response_model=SingleOfferShareResponse)
async def generate_single_offer_share_link(
    request: SingleOfferShareRequest,
    settings: Settings = Depends(get_settings),
):
    return await generate_share_link(request, settings)
