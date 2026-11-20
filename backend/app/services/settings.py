from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import utcnow
from app.database.models import Setting

ALLOWED_SETTINGS = {"user_display_name"}
DEFAULTS = {"user_display_name": "Operator"}
AI_MODEL_KEY = "ai_model"


def _key_for_user(key: str, owner_id: str | None) -> str:
    return f"u:{owner_id}:{key}" if owner_id is not None else key


def clean_display_name(value: str) -> str:
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > 40:
        raise ValueError("Display name must be 1 to 40 characters")
    if any(ord(character) < 32 for character in cleaned):
        raise ValueError("Display name contains invalid characters")
    return cleaned


async def read_settings(
    session: AsyncSession,
    owner_id: str | None = None,
) -> dict[str, str]:
    values = dict(DEFAULTS)
    for key in ALLOWED_SETTINGS:
        row = await session.get(Setting, _key_for_user(key, owner_id))
        if row is not None:
            values[key] = row.value
    return values


async def write_display_name(
    session: AsyncSession,
    value: str,
    owner_id: str | None = None,
) -> dict[str, str]:
    cleaned = clean_display_name(value)
    key = _key_for_user("user_display_name", owner_id)
    row = await session.get(Setting, key)
    if row is None:
        row = Setting(key=key, value=cleaned, updated_at=utcnow())
        session.add(row)
    else:
        row.value = cleaned
        row.updated_at = utcnow()
    await session.commit()
    return await read_settings(session, owner_id)


async def read_ai_model(session: AsyncSession, owner_id: str | None = None) -> str | None:
    row = await session.get(Setting, _key_for_user(AI_MODEL_KEY, owner_id))
    return row.value if row is not None else None


async def write_ai_model(
    session: AsyncSession,
    model_name: str,
    owner_id: str | None = None,
) -> str:
    key = _key_for_user(AI_MODEL_KEY, owner_id)
    row = await session.get(Setting, key)
    if row is None:
        row = Setting(key=key, value=model_name, updated_at=utcnow())
        session.add(row)
    else:
        row.value = model_name
        row.updated_at = utcnow()
    await session.commit()
    return model_name


async def clear_ai_model(session: AsyncSession, owner_id: str | None = None) -> None:
    row = await session.get(Setting, _key_for_user(AI_MODEL_KEY, owner_id))
    if row is not None:
        await session.delete(row)
        await session.commit()
