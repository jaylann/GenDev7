import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.schemas.ws_message import WsMessage
from app.core.config import get_settings
from app.services.comparison_service import websocket_comparison_flow

router = APIRouter()


@router.websocket("/ws/compare")
async def compare_websocket(websocket: WebSocket):
    await websocket.accept()
    settings = get_settings()

    try:
        payload = await websocket.receive_json()
    except (json.JSONDecodeError, WebSocketDisconnect):
        await websocket.close(code=1003)
        return
    except Exception:
        await websocket.send_json(
            WsMessage(
                type="ERROR", message="Failed to read request."
            ).model_dump()
        )
        await websocket.close(code=1008)
        return

    # Delegate full flow to service layer
    await websocket_comparison_flow(websocket, payload, settings)
