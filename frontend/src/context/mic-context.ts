import { createContext } from "react";

export interface MicContextValue {
  active: boolean;
  error: string | null;
  level: number;
  getAnalyser: () => AnalyserNode | null;
  start: () => Promise<void>;
  stop: () => void;
}

export const MicContext = createContext<MicContextValue | null>(null);
