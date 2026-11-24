import { afterEach, describe, expect, it, vi } from "vitest";
import { notifySuccess, onSuccessNotification } from "./notifications.ts";

describe("success notifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("announces successful actions to the app shell and stops after unsubscribe", () => {
    vi.stubGlobal("window", new EventTarget());
    const listener = vi.fn();
    const unsubscribe = onSuccessNotification(listener);

    notifySuccess("Name saved successfully.");
    expect(listener).toHaveBeenCalledWith("Name saved successfully.");

    unsubscribe();
    notifySuccess("Model selected successfully.");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
