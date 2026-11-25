import type { DeviceIntent, LocalApplication } from "../types/index.ts";

const APPLICATIONS: Record<string, { id: LocalApplication; label: string }> = {
  "visual studio code": { id: "code", label: "Visual Studio Code" },
  "vs code": { id: "code", label: "Visual Studio Code" },
  vscode: { id: "code", label: "Visual Studio Code" },
  code: { id: "code", label: "Visual Studio Code" },
  "google chrome": { id: "chrome", label: "Google Chrome" },
  chrome: { id: "chrome", label: "Google Chrome" },
  browser: { id: "chrome", label: "Google Chrome" },
  "windows settings": { id: "settings", label: "Windows Settings" },
  settings: { id: "settings", label: "Windows Settings" },
  notepad: { id: "notepad", label: "Notepad" },
  calculator: { id: "calculator", label: "Calculator" },
  calc: { id: "calculator", label: "Calculator" },
  "file explorer": { id: "explorer", label: "File Explorer" },
  explorer: { id: "explorer", label: "File Explorer" },
};

const OPEN_VERB = "(?:please\\s+)?(?:open|launch|start|kholo|khol\\s+do|chalao|chala\\s+do)";

export function parseDeviceIntent(text: string): DeviceIntent | null {
  const cleaned = text.trim().replace(/[.!?؟]+$/u, "");
  const urlMatch = cleaned.match(new RegExp(`^${OPEN_VERB}\\s+(https?:\\/\\/\\S+)$`, "i"));
  if (urlMatch?.[1]) {
    return { action: "open_url", url: urlMatch[1], label: `Open ${urlMatch[1]}` };
  }

  const appMatch = cleaned.match(new RegExp(`^${OPEN_VERB}\\s+(?:the\\s+)?(.+)$`, "i"))
    ?? cleaned.match(/^(.+?)\s+(?:kholo|khol\s+do|open\s+karo|chalao)$/i);
  const application = appMatch?.[1]?.trim().toLowerCase();
  const match = application ? APPLICATIONS[application] : undefined;
  return match
    ? { action: "launch_app", application: match.id, label: `Open ${match.label}` }
    : null;
}
