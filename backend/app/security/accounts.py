import base64
import hashlib
import hmac
import ipaddress
import json
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy import case, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database.models import AuthAttempt, User

PASSWORD_ITERATIONS = 600_000
SESSION_HOURS = 12


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _session_signing_key() -> bytes:
    token = get_settings().api_token.strip()
    if len(token) < 32:
        raise RuntimeError("Cloud account authentication requires a strong ASTRA_API_TOKEN of at least 32 characters.")
    return hmac.new(token.encode(), b"ASTRA account session signing", hashlib.sha256).digest()


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def _password_matches(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt, expected = encoded.split("$", maxsplit=3)
        if algorithm != "pbkdf2_sha256" or int(rounds) != PASSWORD_ITERATIONS:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), _b64decode(salt), int(rounds))
        return hmac.compare_digest(_b64encode(actual), expected)
    except (ValueError, TypeError):
        return False


@lru_cache(maxsize=1)
def _dummy_password_hash() -> str:
    return _hash_password("invalid-account-password")


def validate_session_signing_key() -> None:
    _session_signing_key()


def _remote_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    for candidate in reversed(forwarded.split(",")):
        try:
            return str(ipaddress.ip_address(candidate.strip()))
        except ValueError:
            continue
    client = request.client
    return client.host if client and client.host else "unknown"


async def enforce_auth_rate_limit(
    session: AsyncSession,
    request: Request,
    action: str,
    subject: str,
    *,
    maximum: int,
    window_minutes: int,
) -> None:
    signing_key = _session_signing_key()
    identity = f"{action}:{_remote_address(request)}:{subject.casefold()}"
    identity_hash = hmac.new(signing_key, identity.encode(), hashlib.sha256).hexdigest()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=window_minutes)
    values = {"identity_hash": identity_hash, "window_started": now, "attempts": 1}
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        statement = postgres_insert(AuthAttempt).values(**values)
    elif dialect == "sqlite":
        statement = sqlite_insert(AuthAttempt).values(**values)
    else:
        raise RuntimeError(f"Account rate limiting is not supported for the {dialect} database.")
    reset_window = AuthAttempt.window_started < cutoff
    statement = statement.on_conflict_do_update(
        index_elements=[AuthAttempt.identity_hash],
        set_={
            "window_started": case((reset_window, now), else_=AuthAttempt.window_started),
            "attempts": case((reset_window, 1), else_=AuthAttempt.attempts + 1),
        },
    ).returning(AuthAttempt.attempts)
    attempts = await session.scalar(statement)
    await session.commit()
    if attempts is not None and attempts > maximum:
        raise HTTPException(
            status_code=429,
            detail="Too many account requests. Wait a little and try again.",
            headers={"Retry-After": str(window_minutes * 60)},
        )


def create_session_token(user_id: str) -> str:
    expires = int((datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).timestamp())
    payload = _b64encode(json.dumps({"sub": user_id, "exp": expires}, separators=(",", ":")).encode())
    signature = hmac.new(_session_signing_key(), payload.encode(), hashlib.sha256).digest()
    return f"{payload}.{_b64encode(signature)}"


def user_id_from_session_token(token: str) -> str | None:
    try:
        payload, signature = token.split(".", maxsplit=1)
        expected = hmac.new(_session_signing_key(), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64encode(expected), signature):
            return None
        claims = json.loads(_b64decode(payload))
        user_id = claims["sub"]
        expires = claims["exp"]
        if not isinstance(user_id, str) or not isinstance(expires, int):
            return None
        if expires <= int(datetime.now(timezone.utc).timestamp()):
            return None
        return user_id
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, RuntimeError):
        return None


async def require_identity(request: Request) -> str | None:
    if not get_settings().is_vercel_deployment:
        from app.security.access import require_token

        require_token(request)
        return None

    authorization = request.headers.get("authorization", "")
    scheme, _, credential = authorization.partition(" ")
    user_id = user_id_from_session_token(credential) if scheme.lower() == "bearer" else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in to your ASTRA account to continue.")
    return user_id


async def register_account(session: AsyncSession, email: str, password: str) -> User:
    normalized_email = email.strip().casefold()
    existing = await session.scalar(select(User.id).where(User.email == normalized_email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(
        id=str(uuid4()),
        email=normalized_email,
        password_hash=_hash_password(password),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    await session.refresh(user)
    return user


async def authenticate_account(session: AsyncSession, email: str, password: str) -> User:
    normalized_email = email.strip().casefold()
    user = await session.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        _password_matches(password, _dummy_password_hash())
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    if not _password_matches(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return user
