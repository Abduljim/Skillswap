/**
 * Voice notes — the server half.
 *
 * Pure unit tests (no database, no HTTP). They exist because the failure mode
 * here is silent: the enum, the content-type allowlist and the /confirm path
 * boundary are three separate places that all have to agree, and if one of them
 * is missed the app records a note, uploads the bytes to storage successfully,
 * and then the send fails with "Unknown media path" — which reads like a
 * storage bug and is not one.
 *
 * The round-trip test at the bottom is the important one: every path
 * buildMediaPath() can produce for audio must be accepted by the schema that
 * guards /confirm.
 */
import * as storage from '../src/services/supabase.service';
import { createMessageSchema, mediaConfirmSchema, mediaSignSchema } from '../src/validators/schemas';

const USER_ID = 'b6f1c2d4-1111-2222-3333-444455556666';

/** Every container a phone can actually hand us, with the extension expected. */
const AUDIO_CONTAINERS: Array<[string, string]> = [
  ['audio/webm', 'webm'],
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/ogg;codecs=opus', 'ogg'],
  ['audio/ogg', 'ogg'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/mpeg', 'mp3'],
  ['audio/aac', 'aac'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/amr', 'amr'],
  ['audio/3gpp', '3gp'],
];

describe('audio as a media kind', () => {
  it.each(AUDIO_CONTAINERS)('accepts %s', (contentType) => {
    expect(storage.isAllowedType('audio', contentType)).toBe(true);
  });

  it('strips codec parameters and is case-insensitive', () => {
    expect(storage.isAllowedType('audio', 'AUDIO/WEBM;codecs=opus')).toBe(true);
    expect(storage.isAllowedType('audio', '  audio/mp4  ')).toBe(true);
  });

  it('refuses a video or image claimed as audio', () => {
    // The kind decides the allowlist, so a 60 MB clip cannot sneak in as a note.
    expect(storage.isAllowedType('audio', 'video/mp4')).toBe(false);
    expect(storage.isAllowedType('audio', 'video/webm')).toBe(false);
    expect(storage.isAllowedType('audio', 'image/jpeg')).toBe(false);
    expect(storage.isAllowedType('audio', 'application/octet-stream')).toBe(false);
    expect(storage.isAllowedType('audio', 'audio/x-ms-wma')).toBe(false);
  });

  it('leaves the video and image allowlists alone', () => {
    expect(storage.isAllowedType('video', 'video/mp4')).toBe(true);
    expect(storage.isAllowedType('video', 'audio/webm')).toBe(false);
    expect(storage.isAllowedType('image', 'image/png')).toBe(true);
    expect(storage.isAllowedType('image', 'audio/webm')).toBe(false);
  });

  it('caps audio at its own ceiling', () => {
    expect(storage.maxBytesFor('audio')).toBe(storage.MAX_AUDIO_BYTES);
    expect(storage.maxBytesFor('video')).toBe(64 * 1024 * 1024);
    expect(storage.maxBytesFor('image')).toBe(12 * 1024 * 1024);
    // Five minutes of Opus is ~1 MB, so the byte cap is abuse-proofing, not a limit.
    expect(storage.MAX_AUDIO_MS).toBeGreaterThanOrEqual(300_000);
  });
});

describe('audio storage paths', () => {
  it('keeps audio under its own prefix with the right extension', () => {
    for (const [contentType, ext] of AUDIO_CONTAINERS) {
      const path = storage.buildMediaPath('audio', contentType, USER_ID);
      expect(path).toMatch(
        new RegExp(`^audio/[0-9a-f]{8}/\\d{4}-\\d{2}-\\d{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${ext}$`)
      );
    }
  });

  it('falls back to webm for an audio type with no mapped extension', () => {
    // Android WebView sometimes reports a bare "audio/webm" and older builds a
    // blank type; neither may produce ".jpg" inside the audio prefix.
    expect(storage.buildMediaPath('audio', '', USER_ID)).toMatch(/^audio\/.+\.webm$/);
    expect(storage.buildMediaPath('audio', 'audio/unknown', USER_ID)).toMatch(/^audio\/.+\.webm$/);
  });

  it('never puts the whole user id in a public URL', () => {
    const path = storage.buildMediaPath('audio', 'audio/webm', USER_ID);
    expect(path).not.toContain(USER_ID);
    expect(path).toContain(USER_ID.replace(/-/g, '').slice(0, 8));
  });

  it('gives every note a unique path', () => {
    const a = storage.buildMediaPath('audio', 'audio/webm', USER_ID);
    const b = storage.buildMediaPath('audio', 'audio/webm', USER_ID);
    expect(a).not.toBe(b);
  });
});

describe('the /confirm path boundary', () => {
  it('accepts every audio path the signer can produce', () => {
    for (const [contentType] of AUDIO_CONTAINERS) {
      const path = storage.buildMediaPath('audio', contentType, USER_ID);
      expect(() => mediaConfirmSchema.parse({ kind: 'audio', path })).not.toThrow();
    }
    expect(() =>
      mediaConfirmSchema.parse({ kind: 'audio', path: storage.buildMediaPath('audio', '', USER_ID), durationMs: 300_000 })
    ).not.toThrow();
  });

  it('still refuses anything that is not a path we minted', () => {
    const day = new Date().toISOString().slice(0, 10);
    const bad = [
      `audio/${USER_ID.slice(0, 8)}/${day}/../secret.webm`,
      'audio/../../etc/passwd',
      `music/${USER_ID.slice(0, 8)}/${day}/b6f1c2d4-1111-2222-3333-444455556666.webm`,
      'https://evil.example/audio/x.webm',
      `audio/${USER_ID.slice(0, 8)}/${day}/b6f1c2d4-1111-2222-3333-444455556666.exe`,
    ];
    for (const path of bad) {
      expect(() => mediaConfirmSchema.parse({ kind: 'audio', path })).toThrow();
    }
  });

  it('accepts audio at /sign and rejects an invented kind', () => {
    expect(() => mediaSignSchema.parse({ kind: 'audio', contentType: 'audio/webm', bytes: 900_000 })).not.toThrow();
    expect(() => mediaSignSchema.parse({ kind: 'music', contentType: 'audio/webm', bytes: 900_000 })).toThrow();
  });
});

describe('audio messages', () => {
  it('accepts a five-minute voice note', () => {
    const parsed = createMessageSchema.parse({
      body: 'https://jravxybafgcujstkzvdc.supabase.co/storage/v1/object/public/skillswap-media/audio/x.webm',
      type: 'AUDIO',
      mediaUrl: 'https://jravxybafgcujstkzvdc.supabase.co/storage/v1/object/public/skillswap-media/audio/x.webm',
      mediaBytes: 980_000,
      mediaDurationMs: 300_000,
    });
    expect(parsed.type).toBe('AUDIO');
    expect(parsed.mediaDurationMs).toBe(300_000);
  });

  it('refuses a duration past the audio ceiling', () => {
    expect(() => createMessageSchema.parse({ body: 'x', type: 'AUDIO', mediaDurationMs: 400_000 })).toThrow();
    expect(() => createMessageSchema.parse({ body: 'x', type: 'AUDIO', mediaDurationMs: 0 })).toThrow();
  });

  it('keeps the existing message types working', () => {
    expect(createMessageSchema.parse({ body: 'hello' }).type).toBe('TEXT');
    expect(createMessageSchema.parse({ body: 'clip', type: 'VIDEO', mediaDurationMs: 60_000 }).type).toBe('VIDEO');
    expect(createMessageSchema.parse({ body: '🎉', type: 'STICKER' }).type).toBe('STICKER');
    expect(() => createMessageSchema.parse({ body: 'note', type: 'VOICE' })).toThrow();
  });
});
