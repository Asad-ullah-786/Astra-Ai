import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Mic, Square, Volume2, VolumeX } from "lucide-react";
import {
  ApiError,
  downloadVoiceModel,
  getPersonalProviderName,
  getVoiceStatus,
  hasPersonalProviderKey,
  transcribeAudio,
} from "../services/api.ts";
import { AstraCore } from "../components/AstraCore.tsx";
import { ModuleNotice } from "../components/ModuleNotice.tsx";
import { Panel } from "../components/Panel.tsx";
import { notifySuccess } from "../lib/notifications.ts";
import { useAstra } from "../hooks/useAstra.ts";
import { createSpeechQueue } from "../lib/speech.ts";
import { watchForSpeechPause } from "../lib/voiceSilence.ts";
import { hasLocalDeviceSession } from "../services/device.ts";
import {
  getBrowserSpeechRecognition,
  recognitionLanguage,
  responseLanguageCode,
  type BrowserSpeechRecognition,
} from "../lib/browserSpeech.ts";
import type { VoiceStatus } from "../types/index.ts";

type TranscriptionLanguage = "auto" | "en" | "ur";

interface VoiceModelOption {
  value: string;
  group: string;
  label: string;
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Voice input could not be completed.";
}

export function VoicePage() {
  const {
    aiStatus,
    commandError,
    health,
    localAIStatus,
    localSelectedModel,
    selectAIModel,
    sendCommand,
    refresh,
    state,
  } = useAstra();
  const assistantBusy = state === "processing" || state === "thinking" || state === "speaking";
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [language, setLanguage] = useState<TranscriptionLanguage>("auto");
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [modelSelectionBusy, setModelSelectionBusy] = useState(false);
  const [modelSelectionError, setModelSelectionError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const silenceCleanupRef = useRef<(() => void) | null>(null);
  const browserRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognizedTextRef = useRef("");
  const recognitionFailedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void getVoiceStatus()
      .then((status) => {
        if (active) setVoiceStatus(status);
      })
      .catch((caught: unknown) => {
        if (active) setError(describeError(caught));
      });
    return () => {
      active = false;
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
      silenceCleanupRef.current?.();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      if (browserRecognitionRef.current) {
        browserRecognitionRef.current.onresult = null;
        browserRecognitionRef.current.onerror = null;
        browserRecognitionRef.current.onend = null;
        browserRecognitionRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis?.cancel();
    };
  }, []);

  async function installModel() {
    setWorking(true);
    setError("");
    try {
      const status = await downloadVoiceModel();
      setVoiceStatus(status);
      await refresh();
      notifySuccess("Speech model installed successfully.");
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setWorking(false);
    }
  }

  async function transcribeAndSend(audio: Blob, selectedLanguage: TranscriptionLanguage) {
    setWorking(true);
    setError("");
    setReplyText("");
    try {
      const result = await transcribeAudio(audio, selectedLanguage);
      setTranscript(result.text);
      const speechQueue = speakReplies ? createSpeechQueue(result.language) : null;
      const reply = await sendCommand(result.text, {
        responseLanguage: result.language,
        onToken: (chunk) => {
          setReplyText((current) => current + chunk);
          speechQueue?.append(chunk);
        },
      });
      if (reply) {
        setReplyText(reply.content);
        speechQueue?.finish();
        if (speakReplies && !speechQueue) {
          setError("Speech playback is not supported by this browser. ASTRA's text reply is shown below.");
        }
      } else {
        speechQueue?.cancel();
      }
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setWorking(false);
    }
  }

  async function sendRecognizedText(text: string, responseLanguage: string) {
    setWorking(true);
    setError("");
    setReplyText("");
    setTranscript(text);
    const speechQueue = speakReplies ? createSpeechQueue(responseLanguage) : null;
    try {
      const reply = await sendCommand(text, {
        responseLanguage,
        onToken: (chunk) => {
          setReplyText((current) => current + chunk);
          speechQueue?.append(chunk);
        },
      });
      if (reply) {
        setReplyText(reply.content);
        speechQueue?.finish();
        if (speakReplies && !speechQueue) {
          setError("Speech playback is not supported by this browser. ASTRA's text reply is shown below.");
        }
      } else {
        speechQueue?.cancel();
      }
    } finally {
      setWorking(false);
    }
  }

  function startBrowserRecognition() {
    const Recognition = getBrowserSpeechRecognition();
    if (!Recognition) {
      setError("This browser does not support speech recognition. Use the Chat page to type your message.");
      return;
    }
    try {
      const recognition = new Recognition();
      recognizedTextRef.current = "";
      recognitionFailedRef.current = false;
      recognition.lang = recognitionLanguage(language, navigator.language);
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal && result[0]?.transcript) {
            recognizedTextRef.current += `${result[0].transcript} `;
          }
        }
        const text = recognizedTextRef.current.trim();
        if (text) setTranscript(text);
      };
      recognition.onerror = (event) => {
        recognitionFailedRef.current = true;
        const message = event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone or speech recognition permission was denied. Allow it in your browser and try again."
          : event.error === "network"
            ? "The browser speech service could not connect. Check your internet connection and try again."
            : event.error === "language-not-supported"
              ? "This browser does not support the selected speech language. Try another language or use Chat."
            : event.error === "no-speech"
              ? "No speech was detected. Try again and speak after starting."
              : "Browser speech recognition failed. Use the Chat page to type your message.";
        setError(message);
      };
      recognition.onend = () => {
        browserRecognitionRef.current = null;
        setRecording(false);
        if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
        const text = recognizedTextRef.current.trim();
        if (recognitionFailedRef.current) return;
        if (!text) {
          setError("No speech was recognized. Try again or type your message in Chat.");
          return;
        }
        void sendRecognizedText(text, responseLanguageCode(language, recognition.lang))
          .catch((caught: unknown) => setError(describeError(caught)));
      };
      browserRecognitionRef.current = recognition;
      recognition.start();
      setRecording(true);
      notifySuccess("Microphone started successfully.");
      recordingTimeoutRef.current = window.setTimeout(() => recognition.stop(), 60_000);
    } catch (caught) {
      browserRecognitionRef.current = null;
      setRecording(false);
      setError(describeError(caught));
    }
  }

  async function startRecording() {
    setError("");
    setTranscript("");
    window.speechSynthesis?.cancel();
    if (health?.cloud_deployment) {
      startBrowserRecognition();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      setError("This browser does not support microphone recording. Use a current version of Edge or Chrome.");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      notifySuccess("Microphone started successfully.");
      chunksRef.current = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("The browser could not record audio. Check the microphone and try again.");
      };
      recorder.onstop = () => {
        if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
        silenceCleanupRef.current?.();
        silenceCleanupRef.current = null;
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (audio.size) void transcribeAndSend(audio, language);
        else setError("The recording was empty. Try speaking a little longer.");
      };
      silenceCleanupRef.current = await watchForSpeechPause(stream, () => {
        if (recorder.state === "recording") recorder.stop();
      });
      recorder.start(250);
      setRecording(true);
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 60_000);
    } catch (caught) {
      silenceCleanupRef.current?.();
      silenceCleanupRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setError(describeError(caught));
    }
  }

  function stopRecording() {
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
    if (browserRecognitionRef.current) {
      browserRecognitionRef.current.stop();
      return;
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  const browserCanSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const browserSpeechAvailable = Boolean(getBrowserSpeechRecognition());
  const cloudDeployment = Boolean(health?.cloud_deployment);
  const voiceReady = cloudDeployment ? browserSpeechAvailable : Boolean(voiceStatus?.ready);
  const localModelSelected = Boolean(cloudDeployment && localSelectedModel);
  const localRouteActive = Boolean(
    localModelSelected && hasLocalDeviceSession() && localAIStatus?.connected,
  );
  const selectedModel = localRouteActive ? localSelectedModel : aiStatus?.selected_model ?? null;
  const personalProvider = cloudDeployment && !localRouteActive && hasPersonalProviderKey()
    ? getPersonalProviderName()
    : null;
  const selectedProvider = personalProvider
    ? personalProvider === "openai" ? "OpenAI" : "Gemini"
    : selectedModel?.startsWith("gemini:")
      ? "Gemini"
      : selectedModel?.startsWith("openai:")
        ? "OpenAI"
        : selectedModel
          ? "Ollama"
          : "No model selected";
  const activeProvider = personalProvider
    ? personalProvider === "openai" ? "OpenAI (personal API key)" : "Gemini (personal API key)"
    : localRouteActive
      ? "Ollama · paired PC"
      : selectedProvider;
  const modelHasProviderPrefix = selectedModel?.startsWith("gemini:")
    || selectedModel?.startsWith("openai:")
    || selectedModel?.startsWith("ollama:");
  const providerModel = personalProvider && !selectedModel?.startsWith(`${personalProvider}:`)
    ? personalProvider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash"
    : modelHasProviderPrefix
      ? selectedModel?.split(":").slice(1).join(":")
      : selectedModel;
  const providerConnection = localRouteActive
    ? "Connected · paired PC"
    : personalProvider
      ? "Saved · checked when the next request runs"
      : selectedProvider === "Gemini"
        ? aiStatus?.gemini?.connected ? "Connected" : "Not connected"
        : selectedProvider === "OpenAI"
          ? aiStatus?.openai?.connected ? "Connected" : "Not connected"
          : selectedProvider === "Ollama"
            ? aiStatus?.connected ? "Connected" : "Not connected"
            : "Choose a model in Settings";
  const languageGuidance = selectedProvider === "Ollama" && !personalProvider
    ? "Ollama is a runtime, not one model: it is not inherently English-only. Language ability varies by the selected model. ASTRA asks it to reply in the detected speech language; check that model's card for its exact language coverage."
    : selectedProvider === "Gemini" || selectedProvider === "OpenAI" || personalProvider
      ? "Gemini and OpenAI models can handle multiple languages; exact language coverage and quality vary by model. ASTRA asks the selected model to reply in the detected speech language."
      : "Choose an AI model to see its language behavior. ASTRA will ask the active model to reply in the detected speech language.";
  const availableOllamaModels = cloudDeployment
    ? localAIStatus?.connected ? localAIStatus.models : []
    : aiStatus?.connected ? aiStatus.models : [];
  const voiceModelOptions: VoiceModelOption[] = [
    ...availableOllamaModels.map((model) => ({
      value: model.name,
      group: cloudDeployment ? "Paired PC Ollama" : "Local Ollama",
      label: `${cloudDeployment ? "Paired PC" : "Local"} Ollama · ${model.name}`,
    })),
    ...(aiStatus?.gemini?.connected
      ? aiStatus.gemini.models.map((model) => ({
          value: `gemini:${model}`,
          group: "Google Gemini",
          label: model,
        }))
      : []),
    ...(aiStatus?.openai?.connected
      ? aiStatus.openai.models.map((model) => ({
          value: `openai:${model}`,
          group: "OpenAI",
          label: model,
        }))
      : []),
  ];
  if (selectedModel && !voiceModelOptions.some((model) => model.value === selectedModel)) {
    voiceModelOptions.unshift({
      value: selectedModel,
      group: "Current selection",
      label: `Current · ${activeProvider} · ${providerModel ?? selectedModel}`,
    });
  }
  const voiceModelGroups = [...new Set(voiceModelOptions.map((model) => model.group))];
  const coreState = recording ? "listening" : working && state === "idle" ? "processing" : state;
  const voiceStatusText = recording
    ? "Listening..."
    : state === "thinking"
      ? "ASTRA IS THINKING"
      : state === "speaking"
        ? "ASTRA IS SPEAKING"
        : working
          ? "PROCESSING YOUR VOICE"
          : voiceReady
            ? "READY · PRESS CLICK HERE TO TALK"
            : cloudDeployment
              ? "BROWSER SPEECH UNAVAILABLE"
              : "VOICE SETUP REQUIRED";

  async function changeActiveModel(model: string) {
    if (!model || model === selectedModel || modelSelectionBusy) return;
    setModelSelectionBusy(true);
    setModelSelectionError("");
    try {
      await selectAIModel(model);
      const selectedLabel = voiceModelOptions.find((option) => option.value === model)?.label ?? model;
      notifySuccess(`Voice model changed to ${selectedLabel}.`);
    } catch (caught) {
      setModelSelectionError(
        caught instanceof Error ? caught.message : "The active voice model could not be changed.",
      );
    } finally {
      setModelSelectionBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <section className="voice-core-panel voice-assistant-hero" aria-label="ASTRA voice assistant">
        <div className="voice-core-stars" aria-hidden="true" />
        <div className="voice-core-copy voice-assistant-content">
          <span className="voice-core-eyebrow">
            {cloudDeployment ? "ASTRA · BROWSER VOICE" : "ASTRA · LOCAL VOICE"}
          </span>
          <AstraCore state={coreState} />
          <h1 className="voice-assistant-title">
            I'm <span>ASTRA</span>, Your Virtual Assistant
          </h1>
          <p className="voice-assistant-subtitle">
            {recording
              ? "I'm listening. Speak naturally and I'll help."
              : "Tap below and tell me what you need."}
          </p>
          {recording ? (
            <div className="voice-listening-state" role="status" aria-live="polite">
              <span className="voice-listening-ring" aria-hidden="true"><Mic className="size-5" /></span>
              <strong>Listening...</strong>
            </div>
          ) : (
            <button
              type="button"
              disabled={!voiceReady || working || assistantBusy}
              onClick={() => void startRecording()}
              className="voice-main-action"
            >
              {working ? <LoaderCircle className="size-5 animate-spin" /> : <Mic className="size-5" />}
              {working ? "PROCESSING..." : voiceReady ? "CLICK HERE TO TALK" : "VOICE SETUP REQUIRED"}
            </button>
          )}
          {recording ? (
            <button type="button" onClick={stopRecording} className="voice-stop-action">
              <Square className="size-3.5 fill-current" /> STOP & SEND
            </button>
          ) : null}
          {!recording ? <span className="voice-core-state" role="status">{voiceStatusText}</span> : null}
        </div>
      </section>
      <ModuleNotice moduleId="voice" />
      <Panel title="ACTIVE VOICE ROUTE">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-astra-cyan/20 bg-slate-950/45 p-4">
            <p className="font-display text-xs tracking-[0.14em] text-astra-cyan">AI PROVIDER & MODEL</p>
            <p className="mt-2 text-sm font-semibold text-white">{activeProvider}</p>
            <p className="mt-1 break-all text-sm text-astra-muted">
              {providerModel ?? "Select a model in Settings"}
            </p>
            <p className="mt-2 text-xs text-astra-muted">{providerConnection}</p>
            <label className="mt-4 flex flex-col gap-1 text-xs text-astra-muted" htmlFor="voice-active-model">
              Change active AI model
              <select
                id="voice-active-model"
                value={selectedModel ?? ""}
                onChange={(event) => void changeActiveModel(event.target.value)}
                disabled={!voiceModelOptions.length || modelSelectionBusy}
                className="min-w-0 rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan disabled:opacity-60"
              >
                <option value="">
                  {voiceModelOptions.length ? "Choose an available model" : "No connected models available"}
                </option>
                {voiceModelGroups.map((group) => (
                  <optgroup key={group} label={group}>
                    {voiceModelOptions
                      .filter((model) => model.group === group)
                      .map((model) => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {modelSelectionBusy ? (
              <p className="mt-2 text-xs text-astra-cyan" role="status">Changing active AI model…</p>
            ) : null}
            {modelSelectionError ? (
              <p className="mt-2 text-xs text-astra-danger" role="alert">{modelSelectionError}</p>
            ) : null}
            {localModelSelected && !localRouteActive ? (
              <p className="mt-2 text-xs text-amber-200" role="status">
                {selectedModel || personalProvider
                  ? "The selected local Ollama model is offline. ASTRA will use the configured hosted model instead."
                  : "The selected local Ollama model is offline. Reconnect the companion or choose a hosted model in Settings."}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-astra-cyan/20 bg-slate-950/45 p-4">
            <p className="font-display text-xs tracking-[0.14em] text-astra-cyan">SPEECH ENGINE</p>
            <p className="mt-2 text-sm font-semibold text-white">
              {cloudDeployment
                ? "Browser speech recognition"
                : voiceStatus?.ready
                  ? "Local multilingual Whisper"
                  : "Local Whisper setup required"}
            </p>
            <p className="mt-1 text-xs text-astra-muted">
              {cloudDeployment
                ? browserSpeechAvailable
                  ? "Available in this browser. Uses its selected locale; the controls offer automatic locale, English, or Urdu."
                  : "Speech recognition is unavailable in this browser. Try a current version of Chrome or Edge."
                : voiceStatus?.ready
                  ? "Whisper is multilingual. The controls offer automatic detection, English, or Urdu."
                  : voiceStatus?.dependencies_installed
                    ? "The local speech model must be downloaded before offline transcription is available."
                    : "Install the local speech dependencies, then download the multilingual model."}
            </p>
            <p className="mt-2 text-xs text-astra-muted">
              Replies are spoken by your browser's speech engine when supported.
            </p>
          </div>
          <p className="text-xs leading-5 text-astra-muted sm:col-span-2">{languageGuidance}</p>
        </div>
      </Panel>
      <Panel title="VOICE CONTROLS">
        <div className="flex flex-col gap-4">
          {!voiceReady ? (
            <div className="rounded-xl border border-astra-cyan/20 bg-slate-950/45 p-4">
              <p className="text-sm text-white">
                {cloudDeployment
                  ? "Browser speech recognition is not available in this browser."
                  : voiceStatus?.dependencies_installed
                    ? "Download the small multilingual speech model to enable offline transcription."
                    : "Install the local speech dependencies before downloading the offline model."}
              </p>
              <p className="mt-1 text-xs text-astra-muted">
                {cloudDeployment
                  ? "Use a current Chrome or Edge browser, or type your message on the Chat page."
                  : "Speech audio is processed on this PC and is not saved."}
              </p>
              {!cloudDeployment && !voiceStatus?.dependencies_installed ? (
                <code className="mt-3 block rounded-lg bg-black/40 p-3 text-xs text-astra-cyan">
                  backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
                </code>
              ) : null}
              {!cloudDeployment ? (
                <button
                  type="button"
                  disabled={working || !voiceStatus?.dependencies_installed}
                  onClick={() => void installModel()}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-astra-cyan/40 px-4 py-2 text-sm text-astra-cyan disabled:opacity-50"
                >
                  {working ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                  {working ? "DOWNLOADING SPEECH MODEL..." : "DOWNLOAD SPEECH MODEL"}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <label className="flex max-w-sm flex-col gap-1 text-xs text-astra-muted">
                Speech language
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as TranscriptionLanguage)}
                  disabled={recording || working}
                  className="rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
                >
                  <option value="auto">{cloudDeployment ? "Use browser language" : "Detect automatically"}</option>
                  <option value="en">English</option>
                  <option value="ur">Urdu</option>
                </select>
                <span>
                  {cloudDeployment
                    ? "Browser recognition uses its selected language; choose English or Urdu to override your browser language."
                    : "Automatic detection supports multilingual speech; select English or Urdu to force recognition."}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex w-fit items-center gap-2 text-sm text-astra-muted">
                  <input
                    type="checkbox"
                    checked={speakReplies}
                    onChange={(event) => setSpeakReplies(event.target.checked)}
                    disabled={!browserCanSpeak || recording || working}
                  />
                  Speak ASTRA replies aloud
                </label>
                {speakReplies ? (
                  <button
                    type="button"
                    onClick={() => window.speechSynthesis?.cancel()}
                    className="inline-flex w-fit items-center gap-2 text-xs text-astra-cyan hover:text-white"
                  >
                    <VolumeX className="size-4" /> STOP SPOKEN REPLY
                  </button>
                ) : null}
                {!browserCanSpeak ? (
                  <p className="text-xs text-astra-muted">Spoken replies are not supported by this browser.</p>
                ) : null}
              </div>
            </>
          )}

          {recording ? (
            <p className="text-xs text-astra-muted" role="status">
              Microphone is on · pauses send automatically · 60 sec max
            </p>
          ) : null}

          {error ? <p className="text-sm text-astra-danger" role="alert">{error}</p> : null}
          {commandError ? <p className="text-sm text-astra-danger" role="alert">{commandError}</p> : null}
          {transcript ? (
            <div className="rounded-xl border border-astra-cyan/20 bg-slate-950/45 p-4" aria-live="polite">
              <div className="flex items-center gap-2 text-xs font-display tracking-[0.14em] text-astra-cyan">
                <Volume2 className="size-4" /> RECOGNIZED SPEECH
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-white">{transcript}</p>
            </div>
          ) : null}
          {replyText ? (
            <div className="rounded-xl border border-violet-300/20 bg-violet-950/20 p-4" aria-live="polite">
              <div className="font-display text-xs tracking-[0.14em] text-violet-200">ASTRA REPLY</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-white">{replyText}</p>
            </div>
          ) : null}
          <p className="text-xs leading-5 text-astra-muted">
            {cloudDeployment
              ? "Your browser performs speech recognition, and ASTRA receives the resulting text for chat. Browser speech services may process audio according to that browser provider's policies. Microphone access starts only after you press the button; spoken replies use your browser's speech engine."
              : <>
                  Recording is sent only to ASTRA on this PC for local Whisper transcription; audio is held temporarily and
                  deleted after processing. The recognized text is saved in conversation history and sent to your selected
                  {aiStatus?.selected_model?.startsWith("gemini:")
                    ? " Gemini cloud model"
                    : aiStatus?.selected_model?.startsWith("openai:")
                      ? " OpenAI cloud model"
                      : " local Ollama model"}.
                  Spoken replies use voices provided by your browser or Windows settings. Wake-word and background listening
                  are off.
                </>}
          </p>
        </div>
      </Panel>
    </div>
  );
}
