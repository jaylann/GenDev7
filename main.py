import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import compare
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title="CHECK24 Internet-Provider Comparison", version="1.0.0", docs_url="/docs",  # Swagger UI
        redoc_url="/redoc", )

    # ---------- shared httpx client (injected via compare.router import) ----
    client = httpx.AsyncClient(timeout=httpx.Timeout(10.0))

    @app.on_event("shutdown")
    async def _close_httpx():
        await client.aclose()

    # ---------- CORS (adjust origins for prod) ------------------------------
    app.add_middleware(CORSMiddleware, allow_origins=["*"],  # tighten this in production!
        allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"], )

    # ---------- routers -----------------------------------------------------
    app.include_router(compare.router)

    return app


app = create_app()
