/**
 * Chat media upload — the client half of the storage flow.
 *
 * Bytes never go through the SkillSwap API. The server mints a single-use signed
 * URL and the WebView POSTs straight to storage, which keeps a 20 MB clip off a
 * free 512 MB API instance (and out from under its 3 MB JSON body limit).
 *
 * Everything is defensive on purpose, because this runs on cheap Android phones
 * over mobile data:
 *   - `mediaStatus()` is cached, so opening a chat never costs an extra request
 *     and the video buttons can be hidden instead of failing after a recording;
 *   - size and duration are checked locally *before* an upload starts, so the
 *     user gets "that clip is 2:14 long" rather than a spinner and an error;
 *   - thumbnails are best-effort — a bubble without a poster still plays.
 */
import { api, ApiError } from './api';

export type MediaKind = 'video' | 'image';
export type VideoQuality = 'standard' | 'hd';

export interface MediaStatus {
  configured: boolean;
  maxVideoBytes: number;
  maxImageBytes: number;
  maxVideoMs: number;
}

interface SignResponse {
  kind: MediaKind;
  path: string;
  uploadUrl: string;
  method?: string;
  publicUrl: string;
  maxBytes: number;
  headers?: Record<string, string>;
}

interface ConfirmResponse {
  url: string;
  contentType: string;
  bytes: number;
}

export interface UploadedMedia {
  url: string;
  bytes: number;
  contentType: string;
}

/** Hard local fallbacks, in case /status cannot be reached. */
const FALLBACK: MediaStatus = {
  configured: true,
  maxVideoBytes: 64 * 1024 * 1024,
  maxImageBytes: 12 * 1024 * 1024,
  maxVideoMs: 65_000,
};

let statusPromise: Promise<MediaStatus> | null = null;

/** Asks the server once per app run whether media hosting is switched on. */
export function mediaStatus(): Promise<MediaStatus> {
  if (!statusPromise) {
    statusPromise = api.get<MediaStatus>('/media/status').catch((error) => {
      statusPromise = null; // retry next time rather than caching a failure
      throw error;
    });
  }
  return statusPromise;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** 0:07 / 1:04 — the badge format people expect from a messaging app. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Sign → upload → confirm. Returns the public URL to put on the message.
 * The confirm step is what makes the stored size trustworthy: the server reads
 * it back from storage instead of taking our word for it.
 */
export async function uploadMedia(blob: Blob, kind: MediaKind): Promise<UploadedMedia> {
  let status: MediaStatus = FALLBACK;
  try {
    status = await mediaStatus();
  } catch {
    // Offline or old server: carry on with the built-in ceilings and let the
    // request fail with a real error if the endpoint truly does not exist.
  }

  if (!status.configured) {
    throw new ApiError(
      'MEDIA_NOT_CONFIGURED',
      'Media hosting is not switched on for this server yet. Ask the maintainer to add the Supabase keys (docs/MEDIA.md).',
      503
    );
  }

  const max = kind === 'video' ? status.maxVideoBytes : status.maxImageBytes;
  if (blob.size > max) {
    throw new ApiError(
      'MEDIA_TOO_LARGE',
      `That file is ${formatBytes(blob.size)}. The limit is ${formatBytes(max)}.`,
      413
    );
  }

  const contentType = blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const signed = await api.post<SignResponse>('/media/sign', { kind, contentType, bytes: blob.size });

  // Straight to storage. Generous timeout: 64 MB over a weak mobile connection
  // can legitimately take minutes, and the 20 s API timeout must not apply here.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10 * 60_000);
  let response: Response;
  try {
    response = await fetch(signed.uploadUrl, {
      method: signed.method || 'POST',
      headers: signed.headers ?? { 'Content-Type': contentType, 'x-upsert': 'true' },
      body: blob,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('MEDIA_UPLOAD_TIMEOUT', 'The upload took too long. Try a shorter clip or better signal.', 0);
    }
    throw new ApiError(
      'MEDIA_UPLOAD_FAILED',
      navigator.onLine
        ? 'The upload did not complete. Please try again.'
        : 'You are offline. Your video will send once you are back online.',
      0
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError('MEDIA_UPLOAD_FAILED', 'The storage host refused the upload. Please try again.', response.status);
  }

  const confirmed = await api.post<ConfirmResponse>('/media/confirm', { kind, path: signed.path });
  return { url: confirmed.url, bytes: confirmed.bytes || blob.size, contentType: confirmed.contentType || contentType };
}

export interface VideoProbe {
  durationMs: number;
  width: number;
  height: number;
}

/** Reads duration + frame size out of a video without decoding the whole file. */
export function probeVideo(src: string, timeoutMs = 15_000): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('probe-timeout'))), timeoutMs);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () =>
      finish(() =>
        resolve({
          durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        })
      );
    video.onerror = () => finish(() => reject(new Error('probe-failed')));
    video.src = src;
  });
}

/**
 * Grabs one frame as a small JPEG so the bubble can show a poster instead of a
 * black rectangle (and so the chat list can render without fetching the video).
 * Best-effort: returns null on any failure.
 */
export async function grabVideoFrame(src: string, maxSide = 480): Promise<Blob | null> {
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('decode-timeout')), 12_000);
      video.onloadeddata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('decode-failed'));
      };
      video.src = src;
    });

    // A frame a fraction of a second in, so the poster is not a black fade-in.
    const target = Math.min(0.4, (Number.isFinite(video.duration) ? video.duration : 1) / 3);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 4000);
      video.onseeked = () => {
        clearTimeout(timer);
        resolve();
      };
      try {
        video.currentTime = target;
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });

    const width = video.videoWidth || 480;
    const height = video.videoHeight || 640;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(width * scale));
    canvas.height = Math.max(2, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    video.removeAttribute('src');
    video.load();

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
    });
  } catch {
    return null;
  }
}

/**
 * Which quality label to show for a clip we did not record ourselves (a gallery
 * pick). 720p and above reads as HD; anything below is Standard.
 */
export function qualityForHeight(height: number): VideoQuality {
  return height >= 700 ? 'hd' : 'standard';
}
