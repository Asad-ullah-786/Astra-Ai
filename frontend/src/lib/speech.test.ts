import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpeechQueue, speakReply } from "./speech.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubSpeech(voices: Array<{ lang: string }> = []) {
  const speechSynthesis = {
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
  };
  const utterances: Array<{ text: string; lang: string; voice?: { lang: string } }> = [];
  class MockUtterance {
    lang = "";
    voice?: { lang: string };

    constructor(readonly text: string) {
      utterances.push(this);
    }
  }

  vi.stubGlobal("window", {
    speechSynthesis,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
  vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
  return { speechSynthesis, utterances };
}

describe("speech output", () => {
  it("uses a matching Urdu browser voice", () => {
    const voice = { lang: "ur-PK" };
    const { speechSynthesis, utterances } = stubSpeech([voice]);

    expect(speakReply("السلام علیکم", "ur")).toBe(true);
    expect(speechSynthesis.cancel).toHaveBeenCalledOnce();
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    expect(utterances[0]).toMatchObject({ text: "السلام علیکم", lang: "ur-PK", voice });
  });

  it("speaks completed sentences while the response is still streaming", () => {
    const { speechSynthesis, utterances } = stubSpeech();
    const queue = createSpeechQueue("hi");
    if (!queue) throw new Error("Speech synthesis should be available in the test.");

    queue.append("नमस्ते। आप ");
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    expect(utterances[0]).toMatchObject({ text: "नमस्ते।", lang: "hi-IN" });

    queue.append("कैसे हैं");
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    queue.finish();

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(2);
    expect(utterances[1]).toMatchObject({ text: "आप कैसे हैं", lang: "hi-IN" });
  });

  it("starts speaking a longer partial reply before the sentence finishes", () => {
    vi.useFakeTimers();
    const { speechSynthesis, utterances } = stubSpeech();
    const queue = createSpeechQueue("en");
    if (!queue) throw new Error("Speech synthesis should be available in the test.");

    queue.append("Sure, I can help you with that question right now");
    expect(speechSynthesis.speak).not.toHaveBeenCalled();

    vi.advanceTimersByTime(450);

    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    expect(utterances[0].text).toBe("Sure, I can help you with that question right");

    queue.append(".");
    queue.finish();

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(2);
    expect(utterances[1].text).toBe("now.");
  });

  it("reports when speech playback is unavailable", () => {
    vi.stubGlobal("window", {});

    expect(speakReply("Hello")).toBe(false);
  });
});
