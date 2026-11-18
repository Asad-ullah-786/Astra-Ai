import { useEffect, useRef } from "react";

export function Waveform({
  active,
  getAnalyser,
}: {
  active: boolean;
  getAnalyser: () => AnalyserNode | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }
    let frame = 0;
    const draw = (time: number) => {
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);
      const analyser = active ? getAnalyser() : null;
      const bars = 32;
      const data = new Uint8Array(bars);
      if (analyser) {
        analyser.getByteFrequencyData(data);
      }
      const gap = 4;
      const barWidth = (width - gap * (bars - 1)) / bars;
      for (let index = 0; index < bars; index += 1) {
        const sample = analyser ? data[index] / 255 : 0.2 + Math.sin(time / 500 + index / 3) * 0.17;
        const barHeight = Math.max(4, sample * height);
        context.fillStyle = analyser ? "#3ee0ff" : "rgba(62, 224, 255, 0.35)";
        context.fillRect(index * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [active, getAnalyser]);

  return <canvas ref={canvasRef} width={640} height={72} className="waveform h-5 w-full" aria-hidden="true" />;
}
