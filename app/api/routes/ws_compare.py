import json
from typing import Dict, Any

from fastapi import APIRouter
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.api.schemas import WsMessage
from app.services import websocket_comparison_flow
from app.utils import get_settings

# Create WebSocket router for comparison streaming
router = APIRouter()


@router.websocket("/ws/compare")
async def compare_websocket(websocket: WebSocket) -> None:
    """
    Handle real-time comparison over WebSocket.

    Accepts a JSON payload from the client and streams comparison results.

    Args:
        websocket: Active WebSocket connection.

    Returns:
        None
    """
    await websocket.accept()
    settings = get_settings()

    # Receive initial comparison request payload
    try:
        payload: Dict[str, Any] = await websocket.receive_json()
    except (json.JSONDecodeError, WebSocketDisconnect):
        await websocket.close(code=1003)
        return
    except Exception:
        await websocket.send_json(
            WsMessage(type="ERROR", message="Failed to read request.").model_dump()
        )
        await websocket.close(code=1008)
        return

    # Delegate full flow to service layer
    await websocket_comparison_flow(websocket, payload, settings)
