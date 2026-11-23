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
- On the hosted site, speech input uses the browser's speech-recognition API where supported; ASTRA receives recognized text, not the audio recording. Browser speech services may process audio under their own privacy policies.
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

## Vercel full-stack deployment

The root `vercel.json` deploys the React frontend and FastAPI backend as Vercel Services. Set the Vercel project's Root Directory to the repository root. Configure these server-side environment variables before enabling the hosted API:

- `ASTRA_DATABASE_URL`: a pooled managed PostgreSQL connection URL. The backend also accepts `DATABASE_URL` or `POSTGRES_URL`.
- `ASTRA_API_TOKEN`: a unique secret at least 32 characters long. It signs account sessions; visitors must not receive or enter this value.
- `GEMINI_API_KEY` and/or `OPENAI_API_KEY`: project-owned provider keys used for shared-key chat.
- Optional `ASTRA_OLLAMA_URL`: public HTTPS base URL for a separately hosted Ollama service. Vercel cannot connect to a visitor's `localhost`. If the Ollama host is behind a bearer-authenticated gateway, set `ASTRA_OLLAMA_API_KEY` as a Vercel secret too.

Visitors continue as guests without email or password. ASTRA creates a random guest identity and scopes chats, memories, tasks, settings, activity, and quota to it. Its 12-hour bearer token stays in that browser tab's session storage; closing the tab ends access, and guest data cannot be recovered or moved to another device. Existing pre-account records stay unassigned and hidden rather than being exposed to a guest.

Each guest identity can send 20 AI messages per UTC day using the project's configured provider keys. Those requests are paid by the project owner and the allowance is enforced in PostgreSQL; guest creation is also rate-limited per source IP. After that, guests can add their own Gemini or OpenAI key in Settings; ASTRA holds it in browser session storage and sends it only with chat requests, while their provider may bill them directly. Never commit secrets or put provider keys in frontend build variables.

The hosted backend persists guest-scoped chats, tasks, approved memories, settings, quota usage, and activity in PostgreSQL. Vercel system readings describe the hosted runtime, not a visitor's device. WebSockets are disabled in production and chat uses the HTTP streaming API.

### Optional Windows companion

A website cannot access Windows apps or files by itself. To let the hosted site request local actions, the visitor must download the repository, run `install_companion.bat` once, then `start_companion.bat`. The launcher gives the companion a separate local SQLite database and allows the ASTRA production origin without changing `backend/.env` or using its configured cloud database. When the companion starts, its `ASTRA Windows Companion` console prints an eight-character hexadecimal pairing code (characters 0-9 and A-F); copy that code into ASTRA's Automation page within five minutes. The code appears in the companion console, not on the website, and is single-use. Keep the companion window open while paired. Pairing is tab-scoped, authorizes direct opening of allowlisted apps and public HTTP(S) websites for up to 12 hours, and can be revoked in ASTRA. Chrome or Edge may ask for local-network access on first use. ASTRA never runs arbitrary shell commands.

The current companion actions are deliberately limited to opening allowlisted apps (VS Code, Cursor, Chrome, and Windows Settings) and public HTTP(S) websites. Chat and Voice recognize only direct, explicit open-app/open-website requests. Screen capture, microphone use, and local camera preview use browser permission prompts; the camera preview is not uploaded. A visitor may select a plain-text file up to 100 KB and explicitly confirm sending it to the conversation. Folder-wide access, arbitrary webpage clicking, keyboard/mouse control, camera uploads to AI, and changing Windows system settings are not implemented; opening the website does not grant those capabilities.

### VS Code Copilot and Cursor

Pair the Windows companion once from ASTRA's Automation page; Quick Commands and explicit chat requests can then open VS Code or Cursor directly for the 12-hour pairing session. ASTRA does not install editor extensions or control Copilot Agent or Cursor Agent: those agents and their workspace permissions remain inside their own editors.

- **VS Code:** install VS Code and the GitHub Copilot Chat extension, sign in to a GitHub account with Copilot access, open Copilot Chat, and choose Agent mode. Pair the Windows companion in ASTRA's Automation page before using the website's Open VS Code action.
- **Cursor:** install Cursor, sign in, open a project folder, and choose Agent. Pair the Windows companion in ASTRA's Automation page before using the website's Open Cursor action.

Agent permissions and conversations remain inside the editor. The ASTRA website does not receive or control them.

### Use Ollama already installed on the paired PC

1. Make sure Ollama is running and `ollama list` shows your downloaded models.
2. Start the ASTRA Windows companion with `start_companion.bat`, then pair the website tab once from **Automation → Pair this browser**.
3. In **Settings → Ollama**, press **Check connection** and select one of the models already on your PC.
4. Open **AI Chat** and send a message. The browser sends the prompt to Ollama through the paired local companion; the hosted backend stores the resulting conversation.

This connection does not expose Ollama to the public internet. If the companion stops, restart it and pair the browser again. Browser local-network permission may be requested by Chrome or Edge on first connection. Screen sharing, microphone, and camera still use browser-managed permission prompts.

## Local AI setup

If Ollama is already installed on the computer, start the Ollama app and check its models with `ollama list`. If no model is installed, download one using its CLI, for example:

```bat
ollama pull qwen2.5:3b
```

Download Ollama from [ollama.com/download](https://ollama.com/download), then run:

```bat
ollama run qwen2.5:3b
```

To use that local Ollama installation, run `start_astra.bat` on the same computer and open `http://127.0.0.1:5173`. In Settings, press **CHECK CONNECTION**, select an installed model, and choose **USE MODEL**. The hosted Vercel website cannot reach the visitor's PC; using Ollama with the hosted site requires an independently hosted, publicly reachable HTTPS Ollama service configured by the site operator with `ASTRA_OLLAMA_URL`. Do not expose a local Ollama server directly to the public internet. Model downloads take disk space and generation uses additional RAM beyond the model file size.

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
| `frontend/` | React command center, AI Core chat, separate conversation archive, system meters, local/cloud model settings, activity, calendar/tasks, memory/knowledge, research, allowlisted automation, and push-to-talk voice. |
| `backend/app/api` | HTTP routes for health, system stats, modules, settings, conversations, tasks, memories, research, automation, voice, and commands. |
| `backend/app/websocket` | Session socket for live stats and the same command path. |
| `backend/app/ai` | Ollama and optional Gemini/OpenAI providers, model discovery, and token streaming. |
| `backend/app/database` | SQLAlchemy models with local SQLite and hosted PostgreSQL engines. |
| `backend/app/security` | Loopback-only local middleware and required bearer token in Vercel. |
| `data/astra.db` | Created on first startup. Not committed. |

Windows actions require an explicit button press and are restricted to the listed app allowlist. Screenshot capture requires choosing a window or screen in the browser share picker. There is no arbitrary command or public control API. Cloud model use is optional and requires a user-provided Gemini or OpenAI API key.

## Hardware

Model speed and the largest usable model depend on installed RAM and CPU or GPU. The Settings page shows model file sizes, but a model needs extra working memory while generating. ASTRA does not promise unlimited intelligence.

## Roadmap

The phase plan is in [docs/ROADMAP.md](docs/ROADMAP.md). Wake-word detection, autonomous agents, broad browser control, local TTS, timers, and a desktop shell remain out of scope until implemented and tested.
