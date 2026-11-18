import { describe, expect, it, vi } from "vitest";
import { createSpeechPauseDetector } from "./voiceSilence.ts";

describe("createSpeechPauseDetector", () => {
  it("stops only after speech has been followed by 850 ms of silence", () => {
    let time = 0;
    const onPause = vi.fn();
    const detect = createSpeechPauseDetector(onPause, () => time);
    const silence = new Uint8Array(32).fill(128);
    const speech = new Uint8Array(32).fill(138);

    time = 2_000;
    expect(detect(silence)).toBe(false);
    expect(onPause).not.toHaveBeenCalled();

    expect(detect(speech)).toBe(false);
    time = 2_100;
    expect(detect(silence)).toBe(false);
    time = 2_949;
    expect(detect(silence)).toBe(false);
    time = 2_950;
    expect(detect(silence)).toBe(true);
    expect(detect(silence)).toBe(true);
    expect(onPause).toHaveBeenCalledOnce();
  });

  it("resets the silence timer when the user speaks again", () => {
    let time = 0;
    const onPause = vi.fn();
    const detect = createSpeechPauseDetector(onPause, () => time);
    const silence = new Uint8Array(32).fill(128);
    const speech = new Uint8Array(32).fill(138);

    detect(speech);
    time = 500;
    detect(silence);
    time = 1_000;
    detect(speech);
    time = 2_000;
    expect(detect(silence)).toBe(false);
    time = 2_850;
    expect(detect(silence)).toBe(true);
    expect(onPause).toHaveBeenCalledOnce();
  });
});
