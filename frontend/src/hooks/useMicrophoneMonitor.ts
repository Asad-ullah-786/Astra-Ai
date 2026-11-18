import { useCallback, useEffect, useRef, useState } from "react";

export function useMicrophoneMonitor() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    void audioRef.current?.close();
    audioRef.current = null;
    setActive(false);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audio = new AudioContext();
      const source = audio.createMediaStreamSource(stream);
      const analyser = audio.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      streamRef.current = stream;
      audioRef.current = audio;
      analyserRef.current = analyser;
      setActive(true);
    } catch (caught) {
      setActive(false);
      setError(caught instanceof Error ? caught.message : "Microphone permission was denied");
    }
  }, [stop]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    let frame = 0;
    const data = new Uint8Array(32);
    const tick = () => {
      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length;
        setLevel(average / 255);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => stop, [stop]);

  const getAnalyser = useCallback(() => analyserRef.current, []);

  return { active, error, level, analyserRef, getAnalyser, start, stop };
}
