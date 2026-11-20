export interface SpeechAlternative {
  transcript: string;
}

export interface SpeechResult extends ArrayLike<SpeechAlternative> {
  isFinal: boolean;
}

export interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}

export interface SpeechErrorEvent {
  error: string;
}

export interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export function getBrowserSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const browser = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

export function recognitionLanguage(
  selection: "auto" | "en" | "ur",
  browserLanguage: string,
): string {
  if (selection === "ur") return "ur-PK";
  if (selection === "en") return "en-US";
  return browserLanguage || "en-US";
}

export function responseLanguageCode(
  selection: "auto" | "en" | "ur",
  recognizedLanguage: string,
): string {
  if (selection !== "auto") return selection;
  const primary = recognizedLanguage.split("-")[0]?.toLowerCase();
  return primary === "ur" ? "ur" : "en";
}
