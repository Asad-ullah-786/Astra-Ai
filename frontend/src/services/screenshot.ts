export async function captureScreenFrame(): Promise<Blob> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture is not supported by this browser.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    const track = stream.getVideoTracks()[0];
    const { width, height } = track.getSettings();
    const canvas = document.createElement("canvas");
    canvas.width = width ?? video.videoWidth;
    canvas.height = height ?? video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context || canvas.width === 0 || canvas.height === 0) {
      throw new Error("Could not read the selected screen. Try sharing it again.");
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not save the selected screen image."));
      }, "image/png");
    });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
