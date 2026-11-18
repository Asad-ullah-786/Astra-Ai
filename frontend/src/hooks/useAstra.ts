import { useContext } from "react";
import { AstraContext } from "../context/astra-context.ts";
import type { AstraContextValue } from "../types/index.ts";

export function useAstra(): AstraContextValue {
  const value = useContext(AstraContext);
  if (!value) {
    throw new Error("useAstra must be used inside AstraProvider");
  }
  return value;
}
