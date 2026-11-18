import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

from app.ai.provider import AIProviderError, GeminiProvider


def test_gemini_lists_generative_models_and_streams_sse(monkeypatch):
    settings = SimpleNamespace(gemini_api_key="test-key")
    monkeypatch.setattr("app.ai.provider.get_settings", lambda: settings)
    calls = []

    class FakeResponse:
        status_code = 200
        is_error = False

        def json(self):
            return {
                "models": [
                    {
                        "name": "models/gemini-2.5-flash",
                        "supportedGenerationMethods": ["generateContent"],
                    },
                    {
                        "name": "models/gemini-2.0-flash",
                        "supportedGenerationMethods": ["generateContent"],
                    },
                    {
                        "name": "models/gemini-2.5-flash-preview-tts",
                        "supportedGenerationMethods": ["generateContent"],
                    },
                    {
                        "name": "models/gemini-2.5-flash-image",
                        "supportedGenerationMethods": ["generateContent"],
                    },
                    {
                        "name": "models/nano-banana-pro-preview",
                        "supportedGenerationMethods": ["generateContent"],
                    },
                    {
                        "name": "models/text-embedding-004",
                        "supportedGenerationMethods": ["embedContent"],
                    },
                ]
            }

        def raise_for_status(self):
            return None

        async def aiter_lines(self):
            yield 'data: {"candidates":[{"content":{"parts":[{"text":"Gemini "}]}}]}'
            yield 'data: {"candidates":[{"content":{"parts":[{"text":"reply"}]}}]}'

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
    provider = GeminiProvider("gemini-2.5-flash")
    models = asyncio.run(provider.list_models())
    history = [
        {"role": "system", "content": "Be concise."},
        {"role": "user", "content": "Hello."},
        {"role": "assistant", "content": "Hi."},
        {"role": "user", "content": "How are you?"},
    ]
    chunks = asyncio.run(_collect(provider.stream(history)))

    assert provider.configured is True
    assert [model.name for model in models] == ["gemini-2.5-flash", "gemini-2.0-flash"]
    assert chunks == ["Gemini ", "reply"]
    assert calls[0][2] == {"x-goog-api-key": "test-key"}
    assert calls[1][0] == "POST"
    assert calls[1][2]["x-goog-api-key"] == "test-key"
    assert calls[1][3] == {
        "systemInstruction": {"parts": [{"text": "Be concise."}]},
        "contents": [
            {"role": "user", "parts": [{"text": "Hello."}]},
            {"role": "model", "parts": [{"text": "Hi."}]},
            {"role": "user", "parts": [{"text": "How are you?"}]},
        ],
    }


def test_gemini_requires_an_api_key(monkeypatch):
    monkeypatch.setattr(
        "app.ai.provider.get_settings",
        lambda: SimpleNamespace(gemini_api_key=""),
    )
    provider = GeminiProvider()

    assert provider.configured is False
    try:
        asyncio.run(provider.list_models())
    except AIProviderError as exc:
        assert str(exc) == "Set GEMINI_API_KEY in backend/.env, then restart ASTRA."
    else:
        raise AssertionError("Gemini must reject model listing without an API key.")


def test_gemini_explains_when_a_listed_model_cannot_generate(monkeypatch):
    monkeypatch.setattr(
        "app.ai.provider.get_settings",
        lambda: SimpleNamespace(gemini_api_key="test-key"),
    )

    class ErrorResponse:
        status_code = 404
        is_error = True

        async def aread(self):
            return b'{"error":{"code":404,"status":"NOT_FOUND","message":"Model unavailable"}}'

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
    provider = GeminiProvider("gemini-2.5-pro")

    try:
        asyncio.run(_collect(provider.stream([{"role": "user", "content": "Hello"}])))
    except AIProviderError as exc:
        assert "unavailable for generation" in str(exc)
        assert "Settings" in str(exc)
    else:
        raise AssertionError("Gemini must report a model that cannot generate.")


async def _collect(chunks):
    return [chunk async for chunk in chunks]
