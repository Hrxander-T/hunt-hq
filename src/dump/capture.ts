// Grab a still picture of another window using the browser's screen sharing. Chrome/Edge/Firefox on a computer only:
// phone browsers do not have getDisplayMedia (on Android we use the Share option instead).

export const captureSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/** capture-HHMMSS-mmm.png: the milliseconds keep two captures in the same second apart. */
export const captureFileName = (d = new Date()) => `capture-${d.toTimeString().slice(0, 8).replace(/:/g, '')}-${String(d.getMilliseconds()).padStart(3, '0')}.png`;

export interface CaptureSession { stream: MediaStream; grab(): Promise<File>; stop(): void }

/** Opens the browser's "pick a window" dialog. Rejects with NotAllowedError if the user cancels it.
 *  onEnded fires when the user stops sharing from the browser's own bar (not when we call stop()). */
export async function startCapture(onEnded: () => void): Promise<CaptureSession> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  try { await video.play(); } catch (e) { stream.getTracks().forEach(t => t.stop()); throw e; }
  stream.getVideoTracks()[0]?.addEventListener('ended', onEnded);
  return {
    stream,
    stop: () => stream.getTracks().forEach(t => t.stop()),
    async grab() {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) throw new Error('The shared window has no picture yet. Try again in a second.');
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(video, 0, 0, w, h);
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Could not turn the picture into an image.');
      return new File([blob], captureFileName(), { type: 'image/png' });
    },
  };
}
