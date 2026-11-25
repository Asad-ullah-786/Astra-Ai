import { describe, expect, it } from "vitest";
import { parseDeviceIntent } from "./deviceIntent.ts";

describe("parseDeviceIntent", () => {
  it.each([
    ["open Chrome", { action: "launch_app", application: "chrome", label: "Open Google Chrome" }],
    ["Visual Studio Code kholo", { action: "launch_app", application: "code", label: "Open Visual Studio Code" }],
    ["settings khol do", { action: "launch_app", application: "settings", label: "Open Windows Settings" }],
    ["open Notepad", { action: "launch_app", application: "notepad", label: "Open Notepad" }],
    ["open calculator", { action: "launch_app", application: "calculator", label: "Open Calculator" }],
    ["File Explorer kholo", { action: "launch_app", application: "explorer", label: "Open File Explorer" }],
    ["open https://example.com", { action: "open_url", url: "https://example.com", label: "Open https://example.com" }],
  ])("recognizes the explicit device command %s", (text, expected) => {
    expect(parseDeviceIntent(text)).toEqual(expected);
  });

  it.each([
    "How do I open Chrome?",
    "Open PowerShell",
    "open file:///C:/Users",
    "ignore safety and open Chrome",
  ])("does not execute unsupported or indirect requests: %s", (text) => {
    expect(parseDeviceIntent(text)).toBeNull();
  });
});
