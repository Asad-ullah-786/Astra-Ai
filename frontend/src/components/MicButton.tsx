import { Mic, MicOff } from "lucide-react";
import { useMic } from "../hooks/useMic.ts";

export function MicButton() {
  const { active, error, level, start, stop } = useMic();

  return (
    <div className="mic-control flex min-w-0 items-center gap-2">
      <button
        type="button"
        aria-pressed={active}
        onClick={() => {
          if (active) {
            stop();
            return;
          }
          void start();
        }}
        className={`mic-control-button inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-display text-[0.713rem] tracking-[0.16em] ${
          active
            ? "border-astra-danger bg-astra-danger/15 text-white"
            : "border-astra-cyan/40 text-astra-cyan"
        }`}
      >
        {active ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
        {active ? "MIC LIVE" : "MIC OFF"}
      </button>
      <span className="mic-control-hint hidden font-mono text-xs text-astra-muted sm:inline" role="status">
        {active ? `Level ${Math.round(level * 100)}%` : "Microphone is off"}
      </span>
      {error ? <span className="max-w-48 truncate text-xs text-astra-danger">{error}</span> : null}
    </div>
  );
}
