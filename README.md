# ASTRA

Advanced Smart Technology & Responsive Assistant. ASTRA is a local-first personal assistant for Windows. It provides Ollama chat, tasks and calendar, approved personal memory, free web research, safe Windows quick actions, live system monitoring, and user-triggered push-to-talk. It does not claim that background agents or unconfigured cloud providers are active.

## Implemented

- FastAPI on `127.0.0.1:8787`, rejected for any non-local client.
- SQLite storage for conversations, the display name, approved memories, tasks, and activity history.
- Task creation, editing, scheduling, in-progress tracking, completion, and deletion, with saved notes and due dates. Existing SQLite databases gain the in-progress field automatically. A local reminder worker records due tasks once, including tasks that became due while ASTRA was stopped.
- The dashboard mission timeline filters today, the next seven days, or all tasks and identifies scheduled, in-progress, completed, and overdue items from saved task data.
- A month calendar backed by the same persisted tasks and reminders; creating a calendar item creates a real due task.
- Live CPU, memory, battery, and disk readings.
- Ollama provider integration with installed-model discovery, local model selection, streaming replies, and persistent conversation history.
- Optional Google Gemini integration with API-key-backed model discovery and streamed chat. Gemini is marked connected only after its API is reachable; selecting it sends chat history and relevant saved-memory context to Google.
- Optional OpenAI integration with API-key-backed chat-model discovery and streamed chat. OpenAI is marked connected only after its API is reachable; selecting it sends chat history and relevant saved-memory context to OpenAI.
- The dashboard LLM status grid includes the reference model/client catalog; local model availability is derived from Ollama and Claude Code/Cursor/Copilot availability is derived from installed commands. Unconfigured providers are clearly labeled rather than shown as connected.
- AI Core is the live local-model chat workspace; Conversations is a separate searchable archive for resuming or deleting saved chats.
- The dashboard application switcher opens every module, and the profile menu links to local settings and activity history.
- The live intelligence feed refreshes from local activity logs every 15 seconds and reports refresh errors instead of fabricating entries.
- Clear errors when Ollama is unavailable or no model has been selected; ASTRA does not simulate AI responses.
- Explicitly saved personal memories, local knowledge search, and relevant memory context in local chats.
- Free DuckDuckGo web search with source links. Search requests go to DuckDuckGo; search history stores only that a search completed, not the query.
- Allowlisted Windows app launching (VS Code, Chrome, Settings) and one-frame screen capture through the browser's user-controlled share picker. Arbitrary shell execution is not available.
- English/Urdu push-to-talk transcription using the local `faster-whisper-tiny` model. Recording starts only after the user presses the microphone button; audio stays on the PC, is held temporarily, and is deleted after processing.
- A calendar, knowledge search, skills directory, and agent/module pages backed by real local data and capability status. These are user-triggered capabilities, not autonomous background agents.
- Optional API token. Set `ASTRA_API_TOKEN` in `backend/.env`, then paste the same value in Settings. The browser keeps it in session storage.

## Run it

Requirements: Python 3.11 or newer, Node.js, and the existing virtual environment.

```bat
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd frontend
npm install
cd ..
start_astra.bat
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API docs are at [http://127.0.0.1:8787/docs](http://127.0.0.1:8787/docs).

## Vercel preview

For Git deployments, set the Vercel project's Root Directory to `frontend`. When logged out, an unclaimed preview can be created from that directory with `npx vercel@latest deploy --temporary`. This hosts only the React UI; chat, voice, task storage, live system data, and other API-backed features remain unavailable because the FastAPI backend intentionally uses local SQLite, Ollama, Windows capabilities, and a loopback-only connection. Do not expose that backend directly; a full cloud deployment requires a separately secured, cloud-compatible backend and persistent storage.

## Local AI setup

Install the free Ollama desktop app, start it, and download a model using its CLI, for example:

```bat
ollama pull qwen2.5:3b
```

In ASTRA Settings, refresh the Ollama connection and select an installed model. Model downloads take disk space and generation uses additional RAM beyond the model file size. Choose a model that fits your hardware; smaller models generally respond faster on low-memory computers. Ollama must remain running while AI chat is in use. ASTRA connects only to a local Ollama endpoint (`127.0.0.1`, `localhost`, or `::1`).

Ollama with `qwen2.5:1.5b` has been installed and a real local response verified on this machine.

Copy `backend/.env.example` to `backend/.env` only when you want to change the port, log level, or token. The defaults already bind to localhost.

## Optional Gemini cloud setup

Set `GEMINI_API_KEY` in `backend/.env` and restart the backend. ASTRA checks the key against Google's Gemini API and lists models that support text generation. Set `OPENAI_API_KEY` in the same file to enable OpenAI model discovery and chat. Select either cloud provider's model in Settings to use it for chat. Both keys stay in the backend; prompts, conversation history, and any relevant saved-memory context are sent to the selected provider only when that cloud model is selected. Keep an Ollama model selected for local-only chat.

## Tests

```bat
cd backend
.venv\Scripts\python.exe -m pytest
cd ..\frontend
npm test
npm run build
```

## Architecture

The browser talks only to the local API. Vite proxies `/api` and `/ws` to the backend during development.

| Piece | Role |
| --- | --- |
| `frontend/` | React command center, AI Core chat, separate conversation archive, system meters, local model settings, activity, calendar/tasks, memory/knowledge, research, allowlisted automation, and push-to-talk voice. |
| `backend/app/api` | HTTP routes for health, system stats, modules, settings, conversations, tasks, memories, research, automation, voice, and commands. |
| `backend/app/websocket` | Session socket for live stats and the same command path. |
| `backend/app/ai` | Ollama and optional Gemini/OpenAI providers, model discovery, and token streaming. |
| `backend/app/database` | SQLAlchemy models and the SQLite engine. |
| `backend/app/security` | Loopback-only middleware and optional bearer token. |
| `data/astra.db` | Created on first startup. Not committed. |

Windows actions require an explicit button press and are restricted to the listed app allowlist. Screenshot capture requires choosing a window or screen in the browser share picker. There is no arbitrary command or public control API. Cloud model use is optional and requires a user-provided Gemini or OpenAI API key.

## Hardware

Model speed and the largest usable model depend on installed RAM and CPU or GPU. The Settings page shows model file sizes, but a model needs extra working memory while generating. ASTRA does not promise unlimited intelligence.

## Roadmap

The phase plan is in [docs/ROADMAP.md](docs/ROADMAP.md). Wake-word detection, autonomous agents, broad browser control, local TTS, timers, and a desktop shell remain out of scope until implemented and tested.
