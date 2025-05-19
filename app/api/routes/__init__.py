from fastapi import APIRouter

from .http_compare import router as http_router
from .ws_compare import router as ws_router

api_router = APIRouter()
api_router.include_router(http_router)
api_router.include_router(ws_router)

__all__ = ["api_router"]
