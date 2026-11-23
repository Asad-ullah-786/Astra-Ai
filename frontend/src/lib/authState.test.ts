import { describe, expect, it } from "vitest";
import { isAuthenticationRequired } from "./authState.ts";

describe("authentication state", () => {
  it("keeps the guest sign-in option visible when the session token is missing", () => {
    expect(isAuthenticationRequired(true, false, null, null)).toBe(true);
  });

  it("treats a rejected session token as signed out", () => {
    expect(isAuthenticationRequired(true, true, "Guest access is required.", null)).toBe(true);
  });

  it("keeps the guest sign-in option visible when the activity feed rejects a stale token", () => {
    expect(isAuthenticationRequired(true, true, null, "Guest access is required.")).toBe(true);
  });

  it("does not show cloud sign-in controls for an authenticated session or local backend", () => {
    expect(isAuthenticationRequired(true, true, null, null)).toBe(false);
    expect(isAuthenticationRequired(false, false, null, "Guest access is required.")).toBe(false);
  });
});
