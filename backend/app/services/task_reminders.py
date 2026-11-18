import asyncio

from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.database.base import utcnow
from app.database.models import TaskItem
from app.database.session import get_session_factory
from app.services.activity import record_activity


async def issue_due_task_reminders(session: AsyncSession) -> int:
    now = utcnow()
    due_tasks = await session.scalars(
        select(TaskItem).where(
            TaskItem.completed.is_(False),
            TaskItem.due_at.is_not(None),
            TaskItem.due_at <= now,
            TaskItem.reminded_at.is_(None),
        )
    )
    sent = 0
    for task in due_tasks:
        claimed = await session.execute(
            update(TaskItem)
            .where(
                TaskItem.id == task.id,
                TaskItem.completed.is_(False),
                TaskItem.due_at <= now,
                TaskItem.reminded_at.is_(None),
            )
            .values(reminded_at=now)
            .execution_options(synchronize_session=False)
        )
        if claimed.rowcount == 1:
            await record_activity(
                "warning",
                "productivity",
                f"Task reminder: {task.title}",
                "This task is due.",
                session=session,
            )
            sent += 1
    if sent:
        await session.commit()
    return sent


async def task_reminder_loop() -> None:
    while True:
        try:
            async with get_session_factory()() as session:
                await issue_due_task_reminders(session)
        except SQLAlchemyError:
            logger.exception("Could not check task reminders; retrying shortly.")
        await asyncio.sleep(15)
