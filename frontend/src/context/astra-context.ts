import { createContext } from "react";
import type { AstraContextValue } from "../types/index.ts";

export const AstraContext = createContext<AstraContextValue | null>(null);
