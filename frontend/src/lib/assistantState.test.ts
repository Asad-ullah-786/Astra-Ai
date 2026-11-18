import { describe, expect, it } from "vitest";
import { isAssistantState, stateLabel } from "./assistantState.ts";

describe("assistant states", () => {
  it("recognizes the eight interface states", () => {
    expect(isAssistantState("listening")).toBe(true);
    expect(isAssistantState("executing")).toBe(true);
    expect(isAssistantState("asleep")).toBe(false);
  });

  it("labels the current state for the status rail", () => {
    expect(stateLabel("processing")).toBe("PROCESSING");
  });
});
