import { describe, expect, it } from "vitest";
import { formatGigabytes, formatPercent, formatUptime } from "./format.ts";

describe("formatters", () => {
  it("formats uptime without a negative clock", () => {
    expect(formatUptime(45)).toBe("45s");
    expect(formatUptime(125)).toBe("2m 5s");
    expect(formatUptime(3700)).toBe("1h 1m");
    expect(formatUptime(-4)).toBe("0s");
  });

  it("formats memory and missing percentages", () => {
    expect(formatGigabytes(15.26)).toBe("15.3 GB");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(42.2)).toBe("42%");
  });
});
