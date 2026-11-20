import { Brain, MessageSquarePlus, Settings2 } from "lucide-react";
import { NavLink } from "react-router";
import { CommandBar } from "../components/CommandBar.tsx";
import { DeviceActionApproval } from "../components/DeviceActionApproval.tsx";
import { ConversationPanel } from "../components/ConversationPanel.tsx";
import { useAstra } from "../hooks/useAstra.ts";

export function ChatPage() {
  const {
    aiStatus,
    online,
    messages,
    commandError,
    state,
    sendCommand,
    startNewConversation,
    pendingDeviceAction,
    approveDeviceAction,
    cancelDeviceAction,
  } = useAstra();
  const geminiStatus = aiStatus?.gemini;
  const openaiStatus = aiStatus?.openai;
  const isGeminiSelected = Boolean(aiStatus?.selected_model?.startsWith("gemini:"));
  const isOpenAISelected = Boolean(aiStatus?.selected_model?.startsWith("openai:"));
  const isCloudSelected = isGeminiSelected || isOpenAISelected;
  const selectedCloudStatus = isOpenAISelected ? openaiStatus : geminiStatus;
  const selectedPrefix = isOpenAISelected ? "openai:" : "gemini:";
  const modelReady = Boolean(
    aiStatus?.selected_model &&
      (isCloudSelected
        ? selectedCloudStatus?.connected && selectedCloudStatus.models.includes(aiStatus.selected_model.slice(selectedPrefix.length))
        : aiStatus.connected && aiStatus.models.some((model) => model.name === aiStatus.selected_model)),
  );
  const selectedModelName = isCloudSelected
    ? aiStatus?.selected_model?.slice(selectedPrefix.length)
    : aiStatus?.selected_model;
  const selectedProviderName = isOpenAISelected ? "OPENAI" : "GEMINI";
  const busy = state === "processing" || state === "thinking" || state === "speaking";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <section className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet-300/30 bg-violet-950/30 text-violet-200">
              <Brain className="size-5" />
            </span>
            <span>
              <h1 className="font-display text-sm tracking-[0.2em] text-white">AI CORE</h1>
              <span className={`mt-1 block font-mono text-[0.65rem] ${modelReady ? "text-astra-ok" : "text-amber-300"}`}>
                {modelReady
                  ? `${isCloudSelected ? `${selectedProviderName} CLOUD MODEL` : "LOCAL MODEL"} · ${selectedModelName}`
                  : aiStatus?.connected
                    ? "OLLAMA CONNECTED · SELECT A MODEL"
                    : isCloudSelected && selectedCloudStatus?.configured
                      ? `${selectedProviderName} API UNAVAILABLE`
                    : online
                      ? "LOCAL MODEL UNAVAILABLE"
                      : "CONNECTING TO ASTRA"}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <NavLink
              to="/conversations"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs text-astra-muted hover:border-astra-cyan/40 hover:text-white"
            >
              Conversation history
            </NavLink>
            <NavLink
              to="/settings"
              className="inline-flex items-center gap-2 rounded-lg border border-astra-cyan/30 px-3 py-2 text-xs text-astra-cyan hover:bg-cyan-950/40"
            >
              <Settings2 className="size-3.5" /> Model settings
            </NavLink>
            <button
              type="button"
              onClick={startNewConversation}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-300/30 bg-violet-950/20 px-3 py-2 text-xs text-violet-100 hover:bg-violet-950/40"
            >
              <MessageSquarePlus className="size-3.5" /> New chat
            </button>
          </div>
        </div>
        {!modelReady ? (
          <p className="mt-4 rounded-lg border border-amber-300/15 bg-amber-950/10 px-3 py-2 text-xs leading-5 text-amber-100/80" role="status">
            {isCloudSelected
              ? selectedCloudStatus?.error ?? `Choose a connected ${selectedProviderName} model in Model settings.`
              : aiStatus?.error ?? "Chat responses need an installed Ollama model selected in Model settings."}
          </p>
        ) : null}
      </section>

      <section className="glass flex min-h-[26rem] flex-col rounded-2xl p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h2 className="font-display text-xs tracking-[0.18em] text-white">
              {messages.length ? "CURRENT CHAT" : "START A CONVERSATION"}
            </h2>
            <p className="mt-1 text-xs text-astra-muted">
              {messages.length
                ? isCloudSelected ? `Your conversation is sent to ${isOpenAISelected ? "OpenAI" : "Google Gemini"}.` : "Your local conversation continues here."
                : isCloudSelected ? `Ask the selected ${isOpenAISelected ? "OpenAI" : "Gemini"} model anything.` : "Ask the selected local model anything."}
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-2 py-1 font-mono text-[0.6rem] text-astra-muted">
            {state.toUpperCase()}
          </span>
        </div>
        <ConversationPanel
          messages={messages}
          isThinking={state === "processing" || state === "thinking"}
          className="min-h-[15rem] flex-1 space-y-3 overflow-y-auto pr-1"
        />
        <DeviceActionApproval
          action={pendingDeviceAction}
          onApprove={approveDeviceAction}
          onCancel={cancelDeviceAction}
        />
        <div className="mt-4 border-t border-white/10 pt-3">
          <CommandBar disabled={busy || Boolean(pendingDeviceAction)} onSubmit={sendCommand} />
        </div>
        {commandError ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-astra-danger" role="alert">
            <span>{commandError}</span>
            {commandError.includes("20 shared-key AI messages") ? (
              <NavLink to="/settings" className="text-astra-cyan underline">
                Add your own provider key
              </NavLink>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
