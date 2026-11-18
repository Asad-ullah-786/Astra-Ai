from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import DATA_DIR, get_settings
from app.database.base import Base

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def sqlite_file_from_url(url: str) -> Path | None:
    prefix = "sqlite+aiosqlite:///"
    if not url.startswith(prefix):
        return None
    raw = url[len(prefix) :]
    if raw in {":memory:", ""}:
        return None
    return Path(raw)


def _enable_sqlite_constraints(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_engine() -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        settings = get_settings()
        database_file = sqlite_file_from_url(settings.database_url)
        if database_file is not None:
            database_file.parent.mkdir(parents=True, exist_ok=True)
        else:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
        _engine = create_async_engine(settings.database_url, connect_args={"timeout": 30})
        event.listen(_engine.sync_engine, "connect", _enable_sqlite_constraints)
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    get_engine()
    if _session_factory is None:
        raise RuntimeError("Database session factory was not created")
    return _session_factory


async def init_database() -> None:
    from app.database import models  # noqa: F401

    engine = get_engine()
    async with engine.begin() as connection:
        await connection.execute(text("PRAGMA journal_mode=WAL"))
        await connection.run_sync(Base.metadata.create_all)
        await _migrate_task_status(connection)


async def _migrate_task_status(connection: AsyncConnection) -> None:
    columns = await connection.execute(text("PRAGMA table_info(tasks)"))
    if not any(row._mapping["name"] == "in_progress" for row in columns):
        await connection.execute(
            text("ALTER TABLE tasks ADD COLUMN in_progress BOOLEAN NOT NULL DEFAULT 0")
        )


async def dispose_database() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


async def get_session() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        yield session
