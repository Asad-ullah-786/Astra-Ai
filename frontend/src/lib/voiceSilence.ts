const SPEECH_RMS_THRESHOLD = 0.025;
const SILENCE_DURATION_MS = 850;

export function createSpeechPauseDetector(
  onPause: () => void,
  now: () => number = () => performance.now(),
): (samples: Uint8Array) => boolean {
  let speechDetected = false;
  let silenceStartedAt: number | null = null;
  let stopped = false;

  return (samples) => {
    if (stopped || samples.length === 0) return stopped;

    let energy = 0;
    for (const sample of samples) {
      const amplitude = (sample - 128) / 128;
      energy += amplitude * amplitude;
    }
    const rms = Math.sqrt(energy / samples.length);

    if (rms >= SPEECH_RMS_THRESHOLD) {
      speechDetected = true;
      silenceStartedAt = null;
      return false;
    }
    if (!speechDetected) return false;

    silenceStartedAt ??= now();
    if (now() - silenceStartedAt < SILENCE_DURATION_MS) return false;

    stopped = true;
    onPause();
    return true;
  };
}

export async function watchForSpeechPause(stream: MediaStream, onPause: () => void): Promise<() => void> {
  const context = new AudioContext();
  try {
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const detectPause = createSpeechPauseDetector(onPause);
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      if (detectPause(samples)) window.clearInterval(timer);
    }, 120);

    return () => {
      window.clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  } catch (caught) {
    await context.close();
    throw new Error(
      caught instanceof Error
        ? `Automatic silence detection could not start: ${caught.message}`
        : "Automatic silence detection could not start.",
    );
  }
}
