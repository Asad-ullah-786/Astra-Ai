import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.database.session import _migrate_task_status, sqlite_file_from_url
from app.services.settings import clean_display_name
import pytest


def test_sqlite_url_parser():
    assert sqlite_file_from_url("sqlite+aiosqlite:///:memory:") is None
    path = sqlite_file_from_url("sqlite+aiosqlite:///C:/astra/data/astra.db")
    assert path is not None
    assert path.name == "astra.db"


def test_display_name_rules():
    assert clean_display_name("  ASTRA   Operator ") == "ASTRA Operator"
    with pytest.raises(ValueError):
        clean_display_name("   ")
    with pytest.raises(ValueError):
        clean_display_name("x" * 41)


def test_existing_task_table_gets_in_progress_column():
    async def verify_migration():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection:
            await connection.execute(
                text("CREATE TABLE tasks (id TEXT PRIMARY KEY, completed BOOLEAN NOT NULL DEFAULT 0)")
            )
            await connection.execute(text("INSERT INTO tasks (id) VALUES ('existing-task')"))
            await _migrate_task_status(connection)
            task = (await connection.execute(
                text("SELECT in_progress FROM tasks WHERE id = 'existing-task'")
            )).one()
            assert task.in_progress == 0
        await engine.dispose()

    asyncio.run(verify_migration())
