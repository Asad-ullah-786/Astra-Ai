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
    owner_id: str | None = None,
) -> ActivityLog:
    entry = ActivityLog(
        id=str(uuid4()),
        owner_id=owner_id,
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


async def list_activity(
    session: AsyncSession,
    limit: int,
    owner_id: str | None = None,
) -> list[ActivityLog]:
    bounded = min(max(limit, 1), 200)
    statement = select(ActivityLog).where(ActivityLog.owner_id == owner_id)
    result = await session.scalars(statement.order_by(ActivityLog.created_at.desc()).limit(bounded))
    return list(result)
