import type { Tier } from '../three/quality';

export type CameraProblem = 'insecure' | 'unsupported' | 'denied' | 'missing' | 'busy' | 'failed';

export class CameraError extends Error {
  constructor(readonly problem: CameraProblem, cause?: unknown) {
    super(`camera: ${problem}`);
    this.cause = cause;
  }
}

/** Why the camera cannot work at all, before asking (no prompt shown). */
export function cameraBlocker(): CameraProblem | null {
  if (!window.isSecureContext) return 'insecure'; // getUserMedia only exists on https:// (and localhost)
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}

/**
 * Opens the back camera ourselves instead of letting MindAR do it, so that:
 * - a failure has a reason we can show the worker (MindAR rejects with nothing),
 * - resolution suits the phone (tracking cost grows with pixels; cheap phones get 640x480),
 * - continuous autofocus is on where supported, which keeps a printed marker sharp at arm's length.
 */
export async function openCamera(tier: Tier): Promise<MediaStream> {
  const blocked = cameraBlocker();
  if (blocked) throw new CameraError(blocked);
  const size = tier === 'high' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 640 }, height: { ideal: 480 } };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', ...size } });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', e);
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('missing', e);
    if (name === 'NotReadableError' || name === 'AbortError') throw new CameraError('busy', e);
    throw new CameraError('failed', e);
  }
  const track = stream.getVideoTracks()[0];
  try {
    const caps = (track.getCapabilities?.() ?? {}) as { focusMode?: string[] };
    if (caps.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
  } catch {
    /* focus control is optional */
  }
  return stream;
}

/**
 * Runs `start` (MindAR's own start-up) with getUserMedia temporarily answering with our stream, so MindAR
 * uses the camera we opened instead of opening a second one with its default settings.
 */
export async function withStream<T>(stream: MediaStream, start: () => Promise<T>): Promise<T> {
  const md = navigator.mediaDevices as MediaDevices & { getUserMedia: MediaDevices['getUserMedia'] };
  const own = Object.getOwnPropertyDescriptor(md, 'getUserMedia');
  md.getUserMedia = () => Promise.resolve(stream);
  try {
    return await start();
  } finally {
    if (own) Object.defineProperty(md, 'getUserMedia', own);
    else delete (md as { getUserMedia?: unknown }).getUserMedia;
  }
}
