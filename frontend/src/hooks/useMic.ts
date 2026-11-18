import { useContext } from "react";
import { MicContext, type MicContextValue } from "../context/mic-context.ts";

export function useMic(): MicContextValue {
  const value = useContext(MicContext);
  if (!value) {
    throw new Error("useMic must be used inside MicProvider");
  }
  return value;
}
