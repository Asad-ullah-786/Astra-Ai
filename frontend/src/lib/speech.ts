export interface SpeechQueue {
  append: (text: string) => void;
  finish: () => void;
  cancel: () => void;
}

const PARTIAL_SPEECH_DELAY_MS = 450;
const PARTIAL_SPEECH_MIN_CHARS = 32;
const PARTIAL_SPEECH_MAX_CHARS = 72;

function speechLanguageTag(detectedLanguage: string): string {
  const language = detectedLanguage.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z]{2,8})?$/.test(language)) return "en-US";
  if (language === "ur") return "ur-PK";
  if (language === "en") return "en-US";
  if (language === "hi") return "hi-IN";
  return language;
}

export function createSpeechQueue(detectedLanguage = "en"): SpeechQueue | null {
  if (!("speechSynthesis" in window)) return null;

  const synthesis = window.speechSynthesis;
  const language = speechLanguageTag(detectedLanguage);
  const languageCode = language.split("-")[0];
  synthesis.cancel();

  let pending = "";
  let finished = false;
  let partialSpeechTimer: number | null = null;

  function speak(text: string) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    const voice = synthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith(`${languageCode}-`) || item.lang.toLowerCase() === languageCode);
    if (voice) utterance.voice = voice;
    synthesis.speak(utterance);
  }

  function clearPartialSpeechTimer() {
    if (partialSpeechTimer !== null) {
      window.clearTimeout(partialSpeechTimer);
      partialSpeechTimer = null;
    }
  }

  function drain(force: boolean) {
    while (pending) {
      const boundary = /[.!?؟۔！？।](?:\s|$)/u.exec(pending);
      let end = boundary ? boundary.index + boundary[0].trimEnd().length : -1;

      if (end < 0 && pending.length >= 180) {
        end = pending.lastIndexOf(" ", 180);
      }
      if (end < 0 && force) end = pending.length;
      if (end <= 0) return;

      const sentence = pending.slice(0, end).trim();
      pending = pending.slice(end).trimStart();
      if (sentence) speak(sentence);
    }
    if (!pending) clearPartialSpeechTimer();
  }

  function schedulePartialSpeech() {
    if (partialSpeechTimer !== null || !pending || finished) return;
    partialSpeechTimer = window.setTimeout(() => {
      partialSpeechTimer = null;
      const splitAt = pending.lastIndexOf(" ", PARTIAL_SPEECH_MAX_CHARS);
      const end =
        splitAt >= PARTIAL_SPEECH_MIN_CHARS
          ? splitAt
          : pending.length >= PARTIAL_SPEECH_MAX_CHARS
            ? PARTIAL_SPEECH_MAX_CHARS
            : -1;
      if (end > 0) {
        const phrase = pending.slice(0, end).trim();
        pending = pending.slice(end).trimStart();
        if (phrase) speak(phrase);
        drain(false);
      }
      if (pending) schedulePartialSpeech();
    }, PARTIAL_SPEECH_DELAY_MS);
  }

  return {
    append(text) {
      if (finished || !text) return;
      pending += text;
      drain(false);
      schedulePartialSpeech();
    },
    finish() {
      if (finished) return;
      finished = true;
      clearPartialSpeechTimer();
      drain(true);
    },
    cancel() {
      finished = true;
      clearPartialSpeechTimer();
      pending = "";
      synthesis.cancel();
    },
  };
}

export function speakReply(text: string, detectedLanguage = "en"): boolean {
  const queue = createSpeechQueue(detectedLanguage);
  if (!queue) return false;
  queue.append(text);
  queue.finish();
  return true;
}
