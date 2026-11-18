import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

from app.ai.provider import AIProviderError, OpenAIProvider


def test_openai_discovers_chat_models_and_streams_sse(monkeypatch):
    monkeypatch.setattr(
        "app.ai.provider.get_settings",
        lambda: SimpleNamespace(openai_api_key="test-key"),
    )
    calls = []

    class FakeResponse:
        status_code = 200
        is_error = False

        def json(self):
            return {
                "data": [
                    {"id": "gpt-4.1-mini"},
                    {"id": "o3-mini"},
                    {"id": "gpt-4o-mini-audio-preview"},
                    {"id": "gpt-live-1"},
                    {"id": "text-embedding-3-small"},
                    {"id": "gpt-image-1"},
                ]
            }

        def raise_for_status(self):
            return None

        async def aiter_lines(self):
            yield 'data: {"choices":[{"delta":{"content":"OpenAI "}}]}'
            yield 'data: {"choices":[{"delta":{"content":"reply"}}]}'
            yield "data: [DONE]"

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, *, headers):
            calls.append(("GET", url, headers, None))
            return FakeResponse()

        @asynccontextmanager
        async def stream(self, method, url, *, headers, json):
            calls.append((method, url, headers, json))
            yield FakeResponse()

    monkeypatch.setattr("app.ai.provider.httpx.AsyncClient", FakeClient)
    provider = OpenAIProvider("gpt-4.1-mini")
    models = asyncio.run(provider.list_models())
    history = [
        {"role": "system", "content": "Be concise."},
        {"role": "user", "content": "Hello."},
    ]
    chunks = asyncio.run(_collect(provider.stream(history)))

    assert provider.configured is True
    assert [model.name for model in models] == ["gpt-4.1-mini", "o3-mini"]
    assert chunks == ["OpenAI ", "reply"]
    assert calls[0][2] == {"Authorization": "Bearer test-key"}
    assert calls[1][0] == "POST"
    assert calls[1][1] == "https://api.openai.com/v1/chat/completions"
    assert calls[1][2]["Authorization"] == "Bearer test-key"
    assert calls[1][3] == {
        "model": "gpt-4.1-mini",
        "messages": history,
        "stream": True,
    }


def test_openai_requires_an_api_key(monkeypatch):
    monkeypatch.setattr(
        "app.ai.provider.get_settings",
        lambda: SimpleNamespace(openai_api_key=""),
    )
    provider = OpenAIProvider()

    assert provider.configured is False
    try:
        asyncio.run(provider.list_models())
    except AIProviderError as exc:
        assert str(exc) == "Set OPENAI_API_KEY in backend/.env, then restart ASTRA."
    else:
        raise AssertionError("OpenAI must reject model listing without an API key.")


def test_openai_explains_exhausted_api_credits(monkeypatch):
    monkeypatch.setattr(
        "app.ai.provider.get_settings",
        lambda: SimpleNamespace(openai_api_key="test-key"),
    )

    class ErrorResponse:
        status_code = 429
        is_error = True

        async def aread(self):
            return (
                b'{"error":{"type":"insufficient_quota",'
                b'"code":"credit_balance_exhausted","message":"No credits"}}'
            )

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        @asynccontextmanager
        async def stream(self, method, url, *, headers, json):
            yield ErrorResponse()

    monkeypatch.setattr("app.ai.provider.httpx.AsyncClient", FakeClient)
    provider = OpenAIProvider("gpt-4.1-mini")

    try:
        asyncio.run(_collect(provider.stream([{"role": "user", "content": "Hello"}])))
    except AIProviderError as exc:
        assert "no remaining credits" in str(exc)
        assert "select a working Gemini model" in str(exc)
    else:
        raise AssertionError("OpenAI must explain when its API account has no remaining credits.")


async def _collect(chunks):
    return [chunk async for chunk in chunks]
