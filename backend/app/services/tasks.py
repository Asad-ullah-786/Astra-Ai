from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import TaskCreateIn, TaskUpdateIn
from app.database.base import utcnow
from app.database.models import TaskItem
from app.services.activity import record_activity
from app.services.task_reminders import issue_due_task_reminders


async def list_tasks(session: AsyncSession, owner_id: str | None = None) -> list[TaskItem]:
    statement = select(TaskItem).where(TaskItem.owner_id == owner_id)
    result = await session.scalars(
        statement.order_by(
            TaskItem.completed.asc(),
            TaskItem.due_at.is_(None),
            TaskItem.due_at.asc(),
            TaskItem.created_at.desc(),
        )
    )
    return list(result)


async def get_task(
    session: AsyncSession,
    task_id: str,
    owner_id: str | None = None,
) -> TaskItem | None:
    task = await session.get(TaskItem, task_id)
    return task if task is not None and task.owner_id == owner_id else None


async def create_task(
    session: AsyncSession,
    payload: TaskCreateIn,
    owner_id: str | None = None,
) -> TaskItem:
    task = TaskItem(
        id=str(uuid4()),
        owner_id=owner_id,
        title=payload.title,
        notes=payload.notes,
        due_at=payload.due_at,
        completed=False,
        reminded_at=None,
    )
    session.add(task)
    await record_activity(
        "info",
        "productivity",
        f"Task created: {task.title}",
        session=session,
        owner_id=owner_id,
    )
    await session.commit()
    await issue_due_task_reminders(session)
    await session.refresh(task)
    return task


async def update_task(session: AsyncSession, task: TaskItem, payload: TaskUpdateIn) -> TaskItem:
    values = payload.model_dump(exclude_unset=True)
    was_completed = task.completed
    for field, value in values.items():
        setattr(task, field, value)
    if values.get("completed") is True:
        task.in_progress = False
    elif values.get("in_progress") is True:
        task.completed = False
    elif values.get("completed") is False and was_completed:
        task.in_progress = False
    if "due_at" in values or (was_completed and values.get("completed") is False):
        task.reminded_at = None
    task.updated_at = utcnow()
    await record_activity(
        "info",
        "productivity",
        f"Task updated: {task.title}",
        session=session,
        owner_id=task.owner_id,
    )
    await session.commit()
    await issue_due_task_reminders(session)
    await session.refresh(task)
    return task


async def delete_task(session: AsyncSession, task: TaskItem) -> None:
    await record_activity(
        "info",
        "productivity",
        f"Task deleted: {task.title}",
        session=session,
        owner_id=task.owner_id,
    )
    await session.delete(task)
    await session.commit()
