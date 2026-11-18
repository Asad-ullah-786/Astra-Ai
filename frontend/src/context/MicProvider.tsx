import { useMemo, type ReactNode } from "react";
import { useMicrophoneMonitor } from "../hooks/useMicrophoneMonitor.ts";
import { MicContext } from "./mic-context.ts";

export function MicProvider({ children }: { children: ReactNode }) {
  const mic = useMicrophoneMonitor();
  const value = useMemo(
    () => ({
      active: mic.active,
      error: mic.error,
      level: mic.level,
      getAnalyser: mic.getAnalyser,
      start: mic.start,
      stop: mic.stop,
    }),
    [mic.active, mic.error, mic.level, mic.getAnalyser, mic.start, mic.stop],
  );

  return <MicContext.Provider value={value}>{children}</MicContext.Provider>;
}
