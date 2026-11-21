import type { AIStatus } from "../types/index.ts";

const LLM_STATUS_CATALOG = [
  { id: "mistral", name: "Mistral", kind: "model", matches: (name: string) => /mistral/i.test(name) },
  { id: "llama", name: "Llama", kind: "model", matches: (name: string) => /llama/i.test(name) },
  { id: "openai", name: "OpenAI", kind: "provider" },
  { id: "gemini", name: "Gemini", kind: "provider" },
  { id: "qwen", name: "Qwen", kind: "model", matches: (name: string) => /qwen/i.test(name) },
  { id: "deepseek", name: "DeepSeek-R1", kind: "model", matches: (name: string) => /deepseek/i.test(name) },
  { id: "phi", name: "Phi-3", kind: "model", matches: (name: string) => /phi-?3/i.test(name) },
  { id: "cursor", name: "Cursor", kind: "client" },
  { id: "copilot", name: "VS Code", kind: "client" },
  { id: "browser_agent", name: "Browser Agent", kind: "client" },
] as const;

const LOCAL_MODEL_OVERVIEW_CATALOG = [
  { id: "ollama", name: "Ollama", matches: null },
  { id: "mistral", name: "Mistral", matches: /mistral/i },
  { id: "llama", name: "Llama", matches: /llama/i },
  { id: "qwen", name: "Qwen", matches: /qwen/i },
  { id: "deepseek", name: "DeepSeek-R1", matches: /deepseek/i },
  { id: "phi", name: "Phi-3", matches: /phi-?3/i },
  { id: "gemma", name: "Gemma", matches: /gemma/i },
] as const;

const LOCAL_MODEL_DOWNLOAD_PLAN = [
  { id: "gemma", name: "Gemma 270M", model: "gemma3:270m-it-qat", size: "241 MB", matches: /gemma3:270m-it-qat/i },
  { id: "deepseek", name: "DeepSeek-R1 1.5B", model: "deepseek-r1:1.5b", size: "1.1 GB", matches: /deepseek-r1:1\.5b/i },
  { id: "phi", name: "Phi-3 Mini Q2", model: "phi3:3.8b-mini-128k-instruct-q2_K", size: "1.4 GB", matches: /phi3:3\.8b-mini-128k-instruct-q2_k/i },
  { id: "mistral", name: "Mistral 7B Q2", model: "mistral:7b-instruct-q2_K", size: "3.1 GB", matches: /mistral:7b-instruct-q2_k/i },
] as const;

export type LLMStatusId = (typeof LLM_STATUS_CATALOG)[number]["id"];
export type LLMConnectionState = "connected" | "available" | "setup" | "unavailable" | "checking";

export interface LLMStatusCard {
  id: LLMStatusId;
  name: string;
  status: string;
  state: LLMConnectionState;
}

export type LocalModelOverviewId = (typeof LOCAL_MODEL_OVERVIEW_CATALOG)[number]["id"];

export interface LocalModelOverviewCard {
  id: LocalModelOverviewId;
  name: string;
  status: string;
  state: LLMConnectionState;
  selected: boolean;
  modelName: string | null;
}

export interface LocalModelDownloadCard {
  id: (typeof LOCAL_MODEL_DOWNLOAD_PLAN)[number]["id"];
  name: string;
  model: string;
  size: string;
  status: string;
  state: LLMConnectionState;
}

const FREE_GEMINI_MODEL_PREFIXES = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-4-hydrogen",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemma-4",
] as const;

export function getCloudModelPricingLabel(provider: "gemini" | "openai", model: string): string {
  if (provider === "openai") return "Paid";
  const normalized = model.toLowerCase();
  return FREE_GEMINI_MODEL_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`))
    ? "Free tier"
    : "Paid";
}

export function getLocalModelDownloadQueue(aiStatus: AIStatus | null): LocalModelDownloadCard[] {
  if (aiStatus === null) {
    return LOCAL_MODEL_DOWNLOAD_PLAN.map((entry) => ({ ...entry, status: "Checking Ollama…", state: "checking" }));
  }
  if (!aiStatus.connected) {
    return LOCAL_MODEL_DOWNLOAD_PLAN.map((entry) => ({ ...entry, status: "Ollama offline", state: "unavailable" }));
  }

  const nextDownloadIndex = LOCAL_MODEL_DOWNLOAD_PLAN.findIndex(
    (entry) => !aiStatus.models.some((model) => entry.matches.test(model.name)),
  );
  return LOCAL_MODEL_DOWNLOAD_PLAN.map((entry, index) => {
    const installedModel = aiStatus.models.find((model) => entry.matches.test(model.name));
    if (installedModel) {
      return { ...entry, status: "Installed", state: "available" };
    }
    if (index === nextDownloadIndex) {
      return { ...entry, status: `Downloading · ${entry.size}`, state: "connected" };
    }
    return { ...entry, status: `Queued · ${entry.size}`, state: "checking" };
  });
}

function fallbackProviderCard(entry: { id: LLMStatusId; name: string; kind: string }): LLMStatusCard {
  return {
    id: entry.id,
    name: entry.name,
    status: entry.kind === "provider" ? "Setup required" : "Not connected",
    state: "setup",
  };
}

export function getLocalModelOverviewCards(aiStatus: AIStatus | null): LocalModelOverviewCard[] {
  const downloadQueue = getLocalModelDownloadQueue(aiStatus);
  return LOCAL_MODEL_OVERVIEW_CATALOG.map((entry) => {
    if (aiStatus === null) {
      return { id: entry.id, name: entry.name, status: "Checking…", state: "checking", selected: false, modelName: null };
    }

    if (entry.id === "ollama") {
      return {
        id: entry.id,
        name: entry.name,
        status: aiStatus.connected ? "Active" : "Offline",
        state: aiStatus.connected ? "connected" : "unavailable",
        selected: false,
        modelName: null,
      };
    }

    if (!aiStatus.connected) {
      return { id: entry.id, name: entry.name, status: "Ollama offline", state: "unavailable", selected: false, modelName: null };
    }

    const installedModel = aiStatus.models.find((model) => entry.matches.test(model.name));
    if (installedModel === undefined) {
      const activeDownload = downloadQueue.find((download) => download.id === entry.id);
      if (activeDownload?.state === "connected") {
        return { id: entry.id, name: entry.name, status: activeDownload.status, state: "checking", selected: false, modelName: activeDownload.model };
      }
      return { id: entry.id, name: entry.name, status: "Available soon", state: "unavailable", selected: false, modelName: null };
    }

    const selected = installedModel.name === aiStatus.selected_model;
    return {
      id: entry.id,
      name: entry.name,
      status: installedModel.parameter_size ? `${installedModel.parameter_size} Model` : "Installed",
      state: selected ? "connected" : "available",
      selected,
      modelName: installedModel.name,
    };
  });
}

export function getLLMStatusCards(
  aiStatus: AIStatus | null,
  localClientAvailability?: Record<string, boolean> | null,
): LLMStatusCard[] {
  const gemini = aiStatus?.gemini;
  const openai = aiStatus?.openai;
  return LLM_STATUS_CATALOG.map((entry) => {
    if (entry.kind === "model") {
      if (aiStatus === null) {
        return { id: entry.id, name: entry.name, status: "Checking Ollama…", state: "checking" };
      }
      if (!aiStatus.connected) {
        return { id: entry.id, name: entry.name, status: "Ollama offline", state: "unavailable" };
      }

      const installedModel = aiStatus.models.find((model) => entry.matches(model.name));
      if (installedModel === undefined) {
        return { id: entry.id, name: entry.name, status: "Available soon", state: "unavailable" };
      }
      return installedModel.name === aiStatus.selected_model
        ? { id: entry.id, name: entry.name, status: "Selected · local", state: "connected" }
        : { id: entry.id, name: entry.name, status: "Installed · local", state: "connected" };
    }

    if (entry.kind === "client") {
      if (aiStatus === null) {
        return { id: entry.id, name: entry.name, status: "Checking installation…", state: "checking" };
      }
      if (entry.id === "browser_agent") {
        if (localClientAvailability === null) {
          return { id: entry.id, name: entry.name, status: "Needs connection", state: "setup" };
        }
        const available = localAvailabilityValue(localClientAvailability, aiStatus, entry.id);
        return available
          ? {
              id: entry.id,
              name: entry.name,
              status: localClientAvailability === undefined ? "Ready · local PC" : "Ready · paired PC",
              state: "connected",
            }
          : { id: entry.id, name: entry.name, status: "Chrome unavailable", state: "unavailable" };
      }
      const clientId = entry.id.replace("-", "_");
      if (localClientAvailability === null) {
        return { id: entry.id, name: entry.name, status: "Needs connection", state: "setup" };
      }
      if (localClientAvailability !== undefined) {
        return localClientAvailability[clientId]
          ? { id: entry.id, name: entry.name, status: "Ready to open · paired PC", state: "available" }
          : { id: entry.id, name: entry.name, status: "Needs installation", state: "setup" };
      }
      return aiStatus.clients[clientId]
        ? { id: entry.id, name: entry.name, status: "Needs connection", state: "setup" }
        : { id: entry.id, name: entry.name, status: "Needs installation", state: "setup" };
    }

    if (entry.id === "gemini" || entry.id === "openai") {
      const provider = entry.id === "gemini" ? gemini : openai;
      if (aiStatus === null) {
        return { id: entry.id, name: entry.name, status: "Checking connection…", state: "checking" };
      }
      if (aiStatus.selected_model?.startsWith(`${entry.id}:`)) {
        const selectedModel = aiStatus.selected_model.slice(entry.id.length + 1);
        return provider?.connected && provider.models.includes(selectedModel)
          ? { id: entry.id, name: entry.name, status: "Selected · cloud API", state: "connected" }
          : { id: entry.id, name: entry.name, status: "Selected model unavailable", state: "unavailable" };
      }
      if (provider?.connected) {
        if (provider.models.length === 0) {
          return { id: entry.id, name: entry.name, status: "No compatible chat models", state: "unavailable" };
        }
        return { id: entry.id, name: entry.name, status: "Connected · models listed", state: "available" };
      }
      return provider?.configured
        ? { id: entry.id, name: entry.name, status: "Connection failed", state: "unavailable" }
        : { id: entry.id, name: entry.name, status: "Setup required", state: "setup" };
    }

    return fallbackProviderCard(entry);
  });
}

function localAvailabilityValue(
  localClientAvailability: Record<string, boolean> | null | undefined,
  aiStatus: AIStatus,
  clientId: string,
): boolean {
  if (localClientAvailability) {
    return Boolean(localClientAvailability.browser_agent && localClientAvailability.chrome);
  }
  if (localClientAvailability === null) return false;
  return Boolean(aiStatus.clients[clientId]);
}
