from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import utcnow
from app.database.models import ActivityLog
from app.database.session import get_session_factory


def _item(row: ActivityLog) -> ActivityLog:
    return row


async def record_activity(
    level: str,
    source: str,
    message: str,
    details: str | None = None,
    session: AsyncSession | None = None,
) -> ActivityLog:
    entry = ActivityLog(
        id=str(uuid4()),
        created_at=utcnow(),
        level=level,
        source=source,
        message=message,
        details=details,
    )
    if session is not None:
        session.add(entry)
        await session.flush()
        return entry

    factory = get_session_factory()
    async with factory() as owned:
        owned.add(entry)
        await owned.commit()
        await owned.refresh(entry)
        return _item(entry)


async def list_activity(session: AsyncSession, limit: int) -> list[ActivityLog]:
    bounded = min(max(limit, 1), 200)
    result = await session.scalars(
        select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(bounded)
    )
    return list(result)
