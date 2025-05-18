from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.http_compare import router as http_compare_router
from app.api.ws_compare import router as ws_compare_router
from app.utils.http import shared_client

load_dotenv()


def create_app() -> FastAPI:

    app = FastAPI(
        title="CHECK24 Internet-Provider Comparison",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ---------- shutdown: close shared HTTP client -----------------
    @app.on_event("shutdown")
    async def _close_shared_client():
        await shared_client.aclose()

    # ---------- CORS (tighten origins in prod!) ------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    # ---------- include your modular routers ---------------------
    app.include_router(http_compare_router, prefix="")
    app.include_router(ws_compare_router, prefix="")

    return app


app = create_app()
