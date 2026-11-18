import { ASSISTANT_STATES, type AssistantState } from "../types/index.ts";

export function isAssistantState(value: string): value is AssistantState {
  return (ASSISTANT_STATES as readonly string[]).includes(value);
}

export function stateLabel(state: AssistantState): string {
  return state.toUpperCase();
}
