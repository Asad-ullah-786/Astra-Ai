import { describe, expect, it } from "vitest";
import { recognitionLanguage, responseLanguageCode } from "./browserSpeech.ts";

describe("browser speech language selection", () => {
  it("uses explicit English and Urdu locales", () => {
    expect(recognitionLanguage("en", "ur-PK")).toBe("en-US");
    expect(recognitionLanguage("ur", "en-US")).toBe("ur-PK");
    expect(responseLanguageCode("en", "en-US")).toBe("en");
    expect(responseLanguageCode("ur", "ur-PK")).toBe("ur");
  });

  it("uses the browser language for automatic recognition", () => {
    expect(recognitionLanguage("auto", "ur-PK")).toBe("ur-PK");
    expect(responseLanguageCode("auto", "ur-PK")).toBe("ur");
    expect(responseLanguageCode("auto", "en-US")).toBe("en");
  });

  it("preserves other recognized languages and falls back for invalid locales", () => {
    expect(responseLanguageCode("auto", "fr-FR")).toBe("fr");
    expect(responseLanguageCode("auto", "ar-SA")).toBe("ar");
    expect(responseLanguageCode("auto", "und")).toBe("en");
    expect(responseLanguageCode("auto", "")).toBe("en");
  });
});
