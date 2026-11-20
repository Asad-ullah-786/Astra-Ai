import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.database.session import (
    _migrate_account_ownership,
    _migrate_guest_account_flag,
    _migrate_task_status,
    sqlite_file_from_url,
)
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


def test_existing_records_remain_unowned_during_account_migration():
    async def verify_migration():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        tables = ("conversations", "messages", "activity_logs", "tasks", "personal_memories")
        async with engine.begin() as connection:
            for table in tables:
                await connection.execute(text(f"CREATE TABLE {table} (id TEXT PRIMARY KEY, title TEXT)"))
                await connection.execute(
                    text(f"INSERT INTO {table} (id, title) VALUES ('legacy', 'keep me')")
                )
            await _migrate_account_ownership(connection)
            await _migrate_account_ownership(connection)
            for table in tables:
                row = (await connection.execute(
                    text(f"SELECT title, owner_id FROM {table} WHERE id = 'legacy'")
                )).one()
                assert row.title == "keep me"
                assert row.owner_id is None
        await engine.dispose()

    asyncio.run(verify_migration())


def test_existing_users_get_non_guest_flag_without_losing_data():
    async def verify_migration():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection:
            await connection.execute(
                text("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT)")
            )
            await connection.execute(
                text("INSERT INTO users (id, email, password_hash) VALUES ('old', 'old@example.com', 'hash')")
            )
            await _migrate_guest_account_flag(connection)
            row = (await connection.execute(
                text("SELECT email, password_hash, is_guest FROM users WHERE id = 'old'")
            )).one()
            assert row.email == "old@example.com"
            assert row.password_hash == "hash"
            assert row.is_guest == 0
        await engine.dispose()

    asyncio.run(verify_migration())
