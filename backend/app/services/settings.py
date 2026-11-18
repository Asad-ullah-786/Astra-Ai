from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import utcnow
from app.database.models import Setting

ALLOWED_SETTINGS = {"user_display_name"}
DEFAULTS = {"user_display_name": "Operator"}
AI_MODEL_KEY = "ai_model"


def clean_display_name(value: str) -> str:
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > 40:
        raise ValueError("Display name must be 1 to 40 characters")
    if any(ord(character) < 32 for character in cleaned):
        raise ValueError("Display name contains invalid characters")
    return cleaned


async def read_settings(session: AsyncSession) -> dict[str, str]:
    values = dict(DEFAULTS)
    for key in ALLOWED_SETTINGS:
        row = await session.get(Setting, key)
        if row is not None:
            values[key] = row.value
    return values


async def write_display_name(session: AsyncSession, value: str) -> dict[str, str]:
    cleaned = clean_display_name(value)
    row = await session.get(Setting, "user_display_name")
    if row is None:
        row = Setting(key="user_display_name", value=cleaned, updated_at=utcnow())
        session.add(row)
    else:
        row.value = cleaned
        row.updated_at = utcnow()
    await session.commit()
    return await read_settings(session)


async def read_ai_model(session: AsyncSession) -> str | None:
    row = await session.get(Setting, AI_MODEL_KEY)
    return row.value if row is not None else None


async def write_ai_model(session: AsyncSession, model_name: str) -> str:
    row = await session.get(Setting, AI_MODEL_KEY)
    if row is None:
        row = Setting(key=AI_MODEL_KEY, value=model_name, updated_at=utcnow())
        session.add(row)
    else:
        row.value = model_name
        row.updated_at = utcnow()
    await session.commit()
    return model_name


async def clear_ai_model(session: AsyncSession) -> None:
    row = await session.get(Setting, AI_MODEL_KEY)
    if row is not None:
        await session.delete(row)
        await session.commit()
