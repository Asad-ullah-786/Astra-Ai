import { useState } from "react";
import { NavLink } from "react-router";
import { hasLocalDeviceSession } from "../services/device.ts";
import type { DeviceIntent } from "../types/index.ts";

export function DeviceActionApproval({
  action,
  onApprove,
  onCancel,
}: {
  action: DeviceIntent | null;
  onApprove: () => Promise<void>;
  onCancel: () => void;
}) {
  const [approving, setApproving] = useState(false);
  if (!action) return null;
  const paired = hasLocalDeviceSession();

  async function approve() {
    setApproving(true);
    try {
      await onApprove();
    } finally {
      setApproving(false);
    }
  }

  return (
    <section className="mt-3 rounded-xl border border-amber-300/30 bg-amber-950/20 p-4" aria-label="Device action approval">
      <p className="font-display text-xs tracking-[0.14em] text-amber-200">DEVICE ACTION NEEDS YOUR APPROVAL</p>
      <p className="mt-2 text-sm text-white">{action.label}</p>
      <p className="mt-1 text-xs leading-5 text-astra-muted">
        {paired
          ? "Continue only if this is what you asked ASTRA to do. Your Windows companion will show a second, on-device confirmation before taking action."
          : "Pair your Windows companion first. After pairing, ASTRA will show this action again before you can approve it."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={approving || !paired}
          onClick={() => void approve()}
          className="rounded-lg border border-amber-200/40 px-3 py-2 text-xs text-amber-100 disabled:opacity-50"
        >
          {approving ? "WAITING FOR WINDOWS APPROVAL..." : paired ? "CONTINUE TO WINDOWS APPROVAL" : "PAIR DEVICE FIRST"}
        </button>
        <button
          type="button"
          disabled={approving}
          onClick={onCancel}
          className="rounded-lg border border-white/15 px-3 py-2 text-xs text-astra-muted disabled:opacity-50"
        >
          CANCEL
        </button>
        <NavLink to="/automation" className="rounded-lg px-3 py-2 text-xs text-astra-cyan underline">
          Pair local device
        </NavLink>
      </div>
    </section>
  );
}
