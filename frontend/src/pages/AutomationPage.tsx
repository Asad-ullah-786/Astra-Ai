import { useState } from "react";
import { Camera, Chrome, Code2, Settings2 } from "lucide-react";
import { Panel } from "../components/Panel.tsx";
import { launchApplication } from "../services/api.ts";
import { captureScreenFrame, downloadBlob } from "../services/screenshot.ts";

const APPLICATIONS = [
  { id: "code", label: "Open Visual Studio Code", icon: Code2 },
  { id: "chrome", label: "Open Google Chrome", icon: Chrome },
  { id: "settings", label: "Open Windows Settings", icon: Settings2 },
] as const;

export function AutomationPage() {
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function launch(application: (typeof APPLICATIONS)[number]["id"]) {
    setWorking(application);
    setMessage("");
    setError("");
    try {
      const result = await launchApplication(application);
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The application could not be opened.");
    } finally {
      setWorking("");
    }
  }

  async function screenshot() {
    setWorking("screenshot");
    setMessage("");
    setError("");
    try {
      const image = await captureScreenFrame();
      downloadBlob(image, `astra-screenshot-${new Date().toISOString().replaceAll(":", "-")}.png`);
      setMessage("Screenshot saved to your Downloads folder.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Screen capture was cancelled or failed.");
    } finally {
      setWorking("");
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Panel title="SAFE WINDOWS QUICK COMMANDS">
        <p className="mb-3 text-sm text-astra-muted">
          Each action runs only after you press its button. ASTRA launches a short allowlist of apps; it does not accept or run arbitrary shell commands.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {APPLICATIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              disabled={Boolean(working)}
              onClick={() => void launch(id)}
              className="flex items-center gap-3 rounded-xl border border-astra-cyan/20 bg-black/20 p-3 text-left text-sm text-white hover:border-astra-cyan/50 disabled:opacity-50"
            >
              <Icon className="size-5 text-astra-cyan" />
              {working === id ? "OPENING..." : label}
            </button>
          ))}
          <button
            type="button"
            disabled={Boolean(working)}
            onClick={() => void screenshot()}
            className="flex items-center gap-3 rounded-xl border border-astra-cyan/20 bg-black/20 p-3 text-left text-sm text-white hover:border-astra-cyan/50 disabled:opacity-50"
          >
            <Camera className="size-5 text-astra-cyan" />
            {working === "screenshot" ? "CAPTURING..." : "Take Screenshot"}
          </button>
        </div>
        <p className="mt-3 text-xs text-astra-muted">
          Screenshot capture uses the browser's screen-share picker; choose what to capture, and ASTRA saves one frame locally.
        </p>
        {message ? <p className="mt-3 text-sm text-astra-ok" role="status">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-astra-danger" role="alert">{error}</p> : null}
      </Panel>
    </div>
  );
}
