import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.config import get_settings
from app.core.logging import configure_logging, logger
from app.database.session import dispose_database, init_database
from app.security.access import LocalOnlyMiddleware
from app.services.activity import record_activity
from app.services.device_bridge import PAIRING_CODE_TTL_SECONDS, device_bridge
from app.services.system_monitor import prime_cpu
from app.services.task_reminders import task_reminder_loop
from app.websocket.session import router as websocket_router

LOCAL_BIND_HOSTS = {"127.0.0.1", "localhost", "::1"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    await init_database()
    if not settings.is_vercel_deployment:
        prime_cpu()
        await record_activity("info", "system", "ASTRA backend started")
        pairing_code = device_bridge.start()
        print(
            "\nASTRA local device pairing code "
            f"(one use, expires in {PAIRING_CODE_TTL_SECONDS // 60} minutes): {pairing_code}\n",
            flush=True,
        )
    logger.info("ASTRA %s phase %s ready", settings.version, settings.phase)
    reminder_worker = (
        None
        if settings.is_vercel_deployment
        else asyncio.create_task(task_reminder_loop(), name="astra-task-reminders")
    )
    try:
        yield
    finally:
        try:
            if reminder_worker is not None:
                reminder_worker.cancel()
                try:
                    await reminder_worker
                except asyncio.CancelledError:
                    pass
        finally:
            if not settings.is_vercel_deployment:
                await record_activity("info", "system", "ASTRA backend stopped")
                device_bridge.stop()
            await dispose_database()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        summary="Local personal assistant API",
        lifespan=lifespan,
    )
    app.add_middleware(LocalOnlyMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_private_network=True,
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Astra-Provider-Key",
            "X-Astra-Provider",
            "X-Astra-Device-Session",
        ],
    )
    app.include_router(api_router, prefix="/api/v1")
    app.include_router(websocket_router)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled request error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "ASTRA hit an unexpected error. The details are in the local log."},
        )

    @app.get("/")
    async def root() -> dict[str, str]:
        return {
            "name": settings.app_name,
            "version": settings.version,
            "docs": "/docs",
        }

    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = get_settings()
    if settings.host not in LOCAL_BIND_HOSTS:
        raise SystemExit("ASTRA refuses to bind a non-local address.")
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
