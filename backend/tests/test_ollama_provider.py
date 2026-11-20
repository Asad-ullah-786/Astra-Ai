import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from app.ai.provider import AIProviderError, OllamaProvider, get_language_model


def hosted_settings(url="https://ollama.example.com", api_key="gateway-secret"):
    return SimpleNamespace(
        ollama_url=url,
        ollama_api_key=api_key,
        is_vercel_deployment=True,
    )


def test_hosted_ollama_uses_https_and_optional_gateway_auth(monkeypatch):
    settings = hosted_settings()
    monkeypatch.setattr("app.ai.provider.get_settings", lambda: settings)

    provider = get_language_model("qwen2.5:3b")

    assert isinstance(provider, OllamaProvider)
    assert provider.base_url == "https://ollama.example.com"
    assert provider.headers == {"Authorization": "Bearer gateway-secret"}


def test_hosted_ollama_uses_the_configured_endpoint_for_model_list_and_stream(monkeypatch):
    settings = hosted_settings(api_key="gateway-secret")
    monkeypatch.setattr("app.ai.provider.get_settings", lambda: settings)
    calls = []

    class Response:
        is_error = False

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "models": [
                    {
                        "name": "qwen2.5:3b",
                        "size": 1_000_000_000,
                        "details": {"parameter_size": "3B"},
                    }
                ]
            }

        async def aread(self):
            return b""

        async def aiter_lines(self):
            yield '{"message":{"content":"Hosted "}}'
            yield '{"message":{"content":"reply"}}'

    class FakeClient:
        def __init__(self, **kwargs):
            calls.append(("client", kwargs["base_url"]))

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, path, *, headers):
            calls.append(("GET", path, headers))
            return Response()

        @asynccontextmanager
        async def stream(self, method, path, *, headers, json):
            calls.append((method, path, headers, json))
            yield Response()

    monkeypatch.setattr("app.ai.provider.httpx.AsyncClient", FakeClient)
    provider = OllamaProvider("qwen2.5:3b")

    models = asyncio.run(provider.list_models())

    async def collect():
        return [chunk async for chunk in provider.stream([{"role": "user", "content": "Hello"}])]

    reply = asyncio.run(collect())

    assert [model.name for model in models] == ["qwen2.5:3b"]
    assert reply == ["Hosted ", "reply"]
    assert calls[1] == ("GET", "/api/tags", {"Authorization": "Bearer gateway-secret"})
    assert calls[3][0:3] == (
        "POST",
        "/api/chat",
        {"Authorization": "Bearer gateway-secret"},
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://ollama.example.com",
        "http://127.0.0.1:11434",
        "https://127.0.0.1:11434",
        "https://192.168.1.5:11434",
        "https://user:password@ollama.example.com",
        "https://ollama.example.com/nested/path",
    ],
)
def test_hosted_ollama_rejects_non_public_or_invalid_endpoints(monkeypatch, url):
    monkeypatch.setattr("app.ai.provider.get_settings", lambda: hosted_settings(url))

    with pytest.raises(AIProviderError):
        OllamaProvider()
