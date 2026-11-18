from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.engine import make_url
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


def _database_connection_options(url: str, *, is_vercel: bool) -> tuple[str, dict[str, object]]:
    parsed = make_url(url)
    if is_vercel and parsed.drivername.startswith("sqlite"):
        raise RuntimeError("Set ASTRA_DATABASE_URL to a managed PostgreSQL URL for Vercel.")

    if parsed.drivername in {"postgres", "postgresql"}:
        parsed = parsed.set(drivername="postgresql+asyncpg")
    elif parsed.drivername == "postgresql+psycopg":
        parsed = parsed.set(drivername="postgresql+asyncpg")

    if parsed.drivername.startswith("sqlite"):
        return parsed.render_as_string(hide_password=False), {"timeout": 30}
    if parsed.drivername != "postgresql+asyncpg":
        raise RuntimeError("ASTRA_DATABASE_URL must use SQLite locally or PostgreSQL with asyncpg.")

    query = dict(parsed.query)
    ssl_mode_value = query.pop("sslmode", None)
    if isinstance(ssl_mode_value, tuple):
        ssl_mode = ssl_mode_value[0] if ssl_mode_value else None
    else:
        ssl_mode = ssl_mode_value
    query.pop("channel_binding", None)
    query.pop("pgbouncer", None)
    parsed = parsed.set(query=query)
    connect_args: dict[str, object] = {}
    if isinstance(ssl_mode, str) and ssl_mode:
        connect_args["ssl"] = ssl_mode
    return parsed.render_as_string(hide_password=False), connect_args


def get_engine() -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        settings = get_settings()
        database_url, connect_args = _database_connection_options(
            settings.database_url,
            is_vercel=settings.is_vercel_deployment,
        )
        database_file = sqlite_file_from_url(database_url)
        if database_file is not None:
            database_file.parent.mkdir(parents=True, exist_ok=True)
        elif database_url.startswith("sqlite"):
            DATA_DIR.mkdir(parents=True, exist_ok=True)
        is_sqlite = database_url.startswith("sqlite")
        _engine = create_async_engine(
            database_url,
            connect_args=connect_args,
            **(
                {"pool_size": 1, "max_overflow": 0, "pool_pre_ping": True}
                if not is_sqlite
                else {}
            ),
        )
        if is_sqlite:
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
        if engine.dialect.name == "sqlite":
            await connection.execute(text("PRAGMA journal_mode=WAL"))
        await connection.run_sync(Base.metadata.create_all)
        if engine.dialect.name == "sqlite":
            await _migrate_task_status(connection)


async def _migrate_task_status(connection: AsyncConnection) -> None:
    columns = await connection.execute(text("PRAGMA table_info(tasks)"))
    if not any(row._mapping["name"] == "in_progress" for row in columns):
        await connection.execute(
            text("ALTER TABLE tasks ADD COLUMN in_progress BOOLEAN NOT NULL DEFAULT false")
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
