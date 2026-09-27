/**
 * Supabase Storage — where chat media actually lives.
 *
 * Photos used to be base64 text inside the Postgres row. That survives a 300 KB
 * JPEG, but it cannot survive video: Render's free Postgres is 512 MB *and* is
 * deleted 90 days after creation, so every clip stored there would have a hard
 * expiry date along with the rest of the database. Object storage keeps the row
 * holding only a URL, which also stops the message list from carrying blobs.
 *
 * The service-role key never leaves this process. The client asks
 * POST /api/media/sign for a one-time signed upload URL and POSTs the bytes
 * straight to Supabase, so 20 MB videos never transit the API — which matters on
 * a free 512 MB instance that also has a 3 MB JSON body limit.
 *
 * Everything degrades gracefully: with no keys configured `storageConfigured()`
 * is false, the media endpoints answer 503 MEDIA_NOT_CONFIGURED, and text chat
 * plus legacy inline photos keep working exactly as before.
 */
import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { HttpError } from '../utils/errors';

export type MediaKind = 'video' | 'image';

/**
 * WhatsApp-style ceilings. The in-app recorder stops itself at 60s; these caps
 * exist so a gallery pick (or a hand-crafted request) cannot blow past them.
 * 64 MB comfortably holds a 60s 720p clip even at high motion.
 */
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
/** 60s as chosen for the recorder, plus slack for container duration rounding. */
export const MAX_VIDEO_MS = 65_000;

const VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/3gpp',
  'video/x-m4v',
  'video/mpeg',
]);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const EXT_BY_TYPE: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/x-m4v': 'm4v',
  'video/mpeg': 'mpg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** True only when both the project URL and the service-role key are present. */
export function storageConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function bucketName(): string {
  return env.SUPABASE_MEDIA_BUCKET || 'skillswap-media';
}

export function maxBytesFor(kind: MediaKind): number {
  return kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

export function isAllowedType(kind: MediaKind, contentType: string): boolean {
  const type = contentType.split(';')[0].trim().toLowerCase();
  return (kind === 'video' ? VIDEO_TYPES : IMAGE_TYPES).has(type);
}

function storageBase(): string {
  return `${env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1`;
}

/**
 * Auth headers for a Storage call — deliberately BOTH of them.
 *
 * Supabase runs two key systems side by side: the legacy `service_role` JWT and
 * the new opaque `sb_secret_...` key — which is the only kind a project created
 * today gets, and the only kind that survives the legacy deprecation at the end
 * of 2026. The gateway resolves `apikey` by direct lookup, but it tries to
 * *JWT-decode* whatever sits in `Authorization: Bearer`, so a new-format key sent
 * only there fails with `403 {"error":"Unauthorized","message":"Invalid Compact
 * JWS"}` — a miserable dead end, because the key itself is perfectly valid.
 *
 * Sending both works for either format, and is what supabase-js itself does for
 * direct REST/Storage calls.
 */
function storageHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, ...(extra || {}) };
}

/** Public read URL for a stored object (the bucket must be public). */
export function publicUrlFor(path: string): string {
  return `${storageBase()}/object/public/${bucketName()}/${path}`;
}

/**
 * The only media host we will store on a message. Without this, any signed-in
 * client could attach an arbitrary third-party URL to a chat message and use
 * SkillSwap as a link launderer (or point a bubble at tracking pixels).
 */
export function isOwnMediaUrl(raw: string): boolean {
  if (!storageConfigured()) return false;
  try {
    const url = new URL(raw);
    const own = new URL(env.SUPABASE_URL);
    const prefix = `${own.pathname.replace(/\/+$/, '')}/storage/v1/object/public/${bucketName()}/`;
    return url.protocol === 'https:' && url.host === own.host && url.pathname.startsWith(prefix);
  } catch {
    return false;
  }
}

/** 503 rather than 500 when hosting is simply not switched on yet. */
export function assertStorageReady(): void {
  if (!storageConfigured()) {
    throw new HttpError(
      503,
      'MEDIA_NOT_CONFIGURED',
      'Media hosting is not set up on the server yet (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). See docs/MEDIA.md.',
      { docs: 'docs/MEDIA.md' }
    );
  }
}

/**
 * kind/<user-prefix>/<date>/<uuid>.<ext>
 * The bucket is public, so the UUID is the access control: unguessable, and it
 * is never listed anywhere. Paths are regenerated server-side — a client never
 * chooses one, which is what keeps traversal out of the question.
 */
export function buildMediaPath(kind: MediaKind, contentType: string, userId: string): string {
  const type = contentType.split(';')[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[type] || (kind === 'video' ? 'mp4' : 'jpg');
  const day = new Date().toISOString().slice(0, 10);
  return `${kind}/${userId.replace(/-/g, '').slice(0, 8)}/${day}/${randomUUID()}.${ext}`;
}

/**
 * Ask Supabase for a single-use upload URL for `path`.
 * Returns the absolute URL the client POSTs bytes to (token already attached).
 */
export async function createSignedUploadUrl(path: string, contentType: string): Promise<string> {
  const res = await fetch(`${storageBase()}/object/upload/sign/${bucketName()}/${path}`, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': 'application/json', 'x-upsert': 'false' }),
    body: JSON.stringify({ contentType: contentType.split(';')[0].trim().toLowerCase() }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HttpError(
      502,
      'MEDIA_UPLOAD_SIGN_FAILED',
      res.status === 404
        ? `The storage bucket "${bucketName()}" was not found. Create it (public) as described in docs/MEDIA.md.`
        : res.status === 401 || res.status === 403
          ? 'Supabase refused the storage key. Check SUPABASE_SERVICE_ROLE_KEY is the secret key (sb_secret_...) or the legacy service_role JWT for THIS project — a key copied from another project looks the same and fails the same way. See docs/MEDIA.md.'
          : 'Could not start the upload. Please try again.',
      { status: res.status, detail: detail.slice(0, 300) }
    );
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; token?: string };
  if (!data.url || !data.token) {
    throw new HttpError(502, 'MEDIA_UPLOAD_SIGN_FAILED', 'The storage host returned an unusable upload token.');
  }
  return `${storageBase()}${data.url}?token=${encodeURIComponent(data.token)}`;
}

/**
 * Confirm an object really landed, and read its true size from storage rather
 * than trusting the number the client claimed. Used to enforce the caps.
 */
export async function statObject(path: string): Promise<{ bytes: number; contentType: string } | null> {
  const res = await fetch(`${storageBase()}/object/${bucketName()}/${path}`, {
    method: 'HEAD',
    headers: storageHeaders(),
  });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) {
    throw new HttpError(502, 'MEDIA_STAT_FAILED', 'Could not verify the upload. Please try sending it again.', {
      status: res.status,
    });
  }
  return {
    bytes: Number(res.headers.get('content-length') || 0),
    contentType: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(),
  };
}

/** Remove an object that failed validation, so it cannot sit there unlinked. */
export async function deleteObject(path: string): Promise<void> {
  await fetch(`${storageBase()}/object/${bucketName()}/${path}`, {
    method: 'DELETE',
    headers: storageHeaders(),
  }).catch(() => undefined);
}
