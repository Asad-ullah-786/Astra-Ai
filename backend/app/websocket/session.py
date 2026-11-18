import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import AIProviderError
from app.config import get_settings
from app.database.session import get_session_factory
from app.security.access import token_matches
from app.services.chat import handle_command
from app.services.system_monitor import system_snapshot

router = APIRouter()


def _authorized(websocket: WebSocket) -> bool:
    settings = get_settings()
    if not settings.auth_required:
        return True
    expected = f"Bearer {settings.api_token}"
    provided = websocket.headers.get("authorization", "")
    if provided and token_matches(provided, expected):
        return True
    query_token = websocket.query_params.get("token", "")
    return token_matches(f"Bearer {query_token}", expected)


async def _push_stats(websocket: WebSocket) -> None:
    interval = get_settings().stats_interval_seconds
    while True:
        await asyncio.sleep(interval)
        await websocket.send_json({"type": "stats", "stats": system_snapshot()})


@router.websocket("/ws/session")
async def session(websocket: WebSocket) -> None:
    if not _authorized(websocket):
        await websocket.close(code=1008)
        return

    await websocket.accept()
    settings = get_settings()
    await websocket.send_json(
        {
            "type": "hello",
            "name": settings.app_name,
            "version": settings.version,
            "phase": settings.phase,
            "state": "idle",
        }
    )
    stats_task = asyncio.create_task(_push_stats(websocket))
    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            if not isinstance(payload, dict):
                await websocket.send_json({"type": "error", "message": "Invalid payload"})
                continue
            kind = payload.get("type")
            if kind == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if kind != "command":
                await websocket.send_json({"type": "error", "message": "Unsupported event"})
                continue
            await _handle_socket_command(websocket, payload)
    except WebSocketDisconnect:
        return
    finally:
        stats_task.cancel()
        try:
            await stats_task
        except asyncio.CancelledError:
            pass


async def _handle_socket_command(websocket: WebSocket, payload: dict) -> None:
    text = payload.get("text", "")
    conversation_id = payload.get("conversation_id")
    await websocket.send_json({"type": "state", "state": "processing"})
    factory = get_session_factory()
    try:
        if not isinstance(text, str) or (conversation_id is not None and not isinstance(conversation_id, str)):
            raise ValueError("Command text is empty")
        async with factory() as session:
            result = await _run_command(session, text, conversation_id)
    except ValueError as exc:
        await websocket.send_json({"type": "state", "state": "error"})
        await websocket.send_json({"type": "error", "message": str(exc)})
        return
    except LookupError as exc:
        await websocket.send_json({"type": "state", "state": "error"})
        await websocket.send_json({"type": "error", "message": str(exc)})
        return
    except AIProviderError as exc:
        await websocket.send_json({"type": "state", "state": "error"})
        await websocket.send_json({"type": "error", "message": str(exc)})
        return

    conversation, user_message, assistant_message = result
    for message in (user_message, assistant_message):
        await websocket.send_json(
            {
                "type": "message",
                "conversation_id": conversation.id,
                "message": {
                    "id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "created_at": message.created_at.isoformat(),
                },
            }
        )
    await websocket.send_json({"type": "state", "state": "completed"})


async def _run_command(session: AsyncSession, text: str, conversation_id: str | None):
    if conversation_id is not None and not isinstance(conversation_id, str):
        raise ValueError("Conversation id is invalid")
    return await handle_command(session, text, conversation_id)
