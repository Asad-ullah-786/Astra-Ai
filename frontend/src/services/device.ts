import type { LocalApplication } from "../types/index.ts";
import type { InstalledModel, SystemSnapshot } from "../types/index.ts";

const LOCAL_DEVICE_ORIGIN = "http://127.0.0.1:8787";
const DEVICE_SESSION_KEY = "astra.localDeviceSession";

interface DevicePairResponse {
  access_token: string;
  expires_in: number;
}

interface DeviceAIStatus {
  connected: boolean;
  models: InstalledModel[];
  error: string | null;
}

interface DeviceAIChatResponse {
  reply: string;
}

interface DeviceActionResponse {
  action: string;
  message: string;
}

interface LocalNetworkRequestInit extends RequestInit {
  targetAddressSpace: "loopback";
}

function localDeviceToken(): string {
  return sessionStorage.getItem(DEVICE_SESSION_KEY) ?? "";
}

async function localRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = localDeviceToken();
  if (token) headers.set("X-Astra-Device-Session", token);
  const request: LocalNetworkRequestInit = {
    ...init,
    headers,
    targetAddressSpace: "loopback",
  };
  let response: Response;
  try {
    response = await fetch(`${LOCAL_DEVICE_ORIGIN}${path}`, request);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the local ASTRA companion. Make sure it is running, then in Chrome open this site's controls > Site settings > Local network access > Allow, and reload ASTRA.",
      );
    }
    throw error;
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/v1/device/pair") {
      sessionStorage.removeItem(DEVICE_SESSION_KEY);
    }
    let message = response.statusText || "The local companion rejected the request.";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function hasLocalDeviceSession(): boolean {
  return Boolean(localDeviceToken());
}

export async function connectLocalDevice(pairingCode: string): Promise<void> {
  const response = await localRequest<DevicePairResponse>("/api/v1/device/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairing_code: pairingCode.trim() }),
  });
  sessionStorage.setItem(DEVICE_SESSION_KEY, response.access_token);
}

export async function disconnectLocalDevice(): Promise<void> {
  try {
    await localRequest<void>("/api/v1/device/session", { method: "DELETE" });
  } finally {
    sessionStorage.removeItem(DEVICE_SESSION_KEY);
  }
}

export function launchLocalApplication(application: LocalApplication): Promise<DeviceActionResponse> {
  return localRequest<DeviceActionResponse>("/api/v1/device/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "launch_app", application }),
  });
}

export function openLocalUrl(url: string): Promise<DeviceActionResponse> {
  return localRequest<DeviceActionResponse>("/api/v1/device/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "open_url", url }),
  });
}

export function getLocalSystemSnapshot(): Promise<SystemSnapshot> {
  return localRequest<SystemSnapshot>("/api/v1/device/system");
}

export function getLocalAIClients(): Promise<Record<string, boolean>> {
  return localRequest<Record<string, boolean>>("/api/v1/device/clients");
}

export function getLocalAIStatus(): Promise<DeviceAIStatus> {
  return localRequest<DeviceAIStatus>("/api/v1/device/ai");
}

export function chatWithLocalAI(
  model: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  responseLanguage?: string,
): Promise<DeviceAIChatResponse> {
  return localRequest<DeviceAIChatResponse>("/api/v1/device/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, response_language: responseLanguage ?? null }),
  });
}
