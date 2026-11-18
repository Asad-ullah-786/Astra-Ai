import secrets

from fastapi import HTTPException, Request
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

from app.config import get_settings

ALLOWED_HOSTS = {"127.0.0.1", "localhost", "::1", "testserver"}
ALLOWED_CLIENTS = {"127.0.0.1", "::1", "localhost", "testclient"}


def hostname_from_header(host_header: str) -> str:
    value = host_header.strip().lower()
    if value.startswith("["):
        end = value.find("]")
        return value[1:end] if end != -1 else value
    return value.split(":")[0]


def is_local_request(host_header: str, client_host: str | None) -> bool:
    hostname = hostname_from_header(host_header)
    client = (client_host or "").lower()
    return hostname in ALLOWED_HOSTS and client in ALLOWED_CLIENTS


def token_matches(provided: str, expected: str) -> bool:
    if len(provided) != len(expected):
        return False
    return secrets.compare_digest(provided, expected)


def require_token(request: Request) -> None:
    settings = get_settings()
    if not settings.auth_required:
        return
    expected = f"Bearer {settings.api_token}"
    provided = request.headers.get("authorization", "")
    if not token_matches(provided, expected):
        raise HTTPException(status_code=401, detail="API token required")


class LocalOnlyMiddleware:
    """Reject non-loopback clients and foreign Host headers.

    Binding to localhost is not enough: a process can still be started on
    another interface, and a browser can be pointed at the local port with a
    foreign Host header. Both checks have to pass.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"}:
            await self.app(scope, receive, send)
            return

        if get_settings().is_vercel_deployment:
            if scope["type"] == "websocket":
                await send({"type": "websocket.close", "code": 1008})
                return
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        client = scope.get("client")
        client_host = client[0] if client else None
        if is_local_request(headers.get("host", ""), client_host):
            await self.app(scope, receive, send)
            return

        if scope["type"] == "http":
            response = JSONResponse(
                status_code=403,
                content={"detail": "ASTRA only accepts connections from this computer."},
            )
            await response(scope, receive, send)
            return

        await send({"type": "websocket.close", "code": 1008})
