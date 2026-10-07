/**
 * Documents in chat — the server half.
 *
 * Same shape as the voice-notes unit tests: the allowlist, the path builder and
 * the /confirm regex are three separate places that must agree, and a mismatch
 * fails AFTER the user's upload completes ("Unknown media path"), which reads
 * like a storage bug and is not one. The round-trip test at the bottom is the
 * important one.
 */
import * as storage from '../src/services/supabase.service';
import { createMessageSchema, mediaConfirmSchema, mediaSignSchema } from '../src/validators/schemas';

const USER_ID = 'b6f1c2d4-1111-2222-3333-444455556666';

const DOCUMENT_TYPES: Array<[string, string]> = [
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.ms-excel', 'xls'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.ms-powerpoint', 'ppt'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
  ['application/rtf', 'rtf'],
  ['application/epub+zip', 'epub'],
  ['application/zip', 'zip'],
  ['application/x-7z-compressed', '7z'],
  ['application/vnd.rar', 'rar'],
  ['application/json', 'json'],
  ['text/plain', 'txt'],
  ['text/csv', 'csv'],
  ['text/markdown', 'md'],
  ['application/octet-stream', 'dat'],
];

describe('documents as a media kind', () => {
  it.each(DOCUMENT_TYPES)('accepts %s', (contentType) => {
    expect(storage.isAllowedType('file', contentType)).toBe(true);
  });

  it('refuses executables and media pretending to be documents', () => {
    for (const contentType of [
      'application/x-msdownload',
      'application/vnd.android.package-archive',
      'application/x-sh',
      'application/x-executable',
      'video/mp4',
      'image/png',
      'audio/webm',
    ]) {
      expect(storage.isAllowedType('file', contentType)).toBe(false);
    }
  });

  it('leaves the other kinds’ allowlists alone', () => {
    expect(storage.isAllowedType('image', 'application/pdf')).toBe(false);
    expect(storage.isAllowedType('video', 'application/zip')).toBe(false);
    expect(storage.isAllowedType('audio', 'text/plain')).toBe(false);
  });

  it('caps documents at 32 MB', () => {
    expect(storage.maxBytesFor('file')).toBe(32 * 1024 * 1024);
  });

  it('round-trips: every document path buildMediaPath can produce is accepted by /confirm', () => {
    for (const [contentType] of DOCUMENT_TYPES) {
      const path = storage.buildMediaPath('file', contentType, USER_ID);
      expect(path.startsWith('file/')).toBe(true);
      const parsed = mediaConfirmSchema.safeParse({ kind: 'file', path });
      if (!parsed.success) {
        throw new Error(`confirm schema rejected ${contentType}: ${JSON.stringify(parsed.error.issues)}`);
      }
    }
  });

  it('sign accepts the file kind', () => {
    expect(
      mediaSignSchema.safeParse({ kind: 'file', contentType: 'application/pdf', bytes: 1_000 }).success
    ).toBe(true);
  });

  it('confirm refuses a document path claimed as another kind', () => {
    const path = storage.buildMediaPath('file', 'application/pdf', USER_ID);
    expect(mediaConfirmSchema.safeParse({ kind: 'image', path }).success).toBe(false);
  });
});

describe('FILE messages', () => {
  it('accepts type FILE with a filename and the view-once flag', () => {
    const parsed = createMessageSchema.safeParse({
      body: 'https://example.test/stored.pdf',
      type: 'FILE',
      mediaName: 'Lecture 3 — Data Structures.pdf',
      viewOnce: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mediaName).toBe('Lecture 3 — Data Structures.pdf');
      expect(parsed.data.viewOnce).toBe(true);
    }
  });

  it('trims and caps the filename', () => {
    const parsed = createMessageSchema.safeParse({
      body: 'x',
      type: 'FILE',
      mediaName: ` ${'n'.repeat(300)} `,
    });
    expect(parsed.success).toBe(false); // 300 chars is past the 255 cap
  });

  it('still rejects unknown message types', () => {
    expect(createMessageSchema.safeParse({ body: 'x', type: 'APK' }).success).toBe(false);
  });
});
