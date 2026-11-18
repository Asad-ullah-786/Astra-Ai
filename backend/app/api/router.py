from datetime import datetime, timezone
import asyncio
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.ai.provider import AIProviderError, GeminiProvider, InstalledModel, OpenAIProvider, get_language_model
from app.api.schemas import (
    AIStatusOut,
    ActivityOut,
    AutomationLaunchIn,
    AutomationLaunchOut,
    CommandIn,
    CommandOut,
    ConversationOut,
    ConversationSummary,
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
from app.security.access import require_token
from app.services.activity import list_activity, record_activity
from app.services.ai_clients import available_ai_clients
from app.services.automation import AutomationError, available_applications, launch_application
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
        model=await read_ai_model(session) or "none",
        time_utc=datetime.now(timezone.utc),
    )


@api_router.get("/system", response_model=SystemSnapshot)
async def system(_: None = Depends(require_token)) -> SystemSnapshot:
    return SystemSnapshot(**system_snapshot())


@api_router.get("/modules", response_model=list[ModuleInfo])
async def modules(
    _: None = Depends(require_token),
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
        selected = await read_ai_model(session)
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
        voice_module["summary"] = "Local speech transcription is unavailable in the hosted backend."
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
    automation_module["status"] = "online" if apps else "offline"
    automation_module["summary"] = (
        "Windows app launching is only available from a local Windows backend."
        if settings.is_vercel_deployment
        else f"Safe, allowlisted Windows launch actions available: {', '.join(apps)}. No arbitrary shell execution."
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
async def automation_status(_: None = Depends(require_token)) -> list[str]:
    return available_applications()


@api_router.post("/automation/launch", response_model=AutomationLaunchOut)
async def automation_launch(
    payload: AutomationLaunchIn,
    _: None = Depends(require_token),
) -> AutomationLaunchOut:
    try:
        message = await run_in_threadpool(launch_application, payload.application)
    except AutomationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return AutomationLaunchOut(application=payload.application, message=message)


@api_router.get("/memory", response_model=list[MemoryOut])
async def memories(
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> list[MemoryOut]:
    return [MemoryOut.model_validate(item) for item in await list_memories(session)]


@api_router.post("/memory", response_model=MemoryOut, status_code=201)
async def post_memory(
    payload: MemoryCreateIn,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> MemoryOut:
    return MemoryOut.model_validate(await create_memory(session, payload))


@api_router.patch("/memory/{memory_id}", response_model=MemoryOut)
async def patch_memory(
    memory_id: str,
    payload: MemoryUpdateIn,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> MemoryOut:
    memory = await get_memory(session, memory_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return MemoryOut.model_validate(await update_memory(session, memory, payload))


@api_router.delete("/memory/{memory_id}", status_code=204)
async def remove_memory(
    memory_id: str,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> None:
    memory = await get_memory(session, memory_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found.")
    await delete_memory(session, memory)


@api_router.post("/research/search", response_model=ResearchSearchOut)
async def research_search(
    payload: ResearchSearchIn,
    _: None = Depends(require_token),
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
    if get_settings().is_vercel_deployment:
        return [], "Local Ollama is unavailable in the hosted backend."
    try:
        models = await asyncio.wait_for(get_language_model().list_models(), timeout=8.0)
        return models, None
    except AIProviderError as exc:
        return [], str(exc)
    except TimeoutError:
        return [], "Ollama did not respond in time. Check that the local service is ready."


@api_router.get("/ai/status", response_model=AIStatusOut)
async def ai_status(
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> AIStatusOut:
    selected = await read_ai_model(session)
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
    _: None = Depends(require_token),
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
            raise HTTPException(status_code=422, detail="Choose a model installed in Ollama on this computer.")
    await write_ai_model(session, payload.model)
    return await ai_status(_, session)


@api_router.delete("/ai/model", response_model=AIStatusOut)
async def clear_selected_ai_model(
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> AIStatusOut:
    await clear_ai_model(session)
    return await ai_status(_, session)


@api_router.get("/activity", response_model=list[ActivityOut])
async def activity(
    limit: int = Query(default=50, ge=1, le=200),
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> list[ActivityOut]:
    rows = await list_activity(session, limit)
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
async def voice_status(_: None = Depends(require_token)) -> VoiceStatusOut:
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
async def install_voice_model(_: None = Depends(require_token)) -> VoiceStatusOut:
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
    _: None = Depends(require_token),
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
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> list[TaskOut]:
    return [TaskOut.model_validate(item) for item in await list_tasks(session)]


@api_router.post("/tasks", response_model=TaskOut, status_code=201)
async def post_task(
    payload: TaskCreateIn,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    return TaskOut.model_validate(await create_task(session, payload))


@api_router.patch("/tasks/{task_id}", response_model=TaskOut)
async def patch_task(
    task_id: str,
    payload: TaskUpdateIn,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    task = await get_task(session, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return TaskOut.model_validate(await update_task(session, task, payload))


@api_router.delete("/tasks/{task_id}", status_code=204)
async def remove_task(
    task_id: str,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> None:
    task = await get_task(session, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    await delete_task(session, task)


@api_router.get("/settings", response_model=SettingsOut)
async def get_settings_route(
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> SettingsOut:
    return SettingsOut(**await read_settings(session))


@api_router.put("/settings", response_model=SettingsOut)
async def put_settings_route(
    payload: SettingsIn,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> SettingsOut:
    try:
        values = await write_display_name(session, payload.user_display_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SettingsOut(**values)


@api_router.get("/conversations", response_model=list[ConversationSummary])
async def conversations(
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> list[ConversationSummary]:
    rows = await list_conversations(session)
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
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> ConversationOut:
    conversation = await get_conversation(session, conversation_id)
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
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> None:
    deleted = await delete_conversation(session, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")


@api_router.post("/commands", response_model=CommandOut)
async def command(
    payload: CommandIn,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> CommandOut:
    try:
        conversation, user_message, assistant_message = await handle_command(
            session,
            payload.text,
            payload.conversation_id,
            payload.response_language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return CommandOut(
        conversation_id=conversation.id,
        user_message=_message(user_message),
        assistant_message=_message(assistant_message),
        state="completed",
        model=get_language_model(await read_ai_model(session)).name,
    )


@api_router.post("/commands/stream")
async def stream_command(
    payload: CommandIn,
    _: None = Depends(require_token),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    try:
        conversation, user_message, model, history = await prepare_stream_command(
            session,
            payload.text,
            payload.conversation_id,
            payload.response_language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    def event(data: dict[str, object]) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate():
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
            yield event({"type": "done", "assistant_message": _message(assistant_message).model_dump(mode="json")})
        except AIProviderError as exc:
            yield event({"type": "error", "message": str(exc)})
        except Exception:
            logger.exception("Unexpected error while streaming a local AI response")
            yield event({"type": "error", "message": "ASTRA could not complete the local AI response. Check the backend log."})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
