import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";
import { getCloudModelPricingLabel, getLocalModelDownloadQueue } from "../lib/llmProviders.ts";
import {
  getAIUsage,
  getApiToken,
  getPersonalProviderName,
  hasPersonalProviderKey,
  setPersonalProviderCredentials,
  type AIUsage,
} from "../services/api.ts";

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const { settings, health, aiStatus, stats, saveDisplayName, saveApiToken, selectAIModel, clearAIModel, refreshAI } = useAstra();
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [token, setToken] = useState(() => getApiToken());
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [geminiModelOverride, setGeminiModelOverride] = useState<string | null>(null);
  const [openaiModelOverride, setOpenAIModelOverride] = useState<string | null>(null);
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [personalProvider, setPersonalProvider] = useState(getPersonalProviderName);
  const [personalKey, setPersonalKey] = useState("");
  const [hasPersonalKey, setHasPersonalKey] = useState(hasPersonalProviderKey);
  const [ollamaCommandCopied, setOllamaCommandCopied] = useState(false);
  const name = nameOverride ?? settings?.user_display_name ?? "";
  const selectedModel = aiStatus?.selected_model ?? "";
  const geminiStatus = aiStatus?.gemini;
  const openaiStatus = aiStatus?.openai;
  const localModelDownloadQueue = getLocalModelDownloadQueue(aiStatus);
  const isCloudModelSelected = selectedModel.startsWith("gemini:") || selectedModel.startsWith("openai:");
  const selectedLocalModel = modelOverride ?? (isCloudModelSelected ? "" : selectedModel);
  const selectedGeminiModel = geminiModelOverride ?? (selectedModel.startsWith("gemini:") ? selectedModel.slice("gemini:".length) : "");
  const selectedOpenAIModel = openaiModelOverride ?? (selectedModel.startsWith("openai:") ? selectedModel.slice("openai:".length) : "");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!health?.cloud_deployment) return;
    void getAIUsage()
      .then(setUsage)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load today's AI usage."));
  }, [health?.cloud_deployment]);

  useEffect(() => {
    const provider = searchParams.get("provider");
    if (!provider) return;
    const targetId = provider === "gemini"
      ? "settings-gemini"
      : provider === "openai"
        ? "settings-openai"
        : "settings-ollama";
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("settings-section-highlight");
      window.setTimeout(() => target.classList.remove("settings-section-highlight"), 2400);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchParams]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Panel title="OPERATOR">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice(null);
            setError(null);
            void saveDisplayName(name)
              .then(() => {
                setNameOverride(null);
                setNotice("Display name saved on this computer.");
              })
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : "The name could not be saved.");
              });
          }}
        >
          <label className="sr-only" htmlFor="display-name">
            Display name
          </label>
          <input
            id="display-name"
            value={name}
            maxLength={40}
            onChange={(event) => setNameOverride(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-astra-cyan/30 bg-black/40 px-4 py-3 outline-none focus:border-astra-cyan"
          />
          <button type="submit" className="rounded-xl bg-astra-blue px-4 py-3 font-display text-xs tracking-[0.16em]">
            SAVE NAME
          </button>
        </form>
      </Panel>

      {health?.cloud_deployment ? (
        <Panel title="GUEST MESSAGE ALLOWANCE · PERSONAL API KEY">
          <p className="text-sm leading-6 text-astra-muted">
            {usage?.daily_limit == null
              ? "Loading your daily shared-key allowance..."
              : `${usage.remaining} of ${usage.daily_limit} shared-key AI messages remain today (${usage.used_today} used, UTC day).`}
            {" "}The project owner pays for shared-key requests. After the daily allowance, add your own Gemini or OpenAI key;
            your provider may bill you directly. The shared allowance belongs to this anonymous guest workspace, and guest
            creation is rate-limited by the server.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="personal-provider">Personal API-key provider</label>
            <select
              id="personal-provider"
              value={personalProvider}
              onChange={(event) => setPersonalProvider(event.target.value)}
              className="rounded-xl border border-astra-cyan/30 bg-[#080d18] px-4 py-3 outline-none focus:border-astra-cyan"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
            </select>
            <label className="sr-only" htmlFor="personal-provider-key">Personal provider API key</label>
            <input
              id="personal-provider-key"
              type="password"
              autoComplete="off"
              value={personalKey}
              onChange={(event) => setPersonalKey(event.target.value)}
              placeholder={hasPersonalKey ? "Key saved for this browser tab" : "Paste your provider API key"}
              className="min-w-0 flex-1 rounded-xl border border-astra-cyan/30 bg-black/40 px-4 py-3 outline-none focus:border-astra-cyan"
            />
            <button
              type="button"
              onClick={() => {
                if (!personalKey.trim()) {
                  setError("Paste your personal API key before saving it.");
                  return;
                }
                setPersonalProviderCredentials(personalProvider, personalKey);
                setPersonalKey("");
                setHasPersonalKey(true);
                setError(null);
                setNotice("Personal API key saved for this browser tab only.");
              }}
              className="rounded-xl border border-astra-cyan/40 px-4 py-3 font-display text-xs tracking-[0.16em] text-astra-cyan"
            >
              SAVE FOR THIS TAB
            </button>
            {hasPersonalKey ? (
              <button
                type="button"
                onClick={() => {
                  setPersonalProviderCredentials(personalProvider, "");
                  setHasPersonalKey(false);
                  setPersonalKey("");
                  setNotice("Personal API key removed from this browser tab.");
                }}
                className="rounded-xl border border-astra-danger/40 px-4 py-3 font-display text-xs tracking-[0.16em] text-astra-danger"
              >
                REMOVE KEY
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-astra-muted">
            ASTRA does not save this key on its server. It is held in this tab's session storage and sent over HTTPS only
            with AI requests. Your provider handles its key, billing, and data policies.
          </p>
        </Panel>
      ) : null}

      {health && !health.cloud_deployment ? (
        <Panel title="API TOKEN">
          <p className="mb-3 text-sm leading-6 text-astra-muted">
            When backend authentication is enabled, paste the same ASTRA_API_TOKEN value here. It stays in this browser
            session and is not written to the database.
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              saveApiToken(token);
              setError(null);
              setNotice(token.trim() ? "Token stored for this browser session." : "Session token cleared.");
            }}
          >
            <label className="sr-only" htmlFor="api-token">
              API token
            </label>
            <input
              id="api-token"
              type="password"
              value={token}
              autoComplete="off"
              onChange={(event) => setToken(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-astra-cyan/30 bg-black/40 px-4 py-3 outline-none focus:border-astra-cyan"
            />
            <button type="submit" className="rounded-xl border border-astra-cyan/40 px-4 py-3 font-display text-xs tracking-[0.16em] text-astra-cyan">
              APPLY TOKEN
            </button>
          </form>
          <p className="mt-3 font-mono text-xs text-astra-muted">
            Backend auth {health.auth_required ? "required" : "not required"} · model {health.model ?? "unknown"} · phase{" "}
            {health.phase ?? "—"}
          </p>
        </Panel>
      ) : null}

      <Panel id="settings-ollama" title={health?.cloud_deployment ? "HOSTED AI MODEL · OLLAMA" : "LOCAL AI MODEL · OLLAMA"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`font-mono text-xs tracking-[0.16em] ${aiStatus?.connected ? "text-astra-ok" : "text-astra-danger"}`}>
              {aiStatus?.connected ? "OLLAMA CONNECTED" : "OLLAMA NOT CONNECTED"}
            </p>
            <p className="mt-1 text-sm text-astra-muted">
              {selectedLocalModel
                ? `Selected: ${selectedLocalModel}`
                : health?.cloud_deployment ? "No hosted Ollama model selected" : "No local model selected"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshAI().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not check Ollama."))}
            className="rounded-xl border border-astra-cyan/40 px-3 py-2 text-xs text-astra-cyan"
          >
            CHECK CONNECTION
          </button>
          {selectedLocalModel ? (
            <button
              type="button"
              onClick={() => void clearAIModel()
                .then(() => {
                  setModelOverride(null);
                  setGeminiModelOverride(null);
                  setOpenAIModelOverride(null);
                })
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The model selection could not be cleared."))}
              className="rounded-xl border border-astra-danger/40 px-3 py-2 text-xs text-astra-danger"
            >
              CLEAR MODEL
            </button>
          ) : null}
        </div>
        {aiStatus?.error ? (
          <p className="mt-3 text-sm text-astra-danger" role="status">{aiStatus.error}</p>
        ) : null}
        <p className="mt-4 text-sm leading-6 text-astra-muted">
          {health?.cloud_deployment
            ? "Hosted Ollama runs on the server configured by ASTRA_OLLAMA_URL in Vercel; Ollama does not need to be installed on your PC. Use the public HTTPS address of your Ollama server. If it requires gateway authentication, set ASTRA_OLLAMA_API_KEY in Vercel."
            : "When Ollama is selected, AI runs locally and chat history stays on this computer. Installed local models only appear here. Your computer reports"}{" "}
          {!health?.cloud_deployment
            ? <>{stats ? `${stats.ram_total_gb.toFixed(1)} GB RAM` : "its RAM size"}; models also need extra memory while generating, so larger models may run slowly or fail to load.</>
            : null}
        </p>
        {aiStatus?.models.length ? (
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setNotice(null);
              setError(null);
              void selectAIModel(selectedLocalModel)
                .then(() => {
                  setModelOverride(null);
                  setGeminiModelOverride(null);
                  setOpenAIModelOverride(null);
                  setNotice(health?.cloud_deployment ? "Hosted Ollama model selected." : "Local model selection saved.");
                })
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The model could not be selected."));
            }}
          >
            <label className="sr-only" htmlFor="ai-model">
              {health?.cloud_deployment ? "Hosted Ollama model" : "Installed Ollama model"}
            </label>
            <select
              id="ai-model"
              value={selectedLocalModel}
              onChange={(event) => setModelOverride(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-astra-cyan/30 bg-[#080d18] px-4 py-3 outline-none focus:border-astra-cyan"
            >
              <option value="">{health?.cloud_deployment ? "Choose a hosted model" : "Choose an installed model"}</option>
              {aiStatus.models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name} · {(model.size / 1_000_000_000).toFixed(1)} GB
                  {model.parameter_size ? ` · ${model.parameter_size}` : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedLocalModel || selectedLocalModel === aiStatus.selected_model}
              className="rounded-xl bg-astra-blue px-4 py-3 font-display text-xs tracking-[0.16em] disabled:opacity-40"
            >
              USE MODEL
            </button>
          </form>
        ) : null}
        {aiStatus?.connected && aiStatus.models.length === 0 ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-astra-muted">
            {health?.cloud_deployment
              ? "The hosted Ollama server has no models installed. Install a model on that server, then check the connection again."
              : <>No local models are installed. Run a small model such as{" "}
                  <code className="font-mono text-astra-cyan">ollama run qwen2.5:3b</code> in a terminal and check again.
                  Model downloads use disk space and RAM; ASTRA will not download one automatically.</>}
          </div>
        ) : null}
      </Panel>

      <Panel title="OPTIONAL · INSTALL OLLAMA ON YOUR PC">
        <p className="text-sm leading-6 text-astra-muted">
          {health?.cloud_deployment
            ? "Already have Ollama on this computer? You can use it with ASTRA's local website. The hosted Vercel site cannot connect to your computer's localhost."
            : "You can use Ollama locally without a Gemini/OpenAI key. If Ollama is already installed, skip the download and continue with the local ASTRA website steps below."}
        </p>
        {health?.cloud_deployment ? (
          <div className="mt-4 rounded-xl border border-astra-cyan/20 bg-black/25 p-4">
            <h3 className="font-display text-xs tracking-[0.12em] text-astra-cyan">USE THE OLLAMA YOU ALREADY INSTALLED</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-astra-muted">
              <li>On your Windows PC, make sure the Ollama app is running. Open PowerShell and run <code className="font-mono text-astra-cyan">ollama list</code> to see installed models.</li>
              <li>If the list is empty, download one model once, for example <code className="font-mono text-astra-cyan">ollama pull qwen2.5:3b</code>.</li>
              <li>Download/extract ASTRA for PC below, install its prerequisites from the README, then run <code className="font-mono text-astra-cyan">start_astra.bat</code>.</li>
              <li>Open <code className="font-mono text-astra-cyan">http://127.0.0.1:5173</code> on that same PC. In Settings, press <strong>CHECK CONNECTION</strong>, select your model, then press <strong>USE MODEL</strong>.</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-astra-muted">
              This uses Ollama on your PC without exposing it to the internet. Pairing the companion alone does not connect local Ollama to this hosted website.
            </p>
          </div>
        ) : null}
        <a
          href="https://ollama.com/download"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex rounded-lg border border-astra-cyan/40 px-4 py-2 text-sm text-astra-cyan"
        >
          {health?.cloud_deployment ? "OLLAMA DOWNLOAD (IF NEEDED)" : "DOWNLOAD OLLAMA"}
        </a>
        <a
          href="https://github.com/Asad-ullah-786/Astra-Ai/archive/refs/heads/main.zip"
          target="_blank"
          rel="noreferrer"
          className="ml-2 mt-3 inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm text-astra-muted"
        >
          DOWNLOAD ASTRA FOR PC
        </a>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-black/40 px-3 py-2 font-mono text-sm text-white">ollama run qwen2.5:3b</code>
          <button
            type="button"
            onClick={() => {
              if (!navigator.clipboard) {
                setError("Clipboard access is unavailable in this browser. Select and copy the command instead.");
                return;
              }
              void navigator.clipboard.writeText("ollama run qwen2.5:3b")
                .then(() => setOllamaCommandCopied(true))
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not copy the Ollama command."));
            }}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-astra-muted"
          >
            {ollamaCommandCopied ? "COPIED" : "COPY COMMAND"}
          </button>
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-5 text-astra-muted">
          <li>If Ollama is not installed yet, install it from the download link. Run the command above only if you need to download this model.</li>
          <li>To use it with ASTRA, download and extract ASTRA for PC, install the prerequisites in its README, then run <code>start_astra.bat</code> on that PC and open <code>http://127.0.0.1:5173</code>.</li>
          <li>Return here, press CHECK CONNECTION, select the downloaded model, and choose USE MODEL.</li>
        </ol>
        {health?.cloud_deployment ? (
          <p className="mt-3 text-xs leading-5 text-amber-200/80">
            This local install works with ASTRA running on your PC. The hosted Vercel website cannot reach your PC's Ollama;
            using Ollama from the hosted site requires a separate public HTTPS Ollama server configured by the ASTRA operator.
          </p>
        ) : null}
      </Panel>

      {!health?.cloud_deployment ? <Panel title="LOCAL MODEL DOWNLOAD QUEUE">
        <p className="mb-4 text-sm leading-6 text-astra-muted">
          Ollama installs these models one at a time. ASTRA checks the installed-model list and makes each one selectable as soon as Ollama verifies it; partial downloads are not shown as available.
        </p>
        <ol className="flex flex-col gap-3">
          {localModelDownloadQueue.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs text-astra-muted">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong className="block text-sm">{item.name}</strong>
                  <span className="font-mono text-xs text-astra-muted">{item.model}</span>
                </span>
              </span>
              <span
                className={`font-mono text-xs tracking-[0.12em] ${
                  item.state === "available"
                    ? "text-astra-ok"
                    : item.state === "connected"
                      ? "text-astra-cyan"
                      : item.state === "checking"
                        ? "text-astra-muted"
                        : "text-astra-danger"
                }`}
                role={item.state === "connected" ? "status" : undefined}
              >
                {item.status.toUpperCase()}
              </span>
            </li>
          ))}
        </ol>
      </Panel> : null}

      <Panel id="settings-gemini" title="CLOUD AI MODEL · GOOGLE GEMINI">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`font-mono text-xs tracking-[0.16em] ${geminiStatus?.connected ? "text-astra-ok" : "text-astra-danger"}`}>
              {aiStatus == null
                ? "CHECKING GEMINI"
                : geminiStatus?.connected
                  ? `GEMINI CONNECTED · ${geminiStatus.models.length} CHAT MODEL${geminiStatus.models.length === 1 ? "" : "S"}`
                  : geminiStatus?.configured ? "GEMINI CONNECTION FAILED" : "GEMINI NOT CONFIGURED"}
            </p>
            <p className="mt-1 text-sm text-astra-muted">
              {selectedModel.startsWith("gemini:") ? `Selected: ${selectedGeminiModel}` : "No Gemini model selected"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void refreshAI().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not check Gemini."));
            }}
            className="rounded-xl border border-astra-cyan/40 px-3 py-2 text-xs text-astra-cyan"
          >
            CHECK GEMINI CONNECTION
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-astra-muted">
          Gemini is a cloud service. When selected, ASTRA sends your prompts, conversation history, and any saved-memory
          context included in the chat to Google for processing. Keep Ollama selected if you want chat to stay on this computer.
        </p>
        <p className="mt-2 text-sm leading-6 text-astra-muted">
          “Free tier” means the model has published free-tier access; quotas and eligibility depend on your account and region.
          Usage beyond free limits may be billed. Check Google’s current pricing before use.
        </p>
        {geminiStatus?.error ? (
          <p className="mt-3 text-sm text-astra-danger" role="status">{geminiStatus.error}</p>
        ) : null}
        {geminiStatus?.connected && geminiStatus.models.length === 0 ? (
          <p className="mt-3 text-sm text-astra-muted" role="status">
            No compatible text-generation models were returned for this API key.
          </p>
        ) : null}
        {geminiStatus?.connected && geminiStatus.models.length > 0 ? (
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setNotice(null);
              setError(null);
              void selectAIModel(`gemini:${selectedGeminiModel}`)
                .then(() => {
                  setModelOverride(null);
                  setGeminiModelOverride(null);
                  setOpenAIModelOverride(null);
                  setNotice("Gemini model selection saved. Chat context will be sent to Google.");
                })
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The Gemini model could not be selected."));
            }}
          >
            <label className="sr-only" htmlFor="gemini-model">Available Gemini model</label>
            <select
              id="gemini-model"
              value={selectedGeminiModel}
              onChange={(event) => setGeminiModelOverride(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-astra-cyan/30 bg-[#080d18] px-4 py-3 outline-none focus:border-astra-cyan"
            >
              <option value="">Choose an available Gemini model</option>
              {geminiStatus.models.map((model) => (
                <option key={model} value={model}>{model} · {getCloudModelPricingLabel("gemini", model)}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedGeminiModel || `gemini:${selectedGeminiModel}` === selectedModel}
              className="rounded-xl bg-astra-blue px-4 py-3 font-display text-xs tracking-[0.16em] disabled:opacity-40"
            >
              USE GEMINI
            </button>
          </form>
        ) : null}
      </Panel>
      <Panel id="settings-openai" title="CLOUD AI MODEL · OPENAI">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`font-mono text-xs tracking-[0.16em] ${openaiStatus?.connected ? "text-astra-ok" : "text-astra-danger"}`}>
              {aiStatus == null
                ? "CHECKING OPENAI"
                : openaiStatus?.connected
                  ? openaiStatus.models.length
                    ? `OPENAI CONNECTED · ${openaiStatus.models.length} PAID CHAT MODELS`
                    : "NO COMPATIBLE OPENAI CHAT MODELS"
                  : openaiStatus?.configured ? "OPENAI CONNECTION FAILED" : "OPENAI NOT CONFIGURED"}
            </p>
            <p className="mt-1 text-sm text-astra-muted">
              {selectedModel.startsWith("openai:") ? `Selected: ${selectedOpenAIModel}` : "No OpenAI model selected"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void refreshAI().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not check OpenAI."));
            }}
            className="rounded-xl border border-astra-cyan/40 px-3 py-2 text-xs text-astra-cyan"
          >
            CHECK OPENAI CONNECTION
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-astra-muted">
          OpenAI is a cloud service. When selected, ASTRA sends your prompts, conversation history, and any saved-memory
          context included in the chat to OpenAI. Keep Ollama selected if you want chat to stay on this computer.
        </p>
        {openaiStatus?.error ? (
          <p className="mt-3 text-sm text-astra-danger" role="status">{openaiStatus.error}</p>
        ) : null}
        {openaiStatus?.connected && openaiStatus.models.length === 0 ? (
          <p className="mt-3 text-sm text-astra-muted" role="status">
            No compatible text-generation models were returned. OpenAI API models are billed by usage, so available
            credits are required to generate replies.
          </p>
        ) : null}
        {openaiStatus?.connected && openaiStatus.models.length > 0 ? (
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setNotice(null);
              setError(null);
              void selectAIModel(`openai:${selectedOpenAIModel}`)
                .then(() => {
                  setModelOverride(null);
                  setGeminiModelOverride(null);
                  setOpenAIModelOverride(null);
                  setNotice("OpenAI model selection saved. Chat context will be sent to OpenAI.");
                })
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The OpenAI model could not be selected."));
            }}
          >
            <label className="sr-only" htmlFor="openai-model">Available OpenAI model</label>
            <select
              id="openai-model"
              value={selectedOpenAIModel}
              onChange={(event) => setOpenAIModelOverride(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-astra-cyan/30 bg-[#080d18] px-4 py-3 outline-none focus:border-astra-cyan"
            >
              <option value="">Choose an available OpenAI model</option>
              {openaiStatus.models.map((model) => (
                <option key={model} value={model}>{model} · {getCloudModelPricingLabel("openai", model)}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedOpenAIModel || `openai:${selectedOpenAIModel}` === selectedModel}
              className="rounded-xl bg-astra-blue px-4 py-3 font-display text-xs tracking-[0.16em] disabled:opacity-40"
            >
              USE OPENAI
            </button>
          </form>
        ) : null}
      </Panel>
      {notice ? <p className="text-sm text-astra-ok">{notice}</p> : null}
      {error ? (
        <p className="text-sm text-astra-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
