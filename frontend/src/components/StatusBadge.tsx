import type { AssistantState } from "../types/index.ts";
import { stateLabel } from "../lib/assistantState.ts";

const TONE: Record<AssistantState, string> = {
  idle: "border-astra-cyan/40 text-astra-cyan",
  listening: "border-astra-blue text-astra-blue",
  processing: "border-astra-cyan text-white",
  thinking: "border-astra-blue text-white",
  speaking: "border-white/70 text-white",
  executing: "border-astra-blue text-astra-cyan",
  completed: "border-astra-ok text-astra-ok",
  error: "border-astra-danger text-astra-danger",
};

export function StatusBadge({ state }: { state: AssistantState }) {
  return (
    <div className={`rounded-full border px-3 py-1 font-mono text-xs tracking-[0.22em] ${TONE[state]}`} role="status">
      {stateLabel(state)}
    </div>
  );
}
