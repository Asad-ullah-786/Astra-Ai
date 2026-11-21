from datetime import datetime, timezone
import asyncio
import json

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.ai.provider import AIProviderError, GeminiProvider, InstalledModel, OpenAIProvider, get_language_model
from app.api.schemas import (
    AIStatusOut,
    AccountOut,
    AccountSessionOut,
    AIUsageOut,
    ActivityOut,
    AutomationLaunchIn,
    AutomationLaunchOut,
    CommandIn,
    CommandOut,
    ConversationOut,
    ConversationSummary,
    DeviceActionIn,
    DevicePairIn,
    DevicePairOut,
    HealthResponse,
    GeminiStatusOut,
    InstalledModelOut,
    MemoryCreateIn,
    MemoryOut,
    MemoryUpdateIn,
    MessageOut,
    ModuleInfo,
    ModelSelectionIn,
    ResearchSearchIn,
    ResearchSearchOut,
    ResearchResultOut,
    SettingsIn,
    SettingsOut,
    SystemSnapshot,
    TaskCreateIn,
    TaskOut,
    TaskUpdateIn,
    VoiceStatusOut,
    VoiceTranscriptionOut,
)
from app.config import get_settings
from app.core.modules import MODULES
from app.database.session import get_session
from app.database.models import User
from app.security.accounts import (
    SESSION_HOURS,
    create_guest_account,
    create_session_token,
    enforce_auth_rate_limit,
    require_identity,
    validate_session_signing_key,
)
from app.services.activity import list_activity, record_activity
from app.services.device_bridge import (
    confirm_device_action,
    device_bridge,
    open_approved_url,
    validate_public_url,
)
from app.services.ai_quota import (
    DAILY_SHARED_MESSAGE_LIMIT,
    release_shared_message,
    reserve_shared_message,
    usage_for_today,
)
from app.services.ai_clients import available_ai_clients
from app.services.automation import APPLICATION_LABELS, AutomationError, available_applications
from app.services.chat import (
    delete_conversation,
    get_conversation,
    handle_command,
    list_conversations,
    prepare_stream_command,
    save_streamed_reply,
)
from app.services.settings import (
    clear_ai_model,
    read_ai_model,
    read_settings,
    write_ai_model,
    write_display_name,
)
from app.services.system_monitor import system_snapshot
from app.services.tasks import create_task, delete_task, get_task, list_tasks, update_task
from app.services.memory import create_memory, delete_memory, get_memory, list_memories, update_memory
from app.services.research import ResearchError, search_web
from app.services.voice import (
    MODEL_NAME,
    download_voice_model,
    transcribe_audio,
    voice_dependencies_installed,
    voice_model_installed,
)
from app.core.logging import logger

api_router = APIRouter()


def _message(row) -> MessageOut:
    return MessageOut(id=row.id, role=row.role, content=row.content, created_at=row.created_at)


def _installed_model(item: InstalledModel) -> InstalledModelOut:
    return InstalledModelOut(
        name=item.name,
        size=item.size,
        parameter_size=item.parameter_size,
        modified_at=item.modified_at,
    )


@api_router.get("/health", response_model=HealthResponse)
async def health(session: AsyncSession = Depends(get_session)) -> HealthResponse:
    settings = get_settings()
    try:
        await session.execute(text("SELECT 1"))
        database = "ok"
        status = "online"
    except Exception:
        database = "error"
        status = "degraded"
    return HealthResponse(
        name=settings.app_name,
        version=settings.version,
        phase=settings.phase,
        status=status,
        database=database,
        auth_required=settings.auth_required,
        cloud_deployment=settings.is_vercel_deployment,
        model=("none" if settings.is_vercel_deployment else await read_ai_model(session)) or "none",
        time_utc=datetime.now(timezone.utc),
    )


def _account_session(user: User) -> AccountSessionOut:
    return AccountSessionOut(
        access_token=create_session_token(user.id),
        expires_in=SESSION_HOURS * 60 * 60,
        account=AccountOut(
            id=user.id,
            email=None if user.is_guest else user.email,
            is_guest=user.is_guest,
        ),
    )


@api_router.post("/auth/guest", response_model=AccountSessionOut, status_code=201)
async def create_guest_session(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AccountSessionOut:
    if not get_settings().is_vercel_deployment:
        raise HTTPException(status_code=404, detail="Guest workspaces are available on the hosted ASTRA service.")
    try:
        validate_session_signing_key()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    await enforce_auth_rate_limit(
        session,
        request,
        "guest-ip",
        "all",
        maximum=30,
        window_minutes=60,
    )
    user = await create_guest_account(session)
    return _account_session(user)


@api_router.get("/auth/me", response_model=AccountOut)
async def current_account(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> AccountOut:
    if user_id is None:
        raise HTTPException(status_code=404, detail="Accounts are not enabled for the local backend.")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="This guest session is no longer valid. Continue as guest to start a new workspace.",
        )
    return AccountOut(id=user.id, email=None if user.is_guest else user.email, is_guest=user.is_guest)


@api_router.get("/account/usage", response_model=AIUsageOut)
async def account_usage(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> AIUsageOut:
    used = await usage_for_today(session, user_id)
    if user_id is None or not get_settings().is_vercel_deployment:
        return AIUsageOut(used_today=used, daily_limit=None, remaining=None)
    remaining = max(0, DAILY_SHARED_MESSAGE_LIMIT - used)
    return AIUsageOut(
        used_today=used,
        daily_limit=DAILY_SHARED_MESSAGE_LIMIT,
        remaining=remaining,
    )


@api_router.get("/system", response_model=SystemSnapshot)
async def system(_: str | None = Depends(require_identity)) -> SystemSnapshot:
    return SystemSnapshot(**system_snapshot())


@api_router.get("/device/system", response_model=SystemSnapshot)
async def local_device_system(request: Request) -> SystemSnapshot:
    if get_settings().is_vercel_deployment:
        raise HTTPException(status_code=404, detail="Device system readings are available only through the local companion.")
    _require_local_device_request(request)
    return SystemSnapshot(**system_snapshot())


@api_router.get("/modules", response_model=list[ModuleInfo])
async def modules(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[ModuleInfo]:
    items = [dict(item) for item in MODULES]
    settings = get_settings()
    api_module = next(item for item in items if item["id"] == "api")
    if settings.is_vercel_deployment:
        api_module["summary"] = "Hosted HTTP API with token-protected routes and HTTP streaming; WebSockets are disabled."
    ai_module = next(item for item in items if item["id"] == "ai")
    selected: str | None = None
    try:
        selected = await read_ai_model(session, user_id)
        if settings.is_vercel_deployment and not (
            selected and selected.startswith(("gemini:", "openai:"))
        ):
            ai_module["status"] = "pending"
            ai_module["summary"] = "Select a configured Gemini or OpenAI cloud model in Settings."
        elif selected and selected.startswith(("gemini:", "openai:")):
            provider_name, model_name = selected.split(":", maxsplit=1)
            provider = GeminiProvider(model_name) if provider_name == "gemini" else OpenAIProvider(model_name)
            provider_label = "Gemini" if provider_name == "gemini" else "OpenAI"
            models = await provider.list_models()
            installed = any(item.name == model_name for item in models)
            ai_module["status"] = "online" if installed else "pending"
            ai_module["summary"] = (
                f"{provider_label} cloud model {model_name} is ready."
                if installed
                else f"{provider_label} is connected. Select an available model in Settings."
            )
        else:
            models = await get_language_model().list_models()
            installed = any(item.name == selected for item in models)
            ai_module["status"] = "online" if installed else "pending"
            ai_module["summary"] = f"Local Ollama model {selected} is ready." if installed else (
                "Ollama is online. Select an installed model in Settings."
                if models
                else "Ollama is online, but no local models are installed."
            )
    except AIProviderError:
        ai_module["status"] = "offline"
        ai_module["summary"] = (
            "Gemini is unavailable. Check the API key and network connection."
            if selected and selected.startswith("gemini:")
            else "OpenAI is unavailable. Check the API key and network connection."
            if selected and selected.startswith("openai:")
            else "Select a configured Gemini or OpenAI cloud model in Settings."
            if settings.is_vercel_deployment
            else "Ollama is unavailable. Start the local Ollama service to use AI chat."
        )
    voice_module = next(item for item in items if item["id"] == "voice")
    if settings.is_vercel_deployment:
        voice_module["status"] = "pending"
        voice_module["summary"] = (
            "Browser speech recognition is available in supported browsers; the hosted API receives recognized text. "
            "Local Whisper and Windows device actions require the optional local companion."
        )
    elif voice_model_installed():
        voice_module["status"] = "online"
        voice_module["summary"] = (
            "Local multilingual push-to-talk transcription with automatic language detection and spoken replies "
            "are available. "
            "Wake-word listening is off."
        )
    else:
        voice_module["summary"] = "Download the local speech model to enable push-to-talk transcription."
    memory_module = next(item for item in items if item["id"] == "memory")
    memory_module["status"] = "online"
    memory_module["summary"] = (
        "User-approved notes are stored in the managed database and used in hosted chats."
        if settings.is_vercel_deployment
        else "User-approved notes are stored privately in the local database and used in local chats."
    )
    research_module = next(item for item in items if item["id"] == "research")
    research_module["status"] = "online"
    research_module["summary"] = (
        "Free DuckDuckGo web search is available when the hosted backend can access the internet."
        if settings.is_vercel_deployment
        else "Free DuckDuckGo web search is available when this computer is online."
    )
    automation_module = next(item for item in items if item["id"] == "automation")
    apps = available_applications()
    automation_module["status"] = (
        "pending"
        if settings.is_vercel_deployment
        else "online"
        if apps
        else "offline"
    )
    automation_module["summary"] = (
        "Pair the optional Windows companion to open approved apps or public websites. Every action requires an on-device confirmation."
        if settings.is_vercel_deployment
        else f"Safe, allowlisted Windows launch actions available: {', '.join(apps)}. Every action requires an on-device confirmation."
        if apps
        else "Windows app launch controls are available only on Windows."
    )
    database_module = next(item for item in items if item["id"] == "database")
    if settings.is_vercel_deployment:
        database_module["name"] = "Managed PostgreSQL store"
        database_module["summary"] = "Conversations, settings, memories, tasks, and activity persist in managed PostgreSQL."
    system_module = next(item for item in items if item["id"] == "system_monitor")
    if settings.is_vercel_deployment:
        system_module["summary"] = "Live system readings describe the hosted Vercel runtime, not this device."
        productivity_module = next(item for item in items if item["id"] == "productivity")
        productivity_module["summary"] = (
            "Tasks persist in managed PostgreSQL. There is no always-on reminder worker in serverless hosting."
        )
    return [ModuleInfo.model_validate(item) for item in items]


@api_router.get("/automation/status", response_model=list[str])
async def automation_status(_: str | None = Depends(require_identity)) -> list[str]:
    return available_applications()


def _require_local_device_request(request: Request) -> str:
    if get_settings().is_vercel_deployment:
        raise HTTPException(status_code=404, detail="Device actions are available only through the local companion.")
    origin = request.headers.get("origin", "")
    if origin not in get_settings().cors_origin_list:
        raise HTTPException(status_code=403, detail="Pair ASTRA from an approved ASTRA website origin.")
    token = request.headers.get("x-astra-device-session", "")
    if not device_bridge.is_authorized(f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="Connect this browser to the local ASTRA companion first.")
    return origin


async def _run_local_device_action(
    request: Request,
    title: str,
    application: str | None = None,
    url: str | None = None,
) -> str:
    origin = _require_local_device_request(request)
    if url is not None:
        try:
            url = validate_public_url(url)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        title = f"Open this website in your browser:\n{url}"
    approved = await run_in_threadpool(confirm_device_action, title, origin)
    if not approved:
        raise HTTPException(status_code=403, detail="The action was not approved on this computer.")
    try:
        if application is not None:
            from app.services.automation import launch_application

            return await run_in_threadpool(launch_application, application)
        if url is not None:
            return await run_in_threadpool(open_approved_url, url)
    except AutomationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    raise HTTPException(status_code=422, detail="Choose a supported device action.")


@api_router.get("/device/status")
async def local_device_status(request: Request) -> dict[str, bool]:
    if get_settings().is_vercel_deployment:
        raise HTTPException(status_code=404, detail="The local companion is not running on the hosted backend.")
    origin = request.headers.get("origin", "")
    if origin not in get_settings().cors_origin_list:
        raise HTTPException(status_code=403, detail="Use an approved ASTRA website origin.")
    return {"available": True}


@api_router.get("/device/clients")
async def local_device_clients(request: Request) -> dict[str, bool]:
    if get_settings().is_vercel_deployment:
        raise HTTPException(status_code=404, detail="Device app status is available only through the local companion.")
    _require_local_device_request(request)
    return available_ai_clients()


@api_router.post("/device/pair", response_model=DevicePairOut)
async def pair_local_device(
    payload: DevicePairIn,
    request: Request,
) -> DevicePairOut:
    if get_settings().is_vercel_deployment:
        raise HTTPException(status_code=404, detail="The local companion is not running on the hosted backend.")
    origin = request.headers.get("origin", "")
    if origin not in get_settings().cors_origin_list:
        raise HTTPException(status_code=403, detail="Pair ASTRA from an approved ASTRA website origin.")
    token = device_bridge.pair(payload.pairing_code)
    if token is None:
        raise HTTPException(
            status_code=401,
            detail="Pairing code is invalid, expired, used, or locked. Restart the companion to get a new code.",
        )
    return DevicePairOut(access_token=token, expires_in=12 * 60 * 60)


@api_router.delete("/device/session", status_code=204)
async def revoke_local_device_session(request: Request) -> None:
    if get_settings().is_vercel_deployment:
        raise HTTPException(status_code=404, detail="The local companion is not running on the hosted backend.")
    origin = request.headers.get("origin", "")
    if origin not in get_settings().cors_origin_list:
        raise HTTPException(status_code=403, detail="Use an approved ASTRA website origin.")
    device_bridge.revoke(f"Bearer {request.headers.get('x-astra-device-session', '')}")


@api_router.post("/device/action")
async def run_local_device_action(
    payload: DeviceActionIn,
    request: Request,
) -> dict[str, str]:
    if payload.action == "launch_app" and payload.application is not None:
        title = f"Open {APPLICATION_LABELS[payload.application]}."
        message = await _run_local_device_action(request, title, application=payload.application)
    elif payload.action == "open_url" and payload.url is not None:
        message = await _run_local_device_action(request, "", url=payload.url)
    else:
        raise HTTPException(status_code=422, detail="Choose one supported device action.")
    return {"action": payload.action, "message": message}


@api_router.post("/automation/launch", response_model=AutomationLaunchOut)
async def automation_launch(
    payload: AutomationLaunchIn,
    request: Request,
) -> AutomationLaunchOut:
    message = await _run_local_device_action(
        request,
        f"Open {APPLICATION_LABELS[payload.application]}.",
        application=payload.application,
    )
    return AutomationLaunchOut(application=payload.application, message=message)


@api_router.get("/memory", response_model=list[MemoryOut])
async def memories(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[MemoryOut]:
    return [MemoryOut.model_validate(item) for item in await list_memories(session, user_id)]


@api_router.post("/memory", response_model=MemoryOut, status_code=201)
async def post_memory(
    payload: MemoryCreateIn,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> MemoryOut:
    return MemoryOut.model_validate(await create_memory(session, payload, user_id))


@api_router.patch("/memory/{memory_id}", response_model=MemoryOut)
async def patch_memory(
    memory_id: str,
    payload: MemoryUpdateIn,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> MemoryOut:
    memory = await get_memory(session, memory_id, user_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return MemoryOut.model_validate(await update_memory(session, memory, payload))


@api_router.delete("/memory/{memory_id}", status_code=204)
async def remove_memory(
    memory_id: str,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    memory = await get_memory(session, memory_id, user_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found.")
    await delete_memory(session, memory)


@api_router.post("/research/search", response_model=ResearchSearchOut)
async def research_search(
    payload: ResearchSearchIn,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> ResearchSearchOut:
    try:
        results = await run_in_threadpool(search_web, payload.query)
    except ResearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    await record_activity(
        "info",
        "research",
        "Web research completed.",
        f"{len(results)} source(s) returned.",
        session=session,
        owner_id=user_id,
    )
    await session.commit()
    return ResearchSearchOut(
        query=payload.query,
        results=[ResearchResultOut.model_validate(item) for item in results],
    )


async def _gemini_status() -> GeminiStatusOut:
    provider = GeminiProvider()
    if not provider.configured:
        instruction = (
            "Set GEMINI_API_KEY in Vercel project environment variables."
            if get_settings().is_vercel_deployment
            else "Set GEMINI_API_KEY in backend/.env, then restart ASTRA."
        )
        return GeminiStatusOut(
            error=instruction,
        )
    try:
        models = await provider.list_models()
    except AIProviderError as exc:
        return GeminiStatusOut(configured=True, error=str(exc))
    return GeminiStatusOut(
        configured=True,
        connected=True,
        models=[item.name for item in models],
    )


async def _openai_status() -> GeminiStatusOut:
    provider = OpenAIProvider()
    if not provider.configured:
        instruction = (
            "Set OPENAI_API_KEY in Vercel project environment variables."
            if get_settings().is_vercel_deployment
            else "Set OPENAI_API_KEY in backend/.env, then restart ASTRA."
        )
        return GeminiStatusOut(
            error=instruction,
        )
    try:
        models = await provider.list_models()
    except AIProviderError as exc:
        return GeminiStatusOut(configured=True, error=str(exc))
    return GeminiStatusOut(
        configured=True,
        connected=True,
        models=[item.name for item in models],
    )


async def _ollama_models_status() -> tuple[list[InstalledModel], str | None]:
    try:
        models = await asyncio.wait_for(get_language_model().list_models(), timeout=8.0)
        return models, None
    except AIProviderError as exc:
        return [], str(exc)
    except TimeoutError:
        return [], "Ollama did not respond in time. Check that the local service is ready."


@api_router.get("/ai/status", response_model=AIStatusOut)
async def ai_status(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> AIStatusOut:
    selected = await read_ai_model(session, user_id)
    (models, ollama_error), gemini_status, openai_status = await asyncio.gather(
        _ollama_models_status(),
        _gemini_status(),
        _openai_status(),
    )
    return AIStatusOut(
        connected=ollama_error is None,
        selected_model=selected,
        models=[_installed_model(item) for item in models],
        clients=available_ai_clients(),
        gemini=gemini_status,
        openai=openai_status,
        error=ollama_error,
    )


@api_router.put("/ai/model", response_model=AIStatusOut)
async def select_ai_model(
    payload: ModelSelectionIn,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> AIStatusOut:
    if payload.model.startswith("gemini:"):
        model_name = payload.model.removeprefix("gemini:")
        provider = GeminiProvider(model_name)
        try:
            models = await provider.list_models()
        except AIProviderError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        if not any(item.name == model_name for item in models):
            raise HTTPException(status_code=422, detail="Choose a model available through the Gemini API.")
    elif payload.model.startswith("openai:"):
        model_name = payload.model.removeprefix("openai:")
        provider = OpenAIProvider(model_name)
        try:
            models = await provider.list_models()
        except AIProviderError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        if not any(item.name == model_name for item in models):
            raise HTTPException(status_code=422, detail="Choose a text-generation model returned by the OpenAI API.")
    else:
        try:
            models = await get_language_model().list_models()
        except AIProviderError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        if not any(item.name == payload.model for item in models):
            location = "the hosted Ollama server" if get_settings().is_vercel_deployment else "this computer"
            raise HTTPException(status_code=422, detail=f"Choose a model installed in Ollama on {location}.")
    await write_ai_model(session, payload.model, user_id)
    return await ai_status(user_id, session)


@api_router.delete("/ai/model", response_model=AIStatusOut)
async def clear_selected_ai_model(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> AIStatusOut:
    await clear_ai_model(session, user_id)
    return await ai_status(user_id, session)


@api_router.get("/activity", response_model=list[ActivityOut])
async def activity(
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[ActivityOut]:
    rows = await list_activity(session, limit, user_id)
    return [
        ActivityOut(
            id=row.id,
            created_at=row.created_at,
            level=row.level,
            source=row.source,
            message=row.message,
            details=row.details,
        )
        for row in rows
    ]


@api_router.get("/voice/status", response_model=VoiceStatusOut)
async def voice_status(_: str | None = Depends(require_identity)) -> VoiceStatusOut:
    if get_settings().is_vercel_deployment:
        return VoiceStatusOut(
            ready=False,
            dependencies_installed=False,
            model=MODEL_NAME,
            languages=["Multilingual · automatic detection"],
            message="Local speech recognition is unavailable in the hosted backend.",
        )
    dependencies_installed = voice_dependencies_installed()
    ready = dependencies_installed and voice_model_installed()
    return VoiceStatusOut(
        ready=ready,
        dependencies_installed=dependencies_installed,
        model=MODEL_NAME,
        languages=["Multilingual · automatic detection"],
        message=(
            "Local speech recognition is ready."
            if ready
            else "Install backend requirements before downloading the local speech model."
            if not dependencies_installed
            else "The local speech model has not been downloaded."
        ),
    )


@api_router.post("/voice/model", response_model=VoiceStatusOut)
async def install_voice_model(_: str | None = Depends(require_identity)) -> VoiceStatusOut:
    if get_settings().is_vercel_deployment:
        raise HTTPException(status_code=503, detail="Local speech models cannot be installed in the hosted backend.")
    try:
        await run_in_threadpool(download_voice_model)
    except Exception as exc:
        logger.exception("Could not download the local speech model")
        raise HTTPException(
            status_code=503,
            detail="Could not download the local speech model. Check the internet connection and try again.",
        ) from exc
    return await voice_status(_)


@api_router.post("/voice/transcribe", response_model=VoiceTranscriptionOut)
async def transcribe_voice(
    audio: UploadFile = File(...),
    language: str = Form(default="auto"),
    _: str | None = Depends(require_identity),
) -> VoiceTranscriptionOut:
    if get_settings().is_vercel_deployment:
        raise HTTPException(status_code=503, detail="Voice transcription is available only through the local backend.")
    if not voice_dependencies_installed():
        raise HTTPException(status_code=503, detail="Install backend requirements before transcribing audio.")
    if not voice_model_installed():
        raise HTTPException(status_code=503, detail="Download the local speech model before recording.")
    if language not in {"auto", "en", "ur"}:
        raise HTTPException(status_code=422, detail="Choose automatic, English, or Urdu transcription.")
    content_type = (audio.content_type or "").split(";", maxsplit=1)[0].strip().lower()
    suffix_by_type = {
        "audio/aac": ".aac",
        "audio/flac": ".flac",
        "audio/mp3": ".mp3",
        "audio/mp4": ".mp4",
        "audio/mpeg": ".mp3",
        "audio/ogg": ".ogg",
        "audio/wav": ".wav",
        "audio/webm": ".webm",
        "audio/x-wav": ".wav",
    }
    suffix = suffix_by_type.get(content_type)
    if suffix is None:
        raise HTTPException(status_code=415, detail="Record audio in a supported browser format and try again.")

    try:
        audio_bytes = await audio.read(25 * 1024 * 1024 + 1)
        if not audio_bytes:
            raise HTTPException(status_code=422, detail="The recording is empty.")
        if len(audio_bytes) > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Record a shorter voice message (maximum 25 MB).")
        try:
            text_value, detected_language, duration = await run_in_threadpool(
                transcribe_audio,
                audio_bytes,
                suffix,
                None if language == "auto" else language,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Local voice transcription failed")
            raise HTTPException(
                status_code=422,
                detail="ASTRA could not decode this recording. Try recording again.",
            ) from exc
        return VoiceTranscriptionOut(text=text_value, language=detected_language, duration_seconds=duration)
    finally:
        await audio.close()


@api_router.get("/tasks", response_model=list[TaskOut])
async def get_tasks(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[TaskOut]:
    return [TaskOut.model_validate(item) for item in await list_tasks(session, user_id)]


@api_router.post("/tasks", response_model=TaskOut, status_code=201)
async def post_task(
    payload: TaskCreateIn,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    return TaskOut.model_validate(await create_task(session, payload, user_id))


@api_router.patch("/tasks/{task_id}", response_model=TaskOut)
async def patch_task(
    task_id: str,
    payload: TaskUpdateIn,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    task = await get_task(session, task_id, user_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return TaskOut.model_validate(await update_task(session, task, payload))


@api_router.delete("/tasks/{task_id}", status_code=204)
async def remove_task(
    task_id: str,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    task = await get_task(session, task_id, user_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    await delete_task(session, task)


@api_router.get("/settings", response_model=SettingsOut)
async def get_settings_route(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> SettingsOut:
    return SettingsOut(**await read_settings(session, user_id))


@api_router.put("/settings", response_model=SettingsOut)
async def put_settings_route(
    payload: SettingsIn,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> SettingsOut:
    try:
        values = await write_display_name(session, payload.user_display_name, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SettingsOut(**values)


@api_router.get("/conversations", response_model=list[ConversationSummary])
async def conversations(
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[ConversationSummary]:
    rows = await list_conversations(session, user_id)
    return [
        ConversationSummary(
            id=row.id,
            title=row.title,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@api_router.get("/conversations/{conversation_id}", response_model=ConversationOut)
async def conversation_detail(
    conversation_id: str,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> ConversationOut:
    conversation = await get_conversation(session, conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = sorted(conversation.messages, key=lambda item: item.created_at)
    return ConversationOut(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[_message(item) for item in messages],
    )


@api_router.delete("/conversations/{conversation_id}", status_code=204)
async def remove_conversation(
    conversation_id: str,
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    deleted = await delete_conversation(session, conversation_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")


def _personal_provider_credentials(key: str | None, provider: str | None) -> tuple[str | None, str | None]:
    cleaned_key = key.strip() if key else ""
    cleaned_provider = provider.strip().lower() if provider else ""
    if not cleaned_key:
        if cleaned_provider:
            raise HTTPException(status_code=422, detail="Paste an API key to use a personal provider.")
        return None, None
    if cleaned_provider not in {"gemini", "openai"}:
        raise HTTPException(status_code=422, detail="Choose Gemini or OpenAI for your personal API key.")
    if len(cleaned_key) > 512:
        raise HTTPException(status_code=422, detail="The personal API key is too long.")
    return cleaned_key, cleaned_provider


@api_router.post("/commands", response_model=CommandOut)
async def command(
    payload: CommandIn,
    provider_key: str | None = Header(default=None, alias="X-Astra-Provider-Key"),
    provider_name: str | None = Header(default=None, alias="X-Astra-Provider"),
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> CommandOut:
    provider_key, provider_name = _personal_provider_credentials(provider_key, provider_name)
    reserved = bool(user_id and get_settings().is_vercel_deployment and not provider_key)
    if reserved and not await reserve_shared_message(session, user_id):
        raise HTTPException(
            status_code=429,
            detail="Your 20 shared-key AI messages for today are used. Add your own Gemini or OpenAI key to continue.",
        )
    try:
        conversation, user_message, assistant_message = await handle_command(
            session,
            payload.text,
            payload.conversation_id,
            payload.response_language,
            user_id,
            provider_key,
            provider_name,
        )
    except ValueError as exc:
        if reserved:
            await release_shared_message(session, user_id)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LookupError as exc:
        if reserved:
            await release_shared_message(session, user_id)
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AIProviderError as exc:
        if reserved:
            await release_shared_message(session, user_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception:
        if reserved:
            await release_shared_message(session, user_id)
        raise
    return CommandOut(
        conversation_id=conversation.id,
        user_message=_message(user_message),
        assistant_message=_message(assistant_message),
        state="completed",
        model=(
            f"{provider_name}:personal-key"
            if provider_key and provider_name
            else get_language_model(await read_ai_model(session, user_id)).name
        ),
    )


@api_router.post("/commands/stream")
async def stream_command(
    payload: CommandIn,
    provider_key: str | None = Header(default=None, alias="X-Astra-Provider-Key"),
    provider_name: str | None = Header(default=None, alias="X-Astra-Provider"),
    user_id: str | None = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    provider_key, provider_name = _personal_provider_credentials(provider_key, provider_name)
    reserved = bool(user_id and get_settings().is_vercel_deployment and not provider_key)
    if reserved and not await reserve_shared_message(session, user_id):
        raise HTTPException(
            status_code=429,
            detail="Your 20 shared-key AI messages for today are used. Add your own Gemini or OpenAI key to continue.",
        )
    try:
        conversation, user_message, model, history = await prepare_stream_command(
            session,
            payload.text,
            payload.conversation_id,
            payload.response_language,
            user_id,
            provider_key,
            provider_name,
        )
    except ValueError as exc:
        if reserved:
            await release_shared_message(session, user_id)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LookupError as exc:
        if reserved:
            await release_shared_message(session, user_id)
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AIProviderError as exc:
        if reserved:
            await release_shared_message(session, user_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    def event(data: dict[str, object]) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate():
        completed = False
        yield event(
            {
                "type": "meta",
                "conversation_id": conversation.id,
                "model": model.name,
                "user_message": _message(user_message).model_dump(mode="json"),
            }
        )
        chunks: list[str] = []
        try:
            async for chunk in model.stream(history):
                chunks.append(chunk)
                yield event({"type": "token", "content": chunk})
            if not chunks:
                raise AIProviderError("Ollama completed without returning a reply.")
            provider_name = (
                "local AI"
                if model.name.startswith("ollama:")
                else "Gemini"
                if model.name.startswith("gemini:")
                else "OpenAI"
            )
            assistant_message = await save_streamed_reply(
                session,
                conversation,
                "".join(chunks),
                provider_name,
            )
            completed = True
            yield event({"type": "done", "assistant_message": _message(assistant_message).model_dump(mode="json")})
        except AIProviderError as exc:
            yield event({"type": "error", "message": str(exc)})
        except Exception:
            logger.exception("Unexpected error while streaming an AI response")
            yield event({"type": "error", "message": "ASTRA could not complete the AI response. Check the backend log."})
        finally:
            if reserved and not completed:
                await release_shared_message(session, user_id)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
