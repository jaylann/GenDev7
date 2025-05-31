"""
Entry point for the BetterSurf Internet-Provider Comparison API.
Defines application creation, health check endpoint, CORS settings,
and custom OpenAPI schema extensions for WebSocket routes.
"""

# Ensure the default HTTPS context factory is a callable that creates a context using certifi's CA bundle
import ssl, certifi

ssl._create_default_https_context = lambda: ssl.create_default_context(
    cafile=certifi.where()
)

from contextlib import asynccontextmanager
from typing import AsyncGenerator, Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.api.routes.http_compare import router as http_compare_router
from app.api.routes.ws_compare import router as ws_compare_router
from app.api.schemas.ws_compare_address_request import WsCompareAddressRequest
from app.utils.http import shared_client

load_dotenv()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Async context manager for application lifespan.

    Initializes circuit breakers at startup and ensures the shared HTTP client
    is closed on shutdown.
    """
    # Initialize circuit breakers for all providers
    from app.core.circuit_breaker import reset_all_breakers

    reset_all_breakers()

    yield

    # On shutdown: close shared HTTP client session to free resources
    await shared_client.aclose()


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application instance.

    Returns:
        A FastAPI app configured with routers, CORS, health check,
        and custom OpenAPI schema for WebSocket endpoints.
    """
    app_title = "BetterSurf Internet-Provider Comparison"
    app_version = "1.0.0"
    fast_api_app = FastAPI(
        title=app_title,
        version=app_version,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,  # use the new lifespan handler
    )

    @fast_api_app.get("/health")
    async def health() -> dict[str, str]:
        """
        Health check endpoint.

        Returns:
            A JSON object indicating the service status.
        """
        return {"status": "ok"}

    # ---------- Register modular routers for HTTP and WebSocket endpoints ----------
    fast_api_app.include_router(http_compare_router, prefix="")
    fast_api_app.include_router(ws_compare_router, prefix="")

    # ---------- CORS (configure allowed origins and methods; restrict in production) ----------
    fast_api_app.add_middleware(
        CORSMiddleware,
        allow_origins=["https://gendev-web.vercel.app"],
        allow_methods=[
            "GET",
            "POST",
            "OPTIONS",
        ],  # Consider restricting to only required methods
        allow_headers=["*"],
    )

    # ---------- Override OpenAPI schema to document WebSocket endpoint ----------
    def custom_openapi() -> dict[str, Any]:
        """
        Generate a custom OpenAPI schema that includes WebSocket /ws/compare.

        Caches the schema on first generation.

        Returns:
            The OpenAPI schema dictionary.
        """
        if fast_api_app.openapi_schema:
            return fast_api_app.openapi_schema
        openapi_schema = get_openapi(
            title=app_title,
            version=app_version,
            routes=fast_api_app.routes,
        )

        # Ensure WsCompareAddressRequest schema is included for documentation
        components = openapi_schema.setdefault("components", {})
        schemas = components.setdefault("schemas", {})
        schemas["WsCompareAddressRequest"] = WsCompareAddressRequest.model_json_schema(
            ref_template="#/components/schemas/{model}"
        )

        # Document the /ws/compare WebSocket endpoint in OpenAPI
        paths = openapi_schema.setdefault("paths", {})
        paths["/ws/compare"] = {
            "get": {
                "summary": "WebSocket Compare",
                "description": (
                    "WebSocket endpoint for provider comparison. "
                    "Accepts a JSON payload matching the WsCompareAddressRequest schema and streams INITIAL_OFFERS and FINAL_OFFERS messages."
                ),
                "operationId": "compareWebsocket",
                "responses": {"101": {"description": "Switching Protocols"}},
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": "#/components/schemas/WsCompareAddressRequest"
                            }
                        }
                    },
                    "required": True,
                },
                "security": [],
                "tags": ["WebSocket"],
            }
        }
        fast_api_app.openapi_schema = openapi_schema
        return fast_api_app.openapi_schema

    fast_api_app.openapi = custom_openapi

    return fast_api_app


app = create_app()
