# ASTRA implementation roadmap

Each phase is finished only after its behavior is tested. A screen that only looks complete does not count.

## Phase 1 — Foundation (implemented)

- Local FastAPI backend, SQLite, and authenticated optional access.
- React command center connected to that API.
- Text commands persisted, with an explicit "no model connected" reply.
- Live system meters and activity log.
- Visible microphone monitor. Push-to-talk speech recognition is now available through Phase 3.

## Phase 2 — AI brain (implemented and verified on this machine)

- Ollama as the local model provider, behind a typed provider interface.
- Installed-model list, persisted model selection, and model size display.
- Streaming replies and multi-turn conversation history.
- Clear errors when Ollama is down or no model is selected. No invented answers.
- Ollama with `qwen2.5:1.5b` has returned real local responses on this machine.
- AI Core provides the live chat workspace; the Conversations module separately searches, resumes, and deletes persisted chat history.

## Phase 3 — Voice (local push-to-talk implemented)

- Push-to-talk speech-to-text using a local multilingual Whisper model (English/Urdu).
- Optional spoken replies using voices provided by the browser or Windows.
- Audio is uploaded only to the loopback API for transcription, held in a temporary file, and deleted afterward.
- Wake word and continuous/background listening remain disabled.
- Microphone state remains visible; speech recording starts only after an explicit user action.
- True local TTS, wake-word activation, and unattended listening remain pending.

## Phase 4 — Safe Windows quick actions (implemented)

- Launch only allowlisted applications (VS Code, Chrome, and Settings).
- Capture one frame only after the user chooses a screen or window in the browser share picker.
- Arbitrary shell execution, file operations, and background browser control are not implemented.

## Phase 5 — Personal memory (implemented)

- User-approved notes with create, local search, update, and delete.
- Relevant saved notes are included in local chat context. No silent storage of secrets.

## Phase 6 — Research (basic web search implemented)

- Free web search and original source URLs.
- Search terms are sent to DuckDuckGo and are not stored in activity logs.
- Page reading and grounded summarization remain pending.
- No fabricated sources and no claim that a result is current unless it was fetched.

## Phase 7 — Productivity (tasks, calendar, and due reminders implemented; timers pending)

- Persistent task create, edit, complete, and delete with notes and due dates.
- Month calendar reads and writes the same persistent due tasks.
- A local reminder worker records due tasks once, including tasks that became due while ASTRA was stopped.
- Timer support remains pending.

## Local capability directory

- Agent, skill, calendar, and knowledge pages link to working local modules and show their actual status.
- These are user-triggered features, not autonomous background agents.
- Only installed local Ollama models are active; paid/cloud providers shown in mockups are not configured.

## Phase 8 — Desktop application

- Tauri shell around the local backend.
- Windows launcher and installer. Requires the Rust toolchain, which is free.

## Phase 9 — Web deployment

- Production frontend build.
- Remote use only with an explicit token and an encrypted connection.
- A hosted page cannot control this PC unless that secure local link is configured.

## Phase 10 — Final testing

- API, model, voice, automation, memory, desktop, and browser passes.
- Fix failures before calling the assistant complete.

Paid services are out of scope unless you approve one. Every integration should stay replaceable.
