from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.api.http_compare import router as http_compare_router
from app.api.schemas.ws_compare_address_request import WsCompareAddressRequest
from app.api.ws_compare import router as ws_compare_router
from app.utils.http import shared_client

load_dotenv()


def create_app() -> FastAPI:
    app = FastAPI(
        title="BetterSurf Internet-Provider Comparison",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ---------- include your modular routers ---------------------
    app.include_router(http_compare_router, prefix="")
    app.include_router(ws_compare_router, prefix="")

    # ---------- CORS (tighten origins in prod!) ------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    # ---------- shutdown: close shared HTTP client -----------------
    @app.on_event("shutdown")
    async def _close_shared_client():
        await shared_client.aclose()

    # ---------- Override OpenAPI to document WebSocket endpoint ----
    def custom_openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema
        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            routes=app.routes,
        )

        # Ensure components.schemas exists
        components = openapi_schema.setdefault("components", {})
        schemas = components.setdefault("schemas", {})

        # Include WebSocket request schema
        schemas["WsCompareAddressRequest"] = WsCompareAddressRequest.model_json_schema(
            ref_template="#/components/schemas/{model}"
        )

        # Add WebSocket path as HTTP GET upgrade operation
        paths = openapi_schema.setdefault("paths", {})
        paths["/ws/compare"] = {
            "get": {
                "summary": "WebSocket Compare",
                "description": (
                    "WebSocket endpoint for provider comparison. "
                    "Accepts a JSON payload matching the WsCompareAddressRequest schema and streams INITIAL_OFFERS and FINAL_OFFERS messages."
                ),
                "operationId": "compareWebsocket",
                "responses": {
                    "101": {"description": "Switching Protocols"}
                },
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/WsCompareAddressRequest"}
                        }
                    },
                    "required": True,
                },
                "security": [],
                "tags": ["WebSocket"]
            }
        }
        app.openapi_schema = openapi_schema
        return app.openapi_schema

    app.openapi = custom_openapi  # type: ignore

    return app


app = create_app()
