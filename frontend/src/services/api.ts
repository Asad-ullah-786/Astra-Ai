import type {
  AIStatus,
  AIStreamEvent,
  AstraTask,
  CommandResult,
  MemoryInput,
  PersonalMemory,
  ResearchResponse,
  SettingsPayload,
  TaskCreateInput,
  TaskUpdateInput,
  VoiceStatus,
  VoiceTranscription,
} from "../types/index.ts";

const TOKEN_KEY = "astra.apiToken";
const PERSONAL_PROVIDER_KEY = "astra.personalProviderKey";
const PERSONAL_PROVIDER_NAME = "astra.personalProvider";

export interface AccountSession {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  account: { id: string; email: string | null; is_guest: boolean };
}

export interface AIUsage {
  used_today: number;
  daily_limit: number | null;
  remaining: number | null;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getApiToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function setApiToken(token: string): void {
  const cleaned = token.trim();
  if (cleaned) {
    sessionStorage.setItem(TOKEN_KEY, cleaned);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export async function createGuestSession(): Promise<AccountSession> {
  const response = await fetch(`${apiBase()}/api/v1/auth/guest`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  const session = (await response.json()) as AccountSession;
  setApiToken(session.access_token);
  return session;
}

export function setPersonalProviderCredentials(provider: string, key: string): void {
  const cleaned = key.trim();
  if (!cleaned) {
    sessionStorage.removeItem(PERSONAL_PROVIDER_KEY);
    sessionStorage.removeItem(PERSONAL_PROVIDER_NAME);
    return;
  }
  sessionStorage.setItem(PERSONAL_PROVIDER_KEY, cleaned);
  sessionStorage.setItem(PERSONAL_PROVIDER_NAME, provider);
}

function personalProviderCredentials(): { key: string; provider: string } | null {
  const key = sessionStorage.getItem(PERSONAL_PROVIDER_KEY) ?? "";
  const provider = sessionStorage.getItem(PERSONAL_PROVIDER_NAME) ?? "";
  return key && provider ? { key, provider } : null;
}

export function getPersonalProviderName(): string {
  return sessionStorage.getItem(PERSONAL_PROVIDER_NAME) ?? "gemini";
}

export function hasPersonalProviderKey(): boolean {
  return Boolean(sessionStorage.getItem(PERSONAL_PROVIDER_KEY));
}

export function clearPersonalProviderCredentials(): void {
  sessionStorage.removeItem(PERSONAL_PROVIDER_KEY);
  sessionStorage.removeItem(PERSONAL_PROVIDER_NAME);
}

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
}

function authHeaders(): Headers {
  const headers = new Headers();
  const token = getApiToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            return String(item.msg);
          }
          return "Invalid request";
        })
        .join(", ");
    }
  } catch {
    return response.statusText || "Request failed";
  }
  return response.statusText || "Request failed";
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { headers: authHeaders() });
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  return (await response.json()) as T;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const headers = authHeaders();
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function sendCommand(text: string, conversationId: string | null): Promise<CommandResult> {
  return apiSend<CommandResult>("/api/v1/commands", "POST", {
    text,
    conversation_id: conversationId,
  });
}

export async function streamCommand(
  text: string,
  conversationId: string | null,
  onEvent: (event: AIStreamEvent) => void,
  responseLanguage?: string,
  providerKey?: string,
  providerName?: string,
): Promise<void> {
  const headers = authHeaders();
  headers.set("Content-Type", "application/json");
  const personalKey = providerKey ? { key: providerKey, provider: providerName ?? "" } : personalProviderCredentials();
  if (personalKey) {
    headers.set("X-Astra-Provider-Key", personalKey.key);
    headers.set("X-Astra-Provider", personalKey.provider);
  }
  const response = await fetch(`${apiBase()}/api/v1/commands/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      conversation_id: conversationId,
      response_language: responseLanguage ?? null,
    }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  if (!response.body) {
    throw new Error("The browser could not read ASTRA's response stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) {
      return;
    }
    onEvent(JSON.parse(data) as AIStreamEvent);
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    blocks.forEach(dispatch);
    if (done) {
      if (buffer.trim()) {
        dispatch(buffer);
      }
      break;
    }
  }
}

export function getAIUsage(): Promise<AIUsage> {
  return apiGet<AIUsage>("/api/v1/account/usage");
}

export function deleteConversation(conversationId: string): Promise<void> {
  return apiSend<void>(`/api/v1/conversations/${conversationId}`, "DELETE");
}

export function saveSettings(userDisplayName: string): Promise<SettingsPayload> {
  return apiSend<SettingsPayload>("/api/v1/settings", "PUT", {
    user_display_name: userDisplayName,
  });
}

export function getAIStatus(): Promise<AIStatus> {
  return apiGet<AIStatus>("/api/v1/ai/status");
}

export function saveAIModel(model: string): Promise<AIStatus> {
  return apiSend<AIStatus>("/api/v1/ai/model", "PUT", { model });
}

export function clearAIModel(): Promise<AIStatus> {
  return apiSend<AIStatus>("/api/v1/ai/model", "DELETE");
}

export function getTasks(): Promise<AstraTask[]> {
  return apiGet<AstraTask[]>("/api/v1/tasks");
}

export function createTask(task: TaskCreateInput): Promise<AstraTask> {
  return apiSend<AstraTask>("/api/v1/tasks", "POST", task);
}

export function updateTask(taskId: string, updates: TaskUpdateInput): Promise<AstraTask> {
  return apiSend<AstraTask>(`/api/v1/tasks/${taskId}`, "PATCH", updates);
}

export function deleteTask(taskId: string): Promise<void> {
  return apiSend<void>(`/api/v1/tasks/${taskId}`, "DELETE");
}

export function getMemories(): Promise<PersonalMemory[]> {
  return apiGet<PersonalMemory[]>("/api/v1/memory");
}

export function createMemory(memory: MemoryInput): Promise<PersonalMemory> {
  return apiSend<PersonalMemory>("/api/v1/memory", "POST", memory);
}

export function updateMemory(memoryId: string, memory: Partial<MemoryInput>): Promise<PersonalMemory> {
  return apiSend<PersonalMemory>(`/api/v1/memory/${memoryId}`, "PATCH", memory);
}

export function deleteMemory(memoryId: string): Promise<void> {
  return apiSend<void>(`/api/v1/memory/${memoryId}`, "DELETE");
}

export function launchApplication(application: "code" | "chrome" | "settings"): Promise<{ application: string; message: string }> {
  return apiSend("/api/v1/automation/launch", "POST", { application });
}

export function searchResearch(query: string): Promise<ResearchResponse> {
  return apiSend<ResearchResponse>("/api/v1/research/search", "POST", { query });
}

export function getVoiceStatus(): Promise<VoiceStatus> {
  return apiGet<VoiceStatus>("/api/v1/voice/status");
}

export function downloadVoiceModel(): Promise<VoiceStatus> {
  return apiSend<VoiceStatus>("/api/v1/voice/model", "POST");
}

export async function transcribeAudio(audio: Blob, language: "auto" | "en" | "ur"): Promise<VoiceTranscription> {
  const form = new FormData();
  form.append("audio", audio, "speech.webm");
  form.append("language", language);
  const response = await fetch(`${apiBase()}/api/v1/voice/transcribe`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  return (await response.json()) as VoiceTranscription;
}

export function sessionSocketUrl(): string {
  const explicit = import.meta.env.VITE_WS_BASE as string | undefined;
  const token = getApiToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  if (explicit) {
    return `${explicit.replace(/\/$/, "")}/ws/session${query}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws/session${query}`;
}
