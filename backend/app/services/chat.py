from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.provider import (
    AIProviderError,
    GeminiProvider,
    LanguageModel,
    OllamaProvider,
    OpenAIProvider,
    get_language_model,
)
from app.database.base import utcnow
from app.database.models import ChatMessage, Conversation
from app.services.activity import record_activity
from app.services.memory import memory_context


def _title_from(text: str) -> str:
    compact = " ".join(text.split())
    if len(compact) <= 80:
        return compact
    return compact[:77] + "..."


def _language_instruction(response_language: str | None) -> str:
    focus_instruction = (
        "Answer the user's latest request directly and accurately. "
        "Do not repeat the question, introduce unrelated topics, or add an unnecessary follow-up question. "
        "If you are unsure, say so rather than guessing. "
    )
    if response_language:
        return (
            f"{focus_instruction}"
            f"The user's spoken language was detected as ISO code '{response_language}'. "
            "Reply in that language, using the same writing system as the transcript. "
            "Be warm and conversational; do not translate unless asked. "
            "For spoken replies, use 1-2 brief sentences; give more detail only if requested."
        )
    return (
        f"{focus_instruction}"
        "Reply in the same language and writing system as the user's latest message. "
        "Be warm and concise; do not translate unless asked."
    )


async def list_conversations(
    session: AsyncSession,
    owner_id: str | None = None,
) -> list[Conversation]:
    statement = select(Conversation).where(Conversation.owner_id == owner_id)
    result = await session.scalars(statement.order_by(Conversation.updated_at.desc()))
    return list(result)


async def get_conversation(
    session: AsyncSession,
    conversation_id: str,
    owner_id: str | None = None,
) -> Conversation | None:
    statement = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.owner_id == owner_id,
    )
    result = await session.scalars(statement.options(selectinload(Conversation.messages)))
    return result.first()


async def delete_conversation(
    session: AsyncSession,
    conversation_id: str,
    owner_id: str | None = None,
) -> bool:
    conversation = await get_conversation(session, conversation_id, owner_id)
    if conversation is None:
        return False
    await session.execute(delete(ChatMessage).where(ChatMessage.conversation_id == conversation_id))
    await session.delete(conversation)
    await record_activity(
        "info",
        "chat",
        "Deleted a conversation",
        details=conversation_id,
        session=session,
        owner_id=conversation.owner_id,
    )
    await session.commit()
    return True


async def handle_command(
    session: AsyncSession,
    text: str,
    conversation_id: str | None,
    response_language: str | None = None,
    owner_id: str | None = None,
    provider_key: str | None = None,
    provider_name: str | None = None,
) -> tuple[Conversation, ChatMessage, ChatMessage]:
    cleaned = " ".join(text.split())
    if not cleaned:
        raise ValueError("Command text is empty")
    if len(cleaned) > 4000:
        raise ValueError("Command text exceeds 4000 characters")

    existing_messages: list[ChatMessage] = []
    if conversation_id:
        conversation = await get_conversation(session, conversation_id, owner_id)
        if conversation is None:
            raise LookupError("Conversation not found")
        existing_messages = list(conversation.messages)
    else:
        conversation = Conversation(
            id=str(uuid4()),
            owner_id=owner_id,
            title=_title_from(cleaned),
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        session.add(conversation)
        await session.flush()

    history = [
        {"role": message.role, "content": message.content}
        for message in sorted(existing_messages, key=lambda item: item.created_at)
    ]
    saved_memory = await memory_context(session, owner_id)
    if saved_memory:
        history.insert(0, {"role": "system", "content": saved_memory})
    history.append({"role": "system", "content": _language_instruction(response_language)})
    user_message = ChatMessage(
        id=str(uuid4()),
        owner_id=owner_id,
        conversation_id=conversation.id,
        role="user",
        content=cleaned,
        created_at=utcnow(),
    )
    history.append({"role": "user", "content": cleaned})
    from app.services.settings import read_ai_model

    selected_model = await read_ai_model(session, owner_id)
    model = _command_model(selected_model, provider_key, provider_name)
    reply = await model.complete(history)
    assistant_message = ChatMessage(
        id=str(uuid4()),
        owner_id=owner_id,
        conversation_id=conversation.id,
        role="assistant",
        content=reply,
        created_at=utcnow(),
    )
    conversation.updated_at = utcnow()
    session.add_all([user_message, assistant_message])
    await record_activity(
        "info",
        "chat",
        "Saved a text command",
        details=conversation.id,
        session=session,
        owner_id=owner_id,
    )
    await session.commit()
    await session.refresh(conversation)
    await session.refresh(user_message)
    await session.refresh(assistant_message)
    return conversation, user_message, assistant_message


async def save_device_command(
    session: AsyncSession,
    text: str,
    reply: str,
    conversation_id: str | None,
    model: str,
    owner_id: str | None = None,
) -> tuple[Conversation, ChatMessage, ChatMessage]:
    cleaned = " ".join(text.split())
    cleaned_reply = reply.strip()
    if not cleaned or len(cleaned) > 4000:
        raise ValueError("Command text must contain 1 to 4000 characters.")
    if not cleaned_reply or len(cleaned_reply) > 16000:
        raise ValueError("The local AI reply must contain 1 to 16000 characters.")
    if conversation_id:
        conversation = await get_conversation(session, conversation_id, owner_id)
        if conversation is None:
            raise LookupError("Conversation not found.")
    else:
        conversation = Conversation(
            id=str(uuid4()),
            owner_id=owner_id,
            title=_title_from(cleaned),
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        session.add(conversation)
        await session.flush()

    user_message = ChatMessage(
        id=str(uuid4()),
        owner_id=owner_id,
        conversation_id=conversation.id,
        role="user",
        content=cleaned,
        created_at=utcnow(),
    )
    assistant_message = ChatMessage(
        id=str(uuid4()),
        owner_id=owner_id,
        conversation_id=conversation.id,
        role="assistant",
        content=cleaned_reply,
        created_at=utcnow(),
    )
    conversation.updated_at = utcnow()
    session.add_all([user_message, assistant_message])
    await record_activity(
        "info",
        "chat",
        f"Completed a local Ollama response using {model}",
        details=conversation.id,
        session=session,
        owner_id=owner_id,
    )
    await session.commit()
    await session.refresh(conversation)
    await session.refresh(user_message)
    await session.refresh(assistant_message)
    return conversation, user_message, assistant_message


async def prepare_stream_command(
    session: AsyncSession,
    text: str,
    conversation_id: str | None,
    response_language: str | None = None,
    owner_id: str | None = None,
    provider_key: str | None = None,
    provider_name: str | None = None,
) -> tuple[Conversation, ChatMessage, LanguageModel, list[dict[str, str]]]:
    cleaned = " ".join(text.split())
    if not cleaned:
        raise ValueError("Command text is empty")
    if len(cleaned) > 4000:
        raise ValueError("Command text exceeds 4000 characters")

    from app.services.settings import read_ai_model

    model = _command_model(await read_ai_model(session, owner_id), provider_key, provider_name)
    installed = await model.list_models()
    if not any(item.name == model.model for item in installed):
        if isinstance(model, OllamaProvider):
            raise AIProviderError("Select an installed Ollama model in Settings before chatting.")
        if isinstance(model, GeminiProvider):
            raise AIProviderError("Select an available Gemini model in Settings before chatting.")
        if isinstance(model, OpenAIProvider):
            raise AIProviderError("Select an available OpenAI model in Settings before chatting.")
        raise AIProviderError("Select an available AI model in Settings before chatting.")

    existing_messages: list[ChatMessage] = []
    if conversation_id:
        conversation = await get_conversation(session, conversation_id, owner_id)
        if conversation is None:
            raise LookupError("Conversation not found")
        existing_messages = list(conversation.messages)
    else:
        conversation = Conversation(
            id=str(uuid4()),
            owner_id=owner_id,
            title=_title_from(cleaned),
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        session.add(conversation)
        await session.flush()

    history = [
        {"role": item.role, "content": item.content}
        for item in sorted(existing_messages, key=lambda message: message.created_at)
    ]
    saved_memory = await memory_context(session, owner_id)
    if saved_memory:
        history.insert(0, {"role": "system", "content": saved_memory})
    history.append({"role": "system", "content": _language_instruction(response_language)})
    user_message = ChatMessage(
        id=str(uuid4()),
        owner_id=owner_id,
        conversation_id=conversation.id,
        role="user",
        content=cleaned,
        created_at=utcnow(),
    )
    history.append({"role": "user", "content": cleaned})
    session.add(user_message)
    provider_name = (
        "local AI"
        if isinstance(model, OllamaProvider)
        else "Gemini"
        if isinstance(model, GeminiProvider)
        else "OpenAI"
    )
    article = "an" if provider_name == "OpenAI" else "a"
    await record_activity(
        "info",
        "chat",
        f"Started {article} {provider_name} response",
        details=conversation.id,
        session=session,
        owner_id=owner_id,
    )
    await session.commit()
    await session.refresh(conversation)
    await session.refresh(user_message)
    return conversation, user_message, model, history


def _command_model(
    selected_model: str | None,
    provider_key: str | None,
    provider_name: str | None,
) -> LanguageModel:
    if not provider_key:
        return get_language_model(selected_model)
    if provider_name not in {"gemini", "openai"}:
        raise ValueError("Choose Gemini or OpenAI for your personal API key.")
    if len(provider_key) > 512:
        raise ValueError("The personal API key is too long.")

    if selected_model and selected_model.startswith(f"{provider_name}:"):
        model_name = selected_model.removeprefix(f"{provider_name}:")
    else:
        model_name = "gemini-2.5-flash" if provider_name == "gemini" else "gpt-4o-mini"
    return get_language_model(f"{provider_name}:{model_name}", provider_key)


async def save_streamed_reply(
    session: AsyncSession,
    conversation: Conversation,
    content: str,
    provider_name: str = "local AI",
) -> ChatMessage:
    assistant_message = ChatMessage(
        id=str(uuid4()),
        owner_id=conversation.owner_id,
        conversation_id=conversation.id,
        role="assistant",
        content=content,
        created_at=utcnow(),
    )
    conversation.updated_at = utcnow()
    session.add(assistant_message)
    article = "an" if provider_name == "OpenAI" else "a"
    await record_activity(
        "info",
        "chat",
        f"Completed {article} {provider_name} response",
        details=conversation.id,
        session=session,
        owner_id=conversation.owner_id,
    )
    await session.commit()
    await session.refresh(assistant_message)
    return assistant_message
