import json
from typing import Dict, Any

from fastapi import APIRouter
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.api.schemas import WsMessage
from app.services import websocket_comparison_flow
from app.utils import get_settings, logger

router = APIRouter()


@router.websocket("/ws/compare")
async def compare_websocket(websocket: WebSocket) -> None:
    """Handle the comparison websocket endpoint.

    This function sets up a WebSocket connection at /ws/compare, reads a JSON payload,
    and delegates processing to the comparison flow service.

    Args:
        websocket (WebSocket): The active WebSocket connection.

    Raises:
        WebSocketDisconnect: If the client disconnects before sending a payload.
    """
    await websocket.accept()
    settings: Any = get_settings()

    try:
        payload: Dict[str, Any] = await websocket.receive_json()
    except (json.JSONDecodeError, WebSocketDisconnect):
        await websocket.close(code=1003)
        return
    except Exception as e:
        logger.error("Unexpected error while reading websocket message: %s", e)
        await websocket.send_json(
            WsMessage(type="ERROR", message="Failed to read request.").model_dump()
        )
        await websocket.close(code=1008)
        return

    await websocket_comparison_flow(websocket, payload, settings)
