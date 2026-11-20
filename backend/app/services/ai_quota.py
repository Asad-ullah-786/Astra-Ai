from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AIMessageUsage

DAILY_SHARED_MESSAGE_LIMIT = 20


def _today_utc():
    return datetime.now(timezone.utc).date()


async def usage_for_today(session: AsyncSession, user_id: str | None) -> int:
    if user_id is None:
        return 0
    usage = await session.get(AIMessageUsage, (user_id, _today_utc()))
    return usage.count if usage is not None else 0


async def reserve_shared_message(session: AsyncSession, user_id: str | None) -> bool:
    if user_id is None:
        return True

    values = {"user_id": user_id, "usage_date": _today_utc(), "count": 1}
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        statement = postgres_insert(AIMessageUsage).values(**values)
    elif dialect == "sqlite":
        statement = sqlite_insert(AIMessageUsage).values(**values)
    else:
        raise RuntimeError(f"AI quota is not supported for the {dialect} database.")
    statement = statement.on_conflict_do_update(
        index_elements=[AIMessageUsage.user_id, AIMessageUsage.usage_date],
        set_={"count": AIMessageUsage.count + 1},
        where=AIMessageUsage.count < DAILY_SHARED_MESSAGE_LIMIT,
    ).returning(AIMessageUsage.count)
    reserved = await session.scalar(statement)
    await session.commit()
    return reserved is not None


async def release_shared_message(session: AsyncSession, user_id: str | None) -> None:
    if user_id is None:
        return
    today = _today_utc()
    await session.execute(
        update(AIMessageUsage)
        .where(
            AIMessageUsage.user_id == user_id,
            AIMessageUsage.usage_date == today,
            AIMessageUsage.count > 0,
        )
        .values(count=AIMessageUsage.count - 1)
    )
    await session.commit()
