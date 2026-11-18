from collections.abc import AsyncIterator
from dataclasses import dataclass
import json
from typing import Protocol
from urllib.parse import quote, urlsplit

import httpx

from app.config import get_settings


def _is_vercel_deployment() -> bool:
    return bool(getattr(get_settings(), "is_vercel_deployment", False))


class AIProviderError(RuntimeError):
    """The selected AI provider cannot be used."""


@dataclass(frozen=True)
class InstalledModel:
    name: str
    size: int
    parameter_size: str | None
    modified_at: str | None


class LanguageModel(Protocol):
    name: str
    model: str

    async def complete(self, history: list[dict[str, str]]) -> str:
        ...

    def stream(self, history: list[dict[str, str]]) -> AsyncIterator[str]:
        ...

    async def list_models(self) -> list[InstalledModel]:
        ...


async def _error_details(response: httpx.Response) -> dict[str, object]:
    try:
        payload = json.loads(await response.aread())
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    error = payload.get("error")
    return error if isinstance(error, dict) else {}


class OllamaProvider(LanguageModel):
    def __init__(self, model: str | None = None) -> None:
        settings = get_settings()
        self.base_url = settings.ollama_url.rstrip("/")
        endpoint = urlsplit(self.base_url)
        if endpoint.scheme != "http" or endpoint.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise AIProviderError("ASTRA only connects to an Ollama service on this computer.")
        self.model = model.strip() if model else ""
        self.name = f"ollama:{self.model}" if self.model else "ollama (no model selected)"
        self.timeout = httpx.Timeout(300.0, connect=2.0)

    async def complete(self, history: list[dict[str, str]]) -> str:
        return "".join([chunk async for chunk in self.stream(history)])

    async def list_models(self) -> list[InstalledModel]:
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(8.0, connect=2.0),
            ) as client:
                response = await client.get("/api/tags")
                response.raise_for_status()
        except (httpx.HTTPError, ValueError) as exc:
            raise AIProviderError(
                "Ollama is unavailable. Start Ollama on this computer and try again."
            ) from exc

        try:
            data = response.json()
            models = data["models"]
            if not isinstance(models, list):
                raise TypeError("models must be a list")
            return [
                InstalledModel(
                    name=item["name"],
                    size=int(item.get("size", 0)),
                    parameter_size=(
                        (item.get("details") or {}).get("parameter_size")
                        if isinstance(item.get("details") or {}, dict)
                        else None
                    ),
                    modified_at=item.get("modified_at"),
                )
                for item in models
                if isinstance(item, dict) and isinstance(item.get("name"), str)
            ]
        except (KeyError, TypeError, ValueError) as exc:
            raise AIProviderError("Ollama returned an invalid model list.") from exc

    async def stream(self, history: list[dict[str, str]]) -> AsyncIterator[str]:
        if not self.model:
            raise AIProviderError("Select an installed Ollama model in Settings before chatting.")

        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    "/api/chat",
                    json={"model": self.model, "messages": history, "stream": True},
                ) as response:
                    if response.is_error:
                        detail = (await response.aread()).decode("utf-8", errors="replace")[:500]
                        raise AIProviderError(f"Ollama could not generate a reply: {detail}")
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            payload = json.loads(line)
                        except json.JSONDecodeError as exc:
                            raise AIProviderError("Ollama returned an invalid response stream.") from exc
                        if not isinstance(payload, dict):
                            raise AIProviderError("Ollama returned an invalid response stream.")
                        if payload.get("error"):
                            raise AIProviderError(f"Ollama error: {payload['error']}")
                        message = payload.get("message") or {}
                        if not isinstance(message, dict):
                            raise AIProviderError("Ollama returned an invalid response stream.")
                        content = message.get("content", "")
                        if content:
                            yield content
        except AIProviderError:
            raise
        except httpx.HTTPError as exc:
            raise AIProviderError(
                "The Ollama connection failed while generating a reply. Check that Ollama is running."
            ) from exc


class GeminiProvider(LanguageModel):
    base_url = "https://generativelanguage.googleapis.com/v1beta"
    timeout = httpx.Timeout(120.0, connect=10.0)
    status_timeout = httpx.Timeout(15.0, connect=5.0)
    non_chat_model_markers = (
        "computer-use",
        "deep-research",
        "embedding",
        "image",
        "live",
        "lyria",
        "nano-banana",
        "omni",
        "robotics",
        "transcribe",
        "tts",
    )

    def __init__(self, model: str | None = None) -> None:
        self.api_key = get_settings().gemini_api_key.strip()
        self.model = model.strip() if model else ""
        self.name = f"gemini:{self.model}" if self.model else "gemini (no model selected)"

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            instruction = (
                "Set GEMINI_API_KEY in Vercel project environment variables."
                if _is_vercel_deployment()
                else "Set GEMINI_API_KEY in backend/.env, then restart ASTRA."
            )
            raise AIProviderError(instruction)
        return {"x-goog-api-key": self.api_key}

    @classmethod
    def supports_text_chat(cls, model_id: str) -> bool:
        normalized = model_id.lower()
        return not any(marker in normalized for marker in cls.non_chat_model_markers)

    async def list_models(self) -> list[InstalledModel]:
        try:
            async with httpx.AsyncClient(timeout=self.status_timeout) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=self._headers(),
                )
                if response.status_code in {400, 401, 403}:
                    raise AIProviderError("Gemini rejected GEMINI_API_KEY. Check the key and its API access.")
                if response.status_code == 429:
                    raise AIProviderError("Gemini rate limit reached. Wait before checking the connection again.")
                response.raise_for_status()
        except AIProviderError:
            raise
        except httpx.HTTPError as exc:
            raise AIProviderError("Could not reach the Gemini API. Check the internet connection and try again.") from exc

        try:
            data = response.json()
            models = data["models"]
            if not isinstance(models, list):
                raise TypeError("models must be a list")
            return [
                InstalledModel(
                    name=item["name"].removeprefix("models/"),
                    size=0,
                    parameter_size=None,
                    modified_at=None,
                )
                for item in models
                if isinstance(item, dict)
                and isinstance(item.get("name"), str)
                and self.supports_text_chat(item["name"].removeprefix("models/"))
                and "generateContent" in item.get("supportedGenerationMethods", [])
            ]
        except (KeyError, TypeError, ValueError) as exc:
            raise AIProviderError("Gemini returned an invalid model list.") from exc

    def _request_body(self, history: list[dict[str, str]]) -> dict[str, object]:
        system_parts: list[dict[str, str]] = []
        contents: list[dict[str, object]] = []
        for item in history:
            text = item["content"]
            if item["role"] == "system":
                system_parts.append({"text": text})
                continue
            contents.append({
                "role": "model" if item["role"] == "assistant" else "user",
                "parts": [{"text": text}],
            })

        body: dict[str, object] = {"contents": contents}
        if system_parts:
            body["systemInstruction"] = {"parts": system_parts}
        return body

    async def complete(self, history: list[dict[str, str]]) -> str:
        return "".join([chunk async for chunk in self.stream(history)])

    async def stream(self, history: list[dict[str, str]]) -> AsyncIterator[str]:
        if not self.model:
            raise AIProviderError("Select an available Gemini model in Settings before chatting.")

        url = f"{self.base_url}/models/{quote(self.model, safe='')}:streamGenerateContent?alt=sse"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    url,
                    headers={**self._headers(), "Accept": "text/event-stream"},
                    json=self._request_body(history),
                ) as response:
                    if response.is_error:
                        details = await _error_details(response)
                        if response.status_code == 404:
                            raise AIProviderError(
                                f"Gemini model '{self.model}' is unavailable for generation. "
                                "Select another Gemini model in Settings."
                            )
                        if response.status_code in {400, 401, 403}:
                            raise AIProviderError("Gemini rejected the request. Check the API key and model access.")
                        if response.status_code == 429:
                            raise AIProviderError("Gemini rate limit reached. Wait before trying again.")
                        if details.get("message"):
                            raise AIProviderError(f"Gemini could not generate a reply: {details['message']}")
                        raise AIProviderError(f"Gemini could not generate a reply (HTTP {response.status_code}).")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload_text = line.removeprefix("data:").strip()
                        if not payload_text or payload_text == "[DONE]":
                            continue
                        try:
                            payload = json.loads(payload_text)
                            candidates = payload["candidates"]
                            parts = candidates[0]["content"]["parts"]
                            if not isinstance(parts, list):
                                raise TypeError("parts must be a list")
                            for part in parts:
                                if isinstance(part, dict) and isinstance(part.get("text"), str):
                                    yield part["text"]
                        except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                            raise AIProviderError("Gemini returned an invalid response stream.") from exc
        except AIProviderError:
            raise
        except httpx.HTTPError as exc:
            raise AIProviderError("The Gemini connection failed while generating a reply.") from exc


class OpenAIProvider(LanguageModel):
    base_url = "https://api.openai.com/v1"
    timeout = httpx.Timeout(120.0, connect=10.0)
    status_timeout = httpx.Timeout(15.0, connect=5.0)
    non_chat_model_markers = (
        "audio",
        "computer-use",
        "deep-research",
        "embedding",
        "image",
        "live",
        "moderation",
        "realtime",
        "search",
        "transcribe",
        "tts",
        "whisper",
    )

    def __init__(self, model: str | None = None) -> None:
        self.api_key = get_settings().openai_api_key.strip()
        self.model = model.strip() if model else ""
        self.name = f"openai:{self.model}" if self.model else "openai (no model selected)"

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            instruction = (
                "Set OPENAI_API_KEY in Vercel project environment variables."
                if _is_vercel_deployment()
                else "Set OPENAI_API_KEY in backend/.env, then restart ASTRA."
            )
            raise AIProviderError(instruction)
        return {"Authorization": f"Bearer {self.api_key}"}

    @classmethod
    def supports_text_chat(cls, model_id: str) -> bool:
        normalized = model_id.lower()
        return (
            normalized.startswith(("gpt-", "o1", "o3", "o4", "chatgpt-"))
            and not any(marker in normalized for marker in cls.non_chat_model_markers)
        )

    async def list_models(self) -> list[InstalledModel]:
        try:
            async with httpx.AsyncClient(timeout=self.status_timeout) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=self._headers(),
                )
                if response.status_code in {400, 401, 403}:
                    raise AIProviderError("OpenAI rejected OPENAI_API_KEY. Check the key and its API access.")
                if response.status_code == 429:
                    raise AIProviderError("OpenAI rate limit reached. Wait before checking the connection again.")
                response.raise_for_status()
        except AIProviderError:
            raise
        except httpx.HTTPError as exc:
            raise AIProviderError("Could not reach the OpenAI API. Check the internet connection and try again.") from exc

        try:
            data = response.json()
            models = data["data"]
            if not isinstance(models, list):
                raise TypeError("data must be a list")
            return [
                InstalledModel(
                    name=item["id"],
                    size=0,
                    parameter_size=None,
                    modified_at=None,
                )
                for item in models
                if isinstance(item, dict)
                and isinstance(item.get("id"), str)
                and self.supports_text_chat(item["id"])
            ]
        except (KeyError, TypeError, ValueError) as exc:
            raise AIProviderError("OpenAI returned an invalid model list.") from exc

    async def complete(self, history: list[dict[str, str]]) -> str:
        return "".join([chunk async for chunk in self.stream(history)])

    async def stream(self, history: list[dict[str, str]]) -> AsyncIterator[str]:
        if not self.model:
            raise AIProviderError("Select an available OpenAI model in Settings before chatting.")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={**self._headers(), "Accept": "text/event-stream"},
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": item["role"], "content": item["content"]}
                            for item in history
                        ],
                        "stream": True,
                    },
                ) as response:
                    if response.is_error:
                        details = await _error_details(response)
                        if (
                            response.status_code == 429
                            and (
                                details.get("type") == "insufficient_quota"
                                or details.get("code") in {"insufficient_quota", "credit_balance_exhausted"}
                            )
                        ):
                            raise AIProviderError(
                                "OpenAI API has no remaining credits. Add credits to the OpenAI account "
                                "or select a working Gemini model in Settings."
                            )
                        if response.status_code in {400, 401, 403}:
                            raise AIProviderError("OpenAI rejected the request. Check the API key and model access.")
                        if response.status_code == 429:
                            raise AIProviderError("OpenAI rate limit reached. Wait before trying again.")
                        raise AIProviderError(f"OpenAI could not generate a reply (HTTP {response.status_code}).")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload_text = line.removeprefix("data:").strip()
                        if not payload_text or payload_text == "[DONE]":
                            continue
                        try:
                            payload = json.loads(payload_text)
                            choices = payload.get("choices")
                            if not isinstance(choices, list) or not choices:
                                continue
                            delta = choices[0].get("delta", {})
                            content = delta.get("content") if isinstance(delta, dict) else None
                            if isinstance(content, str):
                                yield content
                            elif isinstance(content, list):
                                for part in content:
                                    if isinstance(part, dict) and isinstance(part.get("text"), str):
                                        yield part["text"]
                        except (AttributeError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
                            raise AIProviderError("OpenAI returned an invalid response stream.") from exc
        except AIProviderError:
            raise
        except httpx.HTTPError as exc:
            raise AIProviderError("The OpenAI connection failed while generating a reply.") from exc


def get_language_model(model: str | None = None) -> LanguageModel:
    if model and model.startswith("gemini:"):
        return GeminiProvider(model.removeprefix("gemini:"))
    if model and model.startswith("openai:"):
        return OpenAIProvider(model.removeprefix("openai:"))
    if _is_vercel_deployment():
        raise AIProviderError("Select a configured Gemini or OpenAI cloud model in Settings before chatting.")
    return OllamaProvider(model)
