from datetime import datetime, timedelta, timezone

import httpx

from app.security.access import is_local_request, token_matches
from app.ai.provider import AIProviderError, InstalledModel
from app.database.session import _database_connection_options
from app.services.ai_clients import available_ai_clients
from app.services.research import search_web
from app.services.voice import voice_model_installed


def test_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "ASTRA"
    assert body["status"] == "online"
    assert body["database"] == "ok"
    assert body["phase"] == 2
    assert body["model"] == "none"
    assert body["auth_required"] is False


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["docs"] == "/docs"


def test_foreign_host_is_rejected(client):
    response = client.get("/api/v1/health", headers={"host": "evil.example"})
    assert response.status_code == 403


def test_local_request_rules():
    assert is_local_request("127.0.0.1:8787", "127.0.0.1") is True
    assert is_local_request("localhost:5173", "127.0.0.1") is True
    assert is_local_request("[::1]:8787", "::1") is True
    assert is_local_request("evil.example", "127.0.0.1") is False
    assert is_local_request("127.0.0.1:8787", "192.168.1.40") is False
    assert is_local_request("localhost.evil.com", "127.0.0.1") is False


def test_token_comparison_rejects_partial_matches():
    assert token_matches("Bearer secret", "Bearer secret") is True
    assert token_matches("Bearer secret", "Bearer secrets") is False
    assert token_matches("", "Bearer secret") is False


def test_cloud_accounts_keep_private_data_and_enforce_shared_quota(client, monkeypatch):
    from app.config import get_settings

    class FakeModel:
        name = "gemini:test"
        model = "test"

        async def complete(self, _history):
            return "A focused test reply."

        async def list_models(self):
            return [InstalledModel("test", 0, None, None)]

        async def stream(self, _history):
            yield "A focused test reply."

    def fake_model(_model=None, api_key=None):
        used_keys.append(api_key)
        return FakeModel()

    used_keys: list[str | None] = []
    try:
        with monkeypatch.context() as patch:
            patch.setenv("VERCEL", "1")
            patch.setenv("ASTRA_API_TOKEN", "test-token-with-more-than-thirty-two-characters")
            get_settings.cache_clear()
            monkeypatch.setattr("app.services.chat.get_language_model", fake_model)
            monkeypatch.setattr("app.api.router.get_language_model", fake_model)

            assert client.get(
                "/api/v1/tasks",
                headers={"host": "astra-ai.vercel.app"},
            ).status_code == 401
            first = client.post("/api/v1/auth/guest", headers={"host": "astra-ai.vercel.app"})
            second = client.post("/api/v1/auth/guest", headers={"host": "astra-ai.vercel.app"})
            assert first.status_code == second.status_code == 201
            assert first.json()["account"]["email"] is None
            assert first.json()["account"]["is_guest"] is True
            assert client.post("/api/v1/auth/register", headers={"host": "astra-ai.vercel.app"}).status_code == 404
            first_headers = {"Authorization": f"Bearer {first.json()['access_token']}", "host": "astra-ai.vercel.app"}
            second_headers = {"Authorization": f"Bearer {second.json()['access_token']}", "host": "astra-ai.vercel.app"}
            current_guest = client.get("/api/v1/auth/me", headers=first_headers)
            assert current_guest.json()["email"] is None
            assert current_guest.json()["is_guest"] is True
            assert client.get(
                "/api/v1/tasks",
                headers={"Authorization": "Bearer forged.token", "host": "astra-ai.vercel.app"},
            ).status_code == 401

            task = client.post("/api/v1/tasks", json={"title": "Private task"}, headers=first_headers)
            memory = client.post(
                "/api/v1/memory",
                json={"title": "Private note", "content": "Only for the first account"},
                headers=first_headers,
            )
            first_settings = client.put(
                "/api/v1/settings",
                json={"user_display_name": "First Account"},
                headers=first_headers,
            )
            conversation = client.post(
                "/api/v1/commands",
                json={"text": "Remember this private conversation"},
                headers=first_headers,
            )
            assert task.status_code == 201
            assert memory.status_code == 201
            assert first_settings.status_code == 200
            assert client.get("/api/v1/settings", headers=second_headers).json()["user_display_name"] == "Operator"
            assert conversation.status_code == 200

            assert client.get("/api/v1/tasks", headers=second_headers).json() == []
            assert client.get("/api/v1/memory", headers=second_headers).json() == []
            assert client.get("/api/v1/conversations", headers=second_headers).json() == []
            assert client.get("/api/v1/activity", headers=second_headers).json() == []
            assert client.get(
                f"/api/v1/conversations/{conversation.json()['conversation_id']}",
                headers=second_headers,
            ).status_code == 404
            assert client.patch(
                f"/api/v1/tasks/{task.json()['id']}",
                json={"title": "Changed by another account"},
                headers=second_headers,
            ).status_code == 404
            assert client.patch(
                f"/api/v1/memory/{memory.json()['id']}",
                json={"content": "Changed by another account"},
                headers=second_headers,
            ).status_code == 404

            for index in range(19):
                reply = client.post(
                    "/api/v1/commands/stream",
                    json={"text": f"Shared-key message {index}"},
                    headers=first_headers,
                )
                assert reply.status_code == 200
                assert '"type": "done"' in reply.text
            usage = client.get("/api/v1/account/usage", headers=first_headers)
            assert usage.json() == {"used_today": 20, "daily_limit": 20, "remaining": 0}
            exhausted = client.post(
                "/api/v1/commands",
                json={"text": "The next shared-key message"},
                headers=first_headers,
            )
            assert exhausted.status_code == 429

            personal_key_reply = client.post(
                "/api/v1/commands/stream",
                json={"text": "Use my own provider key"},
                headers={
                    **first_headers,
                    "X-Astra-Provider-Key": "personal-test-key",
                    "X-Astra-Provider": "gemini",
                },
            )
            assert personal_key_reply.status_code == 200
            assert used_keys[-1] == "personal-test-key"
            assert client.get("/api/v1/account/usage", headers=first_headers).json()["used_today"] == 20
    finally:
        get_settings.cache_clear()


def test_vercel_mode_requires_token_and_accepts_public_host(client, monkeypatch):
    monkeypatch.setenv("VERCEL", "1")

    health = client.get("/api/v1/health", headers={"host": "astra-ai.vercel.app"})
    assert health.status_code == 200
    assert health.json()["auth_required"] is True
    assert health.json()["cloud_deployment"] is True

    protected = client.get("/api/v1/system", headers={"host": "astra-ai.vercel.app"})
    assert protected.status_code == 401


def test_hosted_api_never_runs_local_device_actions(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("VERCEL", "1")
    get_settings.cache_clear()
    try:
        response = client.post(
            "/api/v1/device/action",
            json={"action": "launch_app", "application": "chrome"},
            headers={"origin": "https://astra-ai-786.vercel.app"},
        )
        assert response.status_code == 404
    finally:
        get_settings.cache_clear()


def test_postgres_url_uses_asyncpg_and_translates_sslmode():
    url, connect_args = _database_connection_options(
        "postgresql://user:password@db.example/app?sslmode=require&channel_binding=require",
        is_vercel=True,
    )

    assert url.startswith("postgresql+asyncpg://")
    assert "sslmode" not in url
    assert "channel_binding" not in url
    assert connect_args == {"ssl": "require"}


def test_vercel_rejects_sqlite_storage():
    import pytest

    with pytest.raises(RuntimeError, match="managed PostgreSQL"):
        _database_connection_options("sqlite+aiosqlite:///data/astra.db", is_vercel=True)


def test_ai_client_availability_only_reports_installed_commands(monkeypatch):
    installed = {"chrome", "cursor", "copilot"}
    monkeypatch.setattr(
        "app.services.ai_clients.shutil.which",
        lambda command: command if command in installed else None,
    )

    assert available_ai_clients() == {
        "claude_code": False,
        "cursor": True,
        "copilot": True,
        "browser_agent": True,
    }


def test_system_snapshot_is_real(client):
    response = client.get("/api/v1/system")
    assert response.status_code == 200
    body = response.json()
    assert body["ram_total_gb"] > 0
    assert body["cpu_count"] > 0
    assert body["disk_total_gb"] > 0
    assert "Windows" in body["platform"] or body["hostname"]


def test_cloud_system_snapshot_skips_unavailable_battery_sensor(monkeypatch):
    from types import SimpleNamespace

    from app.services import system_monitor

    monkeypatch.setattr(
        system_monitor,
        "get_settings",
        lambda: SimpleNamespace(is_vercel_deployment=True),
    )

    def missing_battery_sensor():
        raise FileNotFoundError("no power supply sensor")

    monkeypatch.setattr(system_monitor.psutil, "sensors_battery", missing_battery_sensor)

    assert system_monitor.system_snapshot()["battery_percent"] is None


def test_modules_are_honest(client):
    response = client.get("/api/v1/modules")
    assert response.status_code == 200
    modules = {item["id"]: item for item in response.json()}
    assert modules["api"]["status"] == "online"
    assert modules["database"]["status"] == "online"
    assert modules["ai"]["status"] in {"pending", "offline"}
    assert modules["voice"]["status"] in {"pending", "online"}
    if modules["voice"]["status"] == "online":
        assert "push-to-talk" in modules["voice"]["summary"]
        assert "multilingual" in modules["voice"]["summary"]
    assert modules["automation"]["status"] in {"online", "offline"}
    assert modules["memory"]["status"] == "online"
    assert modules["research"]["status"] == "online"
    assert modules["productivity"]["status"] == "online"
    assert "Ollama" in modules["ai"]["summary"]


def test_local_voice_status_and_transcription(client, monkeypatch):
    status = client.get("/api/v1/voice/status")
    assert status.status_code == 200
    assert status.json()["model"] == "faster-whisper-tiny"
    assert status.json()["languages"] == ["Multilingual · automatic detection"]

    monkeypatch.setattr("app.api.router.voice_model_installed", lambda: True)
    monkeypatch.setattr("app.api.router.voice_dependencies_installed", lambda: True)
    monkeypatch.setattr(
        "app.api.router.transcribe_audio",
        lambda audio, suffix, language: ("Mujhe madad chahiye.", "ur", 1.5),
    )
    transcription = client.post(
        "/api/v1/voice/transcribe",
        data={"language": "ur"},
        files={"audio": ("speech.webm", b"recorded audio", "audio/webm")},
    )
    assert transcription.status_code == 200
    assert transcription.json() == {
        "text": "Mujhe madad chahiye.",
        "language": "ur",
        "duration_seconds": 1.5,
    }

    unsupported = client.post(
        "/api/v1/voice/transcribe",
        data={"language": "auto"},
        files={"audio": ("speech.txt", b"not audio", "text/plain")},
    )
    assert unsupported.status_code == 415


def test_voice_model_uses_the_files_published_by_faster_whisper(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.voice.MODEL_DIRECTORY", tmp_path)
    for filename in ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"):
        (tmp_path / filename).write_bytes(b"model data")
    assert voice_model_installed() is True
    (tmp_path / "vocabulary.txt").unlink()
    assert voice_model_installed() is False


def test_voice_transcription_uses_fast_beam_search(monkeypatch):
    from types import SimpleNamespace

    from app.services.voice import transcribe_audio

    options: dict[str, object] = {}

    class FastWhisper:
        def transcribe(self, audio_path, **kwargs):
            options.update(kwargs)
            return iter([SimpleNamespace(text="Hello ASTRA.")]), SimpleNamespace(language="en", duration=1.0)

    monkeypatch.setattr("app.services.voice._load_model", lambda: FastWhisper())

    text, language, duration = transcribe_audio(b"audio", ".webm", "en")

    assert (text, language, duration) == ("Hello ASTRA.", "en", 1.0)
    assert options["beam_size"] == 1
    assert options["vad_filter"] is True


def test_tasks_persist_and_due_reminders_are_idempotent(client):
    blank_title = client.post("/api/v1/tasks", json={"title": "   "})
    assert blank_title.status_code == 422
    naive_due_date = client.post(
        "/api/v1/tasks",
        json={"title": "Invalid time", "due_at": "2026-11-14T17:00:00"},
    )
    assert naive_due_date.status_code == 422

    due_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    created = client.post(
        "/api/v1/tasks",
        json={"title": "Pay the bill", "notes": "Internet", "due_at": due_at},
    )
    assert created.status_code == 201
    task = created.json()
    assert task["title"] == "Pay the bill"
    assert task["notes"] == "Internet"
    assert task["completed"] is False
    assert task["in_progress"] is False
    assert task["reminded_at"] is not None
    assert task["due_at"].endswith(("Z", "+00:00"))

    listed = client.get("/api/v1/tasks")
    assert any(item["id"] == task["id"] for item in listed.json())
    activities = client.get("/api/v1/activity").json()
    reminders = [item for item in activities if item["message"] == "Task reminder: Pay the bill"]
    assert len(reminders) == 1

    in_progress = client.patch(f"/api/v1/tasks/{task['id']}", json={"in_progress": True})
    assert in_progress.status_code == 200
    assert in_progress.json()["in_progress"] is True
    assert in_progress.json()["completed"] is False

    completed = client.patch(f"/api/v1/tasks/{task['id']}", json={"completed": True})
    assert completed.status_code == 200
    assert completed.json()["completed"] is True
    assert completed.json()["in_progress"] is False
    reopened = client.patch(f"/api/v1/tasks/{task['id']}", json={"completed": False})
    assert reopened.status_code == 200
    assert reopened.json()["in_progress"] is False
    assert client.delete(f"/api/v1/tasks/{task['id']}").status_code == 204
    assert client.get("/api/v1/tasks").json() == []
    assert client.patch(f"/api/v1/tasks/{task['id']}", json={"completed": False}).status_code == 404


def test_approved_memory_crud_and_local_chat_context(client, monkeypatch):
    blank = client.post("/api/v1/memory", json={"title": "   ", "content": "Some note"})
    assert blank.status_code == 422
    saved = client.post(
        "/api/v1/memory",
        json={"title": "Preferred language", "content": "I prefer Urdu."},
    )
    assert saved.status_code == 201
    memory = saved.json()

    class MemoryAwareModel:
        history = None

        async def complete(self, history):
            self.history = history
            return f"Reply to: {history[-1]['content']}"

    model = MemoryAwareModel()
    monkeypatch.setattr("app.services.chat.get_language_model", lambda selected=None: model)
    response = client.post("/api/v1/commands", json={"text": "Hello"})
    assert response.status_code == 200
    assert model.history[0]["role"] == "system"
    assert "I prefer Urdu." in model.history[0]["content"]

    updated = client.patch(f"/api/v1/memory/{memory['id']}", json={"content": "I prefer Urdu replies."})
    assert updated.status_code == 200
    assert updated.json()["content"] == "I prefer Urdu replies."
    assert client.delete(f"/api/v1/memory/{memory['id']}").status_code == 204
    assert client.get("/api/v1/memory").json() == []
    assert client.delete(f"/api/v1/memory/{memory['id']}").status_code == 404
    memory_activity = [
        item for item in client.get("/api/v1/activity").json()
        if item["source"] == "memory"
    ]
    assert [item["message"] for item in memory_activity] == [
        "Personal memory deleted.",
        "Personal memory updated.",
        "Personal memory saved.",
    ]
    assert all("Urdu" not in item["message"] for item in memory_activity)


def test_allowlisted_automation_launch(client, monkeypatch):
    launched: list[str] = []

    def fake_launch(application: str) -> str:
        launched.append(application)
        return f"Opened {application}."

    monkeypatch.setattr("app.services.automation.launch_application", fake_launch)
    monkeypatch.setattr("app.api.router.open_approved_url", lambda url: f"Opened {url} in your default browser.")
    from app.services.device_bridge import device_bridge

    pairing_code = device_bridge.start()
    origin = "http://127.0.0.1:5173"
    pair_response = client.post(
        "/api/v1/device/pair",
        json={"pairing_code": pairing_code},
        headers={"origin": origin},
    )
    assert pair_response.status_code == 200
    device_headers = {
        "origin": origin,
        "x-astra-device-session": pair_response.json()["access_token"],
    }
    monkeypatch.setattr(
        "app.api.router.available_ai_clients",
        lambda: {"claude_code": False, "cursor": True, "copilot": True},
    )
    client_apps = client.get("/api/v1/device/clients", headers=device_headers)
    assert client_apps.status_code == 200
    assert client_apps.json() == {"claude_code": False, "cursor": True, "copilot": True}
    assert client.get("/api/v1/device/clients", headers={"origin": origin}).status_code == 401

    response = client.post(
        "/api/v1/automation/launch",
        json={"application": "chrome"},
        headers=device_headers,
    )
    assert response.status_code == 200
    assert response.json() == {"application": "chrome", "message": "Opened chrome."}
    repeated_launch = client.post(
        "/api/v1/device/action",
        json={"action": "launch_app", "application": "code"},
        headers=device_headers,
    )
    assert repeated_launch.status_code == 200
    assert repeated_launch.json() == {"action": "launch_app", "message": "Opened code."}
    website = client.post(
        "/api/v1/device/action",
        json={"action": "open_url", "url": "https://example.com"},
        headers=device_headers,
    )
    assert website.status_code == 200
    assert website.json() == {"action": "open_url", "message": "Opened https://example.com in your default browser."}
    private_website = client.post(
        "/api/v1/device/action",
        json={"action": "open_url", "url": "http://127.0.0.1:8787"},
        headers=device_headers,
    )
    assert private_website.status_code == 422
    rejected = client.post(
        "/api/v1/automation/launch",
        json={"application": "powershell"},
        headers=device_headers,
    )
    assert rejected.status_code == 422
    denied = client.post(
        "/api/v1/device/action",
        json={"action": "launch_app", "application": "chrome"},
        headers={**device_headers, "origin": "https://evil.example"},
    )
    assert denied.status_code == 403
    assert launched == ["chrome", "code"]
    client.delete("/api/v1/device/session", headers=device_headers)
    assert client.post(
        "/api/v1/device/action",
        json={"action": "launch_app", "application": "chrome"},
        headers=device_headers,
    ).status_code == 401
    assert client.post(
        "/api/v1/device/pair",
        json={"pairing_code": device_bridge.start()},
        headers={"origin": "https://evil.example"},
    ).status_code == 403
    assert client.post(
        "/api/v1/device/pair",
        json={"pairing_code": pairing_code},
        headers={"origin": origin},
    ).status_code == 401


def test_paired_companion_exposes_local_ollama_models_and_chat(client, monkeypatch):
    from app.ai.provider import InstalledModel, OllamaProvider
    from app.services.device_bridge import device_bridge

    installed = [InstalledModel("qwen2.5:1.5b", 986_000_000, "1.5B", None)]

    class FakeOllama:
        async def list_models(self):
            return installed

    async def complete(self, messages):
        assert messages == [{"role": "user", "content": "Hello"}]
        return "Local Ollama reply."

    monkeypatch.setattr("app.api.router.get_language_model", lambda: FakeOllama())
    monkeypatch.setattr(OllamaProvider, "list_models", FakeOllama.list_models)
    monkeypatch.setattr(OllamaProvider, "complete", complete)

    origin = "http://127.0.0.1:5173"
    pair_response = client.post(
        "/api/v1/device/pair",
        json={"pairing_code": device_bridge.start()},
        headers={"origin": origin},
    )
    assert pair_response.status_code == 200
    headers = {
        "origin": origin,
        "x-astra-device-session": pair_response.json()["access_token"],
    }

    status = client.get("/api/v1/device/ai", headers=headers)
    assert status.status_code == 200
    assert status.json()["connected"] is True
    assert status.json()["models"][0]["name"] == "qwen2.5:1.5b"

    response = client.post(
        "/api/v1/device/ai/chat",
        json={"model": "qwen2.5:1.5b", "messages": [{"role": "user", "content": "Hello"}]},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == {"reply": "Local Ollama reply."}
    device_bridge.stop()


def test_free_research_search_returns_sources(client, monkeypatch):
    html = (
        '<a class="result__a" href="https://example.com/result">Example result</a>'
        '<a class="result__snippet">A short source summary.</a>'
    )
    monkeypatch.setattr(
        "app.services.research.httpx.get",
        lambda *args, **kwargs: httpx.Response(
            200,
            text=html,
            request=httpx.Request("GET", "https://html.duckduckgo.com/html/"),
        ),
    )
    result = search_web("example")
    assert result == [{
        "title": "Example result",
        "url": "https://example.com/result",
        "snippet": "A short source summary.",
    }]

    monkeypatch.setattr(
        "app.api.router.search_web",
        lambda query: [{"title": "Example", "url": "https://example.com", "snippet": "Source summary"}],
    )
    response = client.post("/api/v1/research/search", json={"query": "example"})
    assert response.status_code == 200
    assert response.json()["results"][0]["url"] == "https://example.com"
    activity = client.get("/api/v1/activity").json()
    assert any(item["source"] == "research" and item["details"] == "1 source(s) returned." for item in activity)
    assert all("example" not in item["message"].lower() for item in activity)
    rejected = client.post("/api/v1/research/search", json={"query": " "})
    assert rejected.status_code == 422


def test_settings_round_trip(client):
    denied = client.put("/api/v1/settings", json={"user_display_name": "   "})
    assert denied.status_code == 422

    saved = client.put("/api/v1/settings", json={"user_display_name": "Hamza"})
    assert saved.status_code == 200
    assert saved.json()["user_display_name"] == "Hamza"

    loaded = client.get("/api/v1/settings")
    assert loaded.status_code == 200
    assert loaded.json()["user_display_name"] == "Hamza"


def test_command_requires_a_local_model(client, monkeypatch):
    class OfflineModel:
        name = "ollama (no model selected)"
        model = ""

        async def list_models(self):
            raise AIProviderError("Ollama is unavailable.")

        async def complete(self, history):
            raise AIProviderError("Ollama is unavailable.")

        async def stream(self, history):
            raise AIProviderError("Ollama is unavailable.")
            yield ""

    monkeypatch.setattr("app.services.chat.get_language_model", lambda model=None: OfflineModel())
    unavailable = client.post("/api/v1/commands/stream", json={"text": "open Chrome"})
    assert unavailable.status_code == 503
    assert "Ollama" in unavailable.json()["detail"]
    missing = client.post(
        "/api/v1/commands",
        json={"text": "hello", "conversation_id": "missing"},
    )
    assert missing.status_code == 404

    empty = client.post("/api/v1/commands", json={"text": "   "})
    assert empty.status_code == 422


def test_model_selection_and_streamed_chat(client, monkeypatch):
    class FakeModel:
        name = "ollama:test-small"
        model = "test-small"

        async def list_models(self):
            return [InstalledModel("test-small", 1_000_000_000, "1B", None)]

        async def complete(self, history):
            return f"Reply to: {history[-1]['content']}"

        async def stream(self, history):
            self.history = history
            yield "Local "
            yield f"reply to {history[-1]['content']}"

    fake = FakeModel()
    monkeypatch.setattr("app.api.router.get_language_model", lambda model=None: fake)
    monkeypatch.setattr("app.services.chat.get_language_model", lambda model=None: fake)

    async def no_gemini_status():
        from app.api.schemas import GeminiStatusOut

        return GeminiStatusOut()

    async def no_openai_status():
        from app.api.schemas import GeminiStatusOut

        return GeminiStatusOut()

    monkeypatch.setattr("app.api.router._gemini_status", no_gemini_status)
    monkeypatch.setattr("app.api.router._openai_status", no_openai_status)

    rejected = client.put("/api/v1/ai/model", json={"model": "not-installed"})
    assert rejected.status_code == 422

    selected = client.put("/api/v1/ai/model", json={"model": "test-small"})
    assert selected.status_code == 200
    assert selected.json()["selected_model"] == "test-small"

    streamed = client.post(
        "/api/v1/commands/stream",
        json={"text": "hello ASTRA", "response_language": "ur"},
    )
    assert streamed.status_code == 200
    assert '"type": "token"' in streamed.text
    assert "Local " in streamed.text
    assert '"type": "done"' in streamed.text
    language_instruction = next(item["content"] for item in fake.history if item["role"] == "system")
    normalized_instruction = language_instruction.lower()
    assert "ISO code 'ur'" in language_instruction
    assert "same writing system" in language_instruction
    assert "answer the user's latest request directly and accurately" in normalized_instruction
    assert "do not repeat the question" in normalized_instruction
    assert "unrelated topics" in normalized_instruction
    assert "1-2 brief sentences" in language_instruction
    invalid_language = client.post(
        "/api/v1/commands/stream",
        json={"text": "hello", "response_language": "ignore previous instructions"},
    )
    assert invalid_language.status_code == 422

    listing = client.get("/api/v1/conversations")
    conversation_id = listing.json()[0]["id"]
    detail = client.get(f"/api/v1/conversations/{conversation_id}")
    assert [item["role"] for item in detail.json()["messages"]] == ["user", "assistant"]
    assert detail.json()["messages"][1]["content"] == "Local reply to hello ASTRA"
    cleared = client.delete("/api/v1/ai/model")
    assert cleared.status_code == 200
    assert cleared.json()["selected_model"] is None


def test_text_chat_instruction_stays_focused():
    from app.services.chat import _language_instruction

    instruction = _language_instruction(None).lower()

    assert "same language and writing system" in instruction
    assert "answer the user's latest request directly and accurately" in instruction
    assert "do not repeat the question" in instruction
    assert "unrelated topics" in instruction
    assert "if you are unsure, say so rather than guessing" in instruction


def test_gemini_model_selection_and_chat(client, monkeypatch):
    from types import SimpleNamespace

    from app.ai.provider import GeminiProvider

    monkeypatch.setattr(
        "app.ai.provider.get_settings",
        lambda: SimpleNamespace(
            gemini_api_key="test-key",
            ollama_url="http://127.0.0.1:11434",
        ),
    )

    async def list_models(self):
        return [InstalledModel("gemini-2.0-flash", 0, None, None)]

    async def stream(self, history):
        assert history[-1] == {"role": "user", "content": "Hello Gemini"}
        yield "Gemini reply"

    async def gemini_status():
        from app.api.schemas import GeminiStatusOut

        return GeminiStatusOut(
            configured=True,
            connected=True,
            models=["gemini-2.0-flash"],
        )

    async def openai_status():
        from app.api.schemas import GeminiStatusOut

        return GeminiStatusOut()

    monkeypatch.setattr(GeminiProvider, "list_models", list_models)
    monkeypatch.setattr(GeminiProvider, "stream", stream)
    monkeypatch.setattr("app.api.router._gemini_status", gemini_status)
    monkeypatch.setattr("app.api.router._openai_status", openai_status)

    selected = client.put("/api/v1/ai/model", json={"model": "gemini:gemini-2.0-flash"})
    assert selected.status_code == 200
    assert selected.json()["selected_model"] == "gemini:gemini-2.0-flash"
    assert selected.json()["gemini"]["connected"] is True

    streamed = client.post("/api/v1/commands/stream", json={"text": "Hello Gemini"})
    assert streamed.status_code == 200
    assert "Gemini reply" in streamed.text

    rejected = client.put("/api/v1/ai/model", json={"model": "gemini:missing-model"})
    assert rejected.status_code == 422
    cleared = client.delete("/api/v1/ai/model")
    assert cleared.status_code == 200
    assert cleared.json()["selected_model"] is None


def test_openai_model_selection_and_chat(client, monkeypatch):
    from types import SimpleNamespace

    from app.ai.provider import OpenAIProvider

    monkeypatch.setattr(
        "app.ai.provider.get_settings",
        lambda: SimpleNamespace(
            openai_api_key="test-key",
            ollama_url="http://127.0.0.1:11434",
        ),
    )

    async def list_models(self):
        return [InstalledModel("gpt-4.1-mini", 0, None, None)]

    async def stream(self, history):
        assert history[-1] == {"role": "user", "content": "Hello OpenAI"}
        yield "OpenAI reply"

    async def empty_status():
        from app.api.schemas import GeminiStatusOut

        return GeminiStatusOut()

    async def openai_status():
        from app.api.schemas import GeminiStatusOut

        return GeminiStatusOut(
            configured=True,
            connected=True,
            models=["gpt-4.1-mini"],
        )

    monkeypatch.setattr(OpenAIProvider, "list_models", list_models)
    monkeypatch.setattr(OpenAIProvider, "stream", stream)
    monkeypatch.setattr("app.api.router._gemini_status", empty_status)
    monkeypatch.setattr("app.api.router._openai_status", openai_status)

    selected = client.put("/api/v1/ai/model", json={"model": "openai:gpt-4.1-mini"})
    assert selected.status_code == 200
    assert selected.json()["selected_model"] == "openai:gpt-4.1-mini"
    assert selected.json()["openai"]["connected"] is True

    streamed = client.post("/api/v1/commands/stream", json={"text": "Hello OpenAI"})
    assert streamed.status_code == 200
    assert "OpenAI reply" in streamed.text

    rejected = client.put("/api/v1/ai/model", json={"model": "openai:missing-model"})
    assert rejected.status_code == 422
    cleared = client.delete("/api/v1/ai/model")
    assert cleared.status_code == 200
    assert cleared.json()["selected_model"] is None


def test_delete_conversation(client, monkeypatch):
    class FakeModel:
        async def complete(self, history):
            return "Saved test response"

    monkeypatch.setattr("app.services.chat.get_language_model", lambda model=None: FakeModel())
    created = client.post("/api/v1/commands", json={"text": "remember this test"})
    assert created.status_code == 200
    conversation_id = created.json()["conversation_id"]
    deleted = client.delete(f"/api/v1/conversations/{conversation_id}")
    assert deleted.status_code == 204
    missing = client.get(f"/api/v1/conversations/{conversation_id}")
    assert missing.status_code == 404


def test_activity_records_startup_and_commands(client):
    response = client.get("/api/v1/activity")
    assert response.status_code == 200
    messages = [item["message"] for item in response.json()]
    assert "ASTRA backend started" in messages
    assert "Completed a local AI response" in messages


def test_websocket_command_reports_model_failure(client, monkeypatch):
    class OfflineModel:
        async def complete(self, history):
            raise AIProviderError("Ollama is unavailable.")

    monkeypatch.setattr("app.services.chat.get_language_model", lambda model=None: OfflineModel())
    with client.websocket_connect("/ws/session") as websocket:
        hello = websocket.receive_json()
        assert hello["type"] == "hello"
        assert hello["state"] == "idle"
        websocket.send_json({"type": "ping"})
        assert websocket.receive_json()["type"] == "pong"
        websocket.send_json({"type": "command", "text": "status check"})
        seen = []
        failure = None
        for _ in range(4):
            event = websocket.receive_json()
            if event["type"] == "state":
                seen.append(event["state"])
            else:
                seen.append(event["type"])
            if event["type"] == "error":
                failure = event
                break
        assert "processing" in seen
        assert "error" in seen
        assert failure is not None
        assert "Ollama" in failure["message"]
