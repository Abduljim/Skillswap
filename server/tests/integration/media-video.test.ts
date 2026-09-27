/**
 * Chat video — the storage pipeline behind it and the message rows it produces.
 *
 * Three things are pinned here:
 *
 *  1. The caps are *measured*, not claimed. `/confirm` HEADs the object in
 *     storage and rejects what the client said was smaller. A client cannot talk
 *     a 200 MB video past a 64 MB ceiling.
 *  2. A message may only point at media this server stored. Without that check
 *     any signed-in client could attach an arbitrary third-party URL to a chat
 *     bubble (tracking pixel, malware link, someone else's bucket).
 *  3. Nothing here breaks an older APK. Text, stickers and the legacy inline
 *     base64 photos v1.5 sent all still work with storage switched off, and the
 *     media endpoints answer 503 MEDIA_NOT_CONFIGURED rather than 500.
 *
 * Storage config is read once when `config/env` is first imported, so the
 * "configured" cases boot a second app instance inside `jest.isolateModules`
 * with the env set and `global.fetch` stubbed — Supabase is never really called.
 */
import request from 'supertest';
import { api, signup, resetDatabase, prisma, createSkill, type Session } from '../helpers/api';

const SUPABASE_URL = 'https://fake-project.supabase.co';
const BUCKET = 'skillswap-media';
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO_MS = 65_000;

/** A URL that *looks* like ours: accepted only because the host matches. */
const OWN_VIDEO_URL = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/video/1a2b3c4d/2026-09-27/11111111-2222-4333-8444-555555555555.mp4`;
const FOREIGN_URL = 'https://not-our-bucket.example.com/video/clip.mp4';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function expectCreated(res: { status: number }) {
  if (res.status !== 200 && res.status !== 201) throw new Error(`Expected 200/201, got ${res.status}`);
}

async function userWithSkills(email: string, name: string, teach: string[], want: string[]): Promise<Session> {
  const session = await signup(email, name);
  for (const skillId of teach) {
    await api()
      .post(`/api/skills/${skillId}/add`)
      .set('Cookie', session.cookie)
      .send({ skillId, type: 'TEACH', proficiency: 'ADVANCED' })
      .expect(expectCreated);
  }
  for (const skillId of want) {
    await api()
      .post(`/api/skills/${skillId}/add`)
      .set('Cookie', session.cookie)
      .send({ skillId, type: 'WANT', proficiency: 'BEGINNER' })
      .expect(expectCreated);
  }
  return session;
}

/** Two users with an ACTIVE exchange, exactly as the app creates one. */
async function pairWithExchange() {
  const python = await createSkill('Python (media test)');
  const guitar = await createSkill('Guitar (media test)');

  const a = await userWithSkills('media-a@skillswap.test', 'Ada Media', [python], [guitar]);
  const b = await userWithSkills('media-b@skillswap.test', 'Ben Media', [guitar], [python]);

  const req = await api()
    .post('/api/exchange-requests')
    .set('Cookie', a.cookie)
    .send({ receiverId: b.userId, offeredSkillId: python, requestedSkillId: guitar, message: 'Hi! Want to swap lessons?' })
    .expect(expectCreated);

  await api()
    .post(`/api/exchange-requests/${req.body.data.id}/accept`)
    .set('Cookie', b.cookie)
    .expect(expectCreated);

  const exchange = await prisma.exchange.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { userAId: a.userId, userBId: b.userId },
        { userAId: b.userId, userBId: a.userId },
      ],
    },
    select: { id: true },
  });
  if (!exchange) throw new Error('Exchange was never activated');
  return { a, b, exchangeId: exchange.id };
}

type FetchHandler = (url: string, init?: any) => { status: number; body?: unknown; headers?: Record<string, string> };

/** Replaces global.fetch with a handler; returns the restore function. */
function stubFetch(handler: FetchHandler): () => void {
  const real = global.fetch;
  global.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? '');
    const result = handler(url, init);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: { get: (key: string) => result.headers?.[key.toLowerCase()] ?? null },
      json: async () => result.body ?? {},
      text: async () => (result.body === undefined ? '' : JSON.stringify(result.body)),
    };
  }) as unknown as typeof fetch;
  return () => {
    global.fetch = real;
  };
}

/** Boots an app instance that believes Supabase is configured. */
function configuredApp() {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_MEDIA_BUCKET,
  };
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
  process.env.SUPABASE_MEDIA_BUCKET = BUCKET;

  let app: any;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    app = require('../../src/app').default;
  });

  // Restore so every other test in the suite still sees "unconfigured".
  for (const [key, value] of Object.entries({
    SUPABASE_URL: saved.url,
    SUPABASE_SERVICE_ROLE_KEY: saved.key,
    SUPABASE_MEDIA_BUCKET: saved.bucket,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return app;
}

describe('Media hosting status', () => {
  it('reports unconfigured instead of failing when Supabase keys are absent', async () => {
    const session = await signup('status@skillswap.test', 'Status User');
    const res = await api().get('/api/media/status').set('Cookie', session.cookie).expect(200);

    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.maxVideoBytes).toBe(MAX_VIDEO_BYTES);
    expect(res.body.data.maxVideoMs).toBe(MAX_VIDEO_MS);
  });

  it('refuses to sign or confirm uploads while unconfigured (503, not 500)', async () => {
    const session = await signup('nosign@skillswap.test', 'No Sign');

    const sign = await api()
      .post('/api/media/sign')
      .set('Cookie', session.cookie)
      .send({ kind: 'video', contentType: 'video/mp4', bytes: 1_000_000 })
      .expect(503);
    expect(sign.body.error.code).toBe('MEDIA_NOT_CONFIGURED');

    const confirm = await api()
      .post('/api/media/confirm')
      .set('Cookie', session.cookie)
      .send({ kind: 'video', path: 'video/1a2b3c4d/2026-09-27/11111111-2222-4333-8444-555555555555.mp4' })
      .expect(503);
    expect(confirm.body.error.code).toBe('MEDIA_NOT_CONFIGURED');
  });

  it('requires authentication', async () => {
    await api().get('/api/media/status').expect(401);
    await api().post('/api/media/sign').send({ kind: 'video', contentType: 'video/mp4', bytes: 10 }).expect(401);
  });
});

describe('Signing uploads (storage configured)', () => {
  it('returns a server-generated path, a token-bearing upload URL and the caps', async () => {
    const restore = stubFetch((url, init) => {
      expect(url).toContain('/storage/v1/object/upload/sign/');
      // Both headers, on purpose: an opaque sb_secret_ key is not a JWT, and a
      // gateway that JWT-decodes Authorization rejects it with "Invalid Compact
      // JWS". apikey is resolved by direct lookup and works for either format.
      expect(init.headers.apikey).toBe('fake-service-role-key');
      expect(init.headers.Authorization).toBe('Bearer fake-service-role-key');
      return { status: 200, body: { url: `/object/upload/sign/${BUCKET}/video/x.mp4`, token: 'signed-token-123' } };
    });
    try {
      const session = await signup('sign@skillswap.test', 'Sign User');
      const res = await request(configuredApp())
        .post('/api/media/sign')
        .set('Cookie', session.cookie)
        .send({ kind: 'video', contentType: 'video/mp4', bytes: 8_000_000 })
        .expect(200);

      const data = res.body.data;
      // The client never chooses the path — that is what keeps traversal out.
      expect(data.path).toMatch(/^video\/[0-9a-f]{8}\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.mp4$/);
      expect(data.uploadUrl).toContain('token=signed-token-123');
      expect(data.publicUrl).toBe(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${data.path}`);
      expect(data.maxBytes).toBe(MAX_VIDEO_BYTES);
      expect(data.method).toBe('POST');
    } finally {
      restore();
    }
  });

  it('rejects a video above the size ceiling before any bytes move', async () => {
    const restore = stubFetch(() => ({ status: 200, body: {} }));
    try {
      const session = await signup('toobig@skillswap.test', 'Too Big');
      const res = await request(configuredApp())
        .post('/api/media/sign')
        .set('Cookie', session.cookie)
        .send({ kind: 'video', contentType: 'video/mp4', bytes: MAX_VIDEO_BYTES + 1 })
        .expect(400);
      expect(res.body.error.message).toMatch(/limit is 64 MB/);
    } finally {
      restore();
    }
  });

  it('rejects a non-media content type smuggled in as a video', async () => {
    const restore = stubFetch(() => ({ status: 200, body: {} }));
    try {
      const session = await signup('badtype@skillswap.test', 'Bad Type');
      const res = await request(configuredApp())
        .post('/api/media/sign')
        .set('Cookie', session.cookie)
        .send({ kind: 'video', contentType: 'application/pdf', bytes: 1000 })
        .expect(400);
      expect(res.body.error.message).toMatch(/not supported/);
    } finally {
      restore();
    }
  });

  it('translates a missing bucket into an actionable error, not a 500', async () => {
    const restore = stubFetch(() => ({ status: 404, body: { message: 'Bucket not found' } }));
    try {
      const session = await signup('nobucket@skillswap.test', 'No Bucket');
      const res = await request(configuredApp())
        .post('/api/media/sign')
        .set('Cookie', session.cookie)
        .send({ kind: 'video', contentType: 'video/mp4', bytes: 1000 })
        .expect(502);
      expect(res.body.error.code).toBe('MEDIA_UPLOAD_SIGN_FAILED');
      expect(res.body.error.message).toMatch(/bucket/i);
    } finally {
      restore();
    }
  });
});

describe('Confirming uploads (storage configured)', () => {
  const PATH = 'video/1a2b3c4d/2026-09-27/11111111-2222-4333-8444-555555555555.mp4';

  it('measures the stored object and returns its public URL and real size', async () => {
    const restore = stubFetch((url, init) => {
      expect(init.method).toBe('HEAD');
      return { status: 200, headers: { 'content-length': '8388608', 'content-type': 'video/mp4' } };
    });
    try {
      const session = await signup('confirm@skillswap.test', 'Confirm User');
      const res = await request(configuredApp())
        .post('/api/media/confirm')
        .set('Cookie', session.cookie)
        .send({ kind: 'video', path: PATH, width: 720, height: 1280, durationMs: 42_000 })
        .expect(200);

      expect(res.body.data.url).toBe(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${PATH}`);
      expect(res.body.data.bytes).toBe(8_388_608); // measured, not the client's claim
      expect(res.body.data.durationMs).toBe(42_000);
    } finally {
      restore();
    }
  });

  it('rejects a path the server never issued (traversal / absolute paths)', async () => {
    const restore = stubFetch(() => ({ status: 200, headers: { 'content-length': '10' } }));
    try {
      const session = await signup('traverse@skillswap.test', 'Traverse User');
      for (const path of ['../../etc/passwd', 'video/x.mp4', `${SUPABASE_URL}/storage/v1/object/x`, 'image/1a2b3c4d/2026-09-27/11111111-2222-4333-8444-555555555555.exe']) {
        const res = await request(configuredApp())
          .post('/api/media/confirm')
          .set('Cookie', session.cookie)
          .send({ kind: 'video', path })
          .expect(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    } finally {
      restore();
    }
  });

  it('rejects an object that is really over the ceiling even if the client claimed less', async () => {
    const restore = stubFetch(() => ({
      status: 200,
      headers: { 'content-length': String(MAX_VIDEO_BYTES + 5_000_000), 'content-type': 'video/mp4' },
    }));
    try {
      const session = await signup('liar@skillswap.test', 'Liar User');
      const res = await request(configuredApp())
        .post('/api/media/confirm')
        .set('Cookie', session.cookie)
        .send({ kind: 'video', path: PATH, bytes: 1000, durationMs: 30_000 })
        .expect(400);
      expect(res.body.error.message).toMatch(/limit is 64 MB/);
    } finally {
      restore();
    }
  });

  it('rejects an upload that never arrived', async () => {
    const restore = stubFetch(() => ({ status: 404 }));
    try {
      const session = await signup('missing@skillswap.test', 'Missing User');
      const res = await request(configuredApp())
        .post('/api/media/confirm')
        .set('Cookie', session.cookie)
        .send({ kind: 'video', path: PATH })
        .expect(400);
      expect(res.body.error.message).toMatch(/did not arrive/);
    } finally {
      restore();
    }
  });

  it('rejects a clip longer than the 60-second cap', async () => {
    const restore = stubFetch(() => ({ status: 200, headers: { 'content-length': '1000', 'content-type': 'video/mp4' } }));
    try {
      const session = await signup('toolong@skillswap.test', 'Too Long');
      // 120s: over MAX_VIDEO_MS, and the schema bound catches it first.
      await request(configuredApp())
        .post('/api/media/confirm')
        .set('Cookie', session.cookie)
        .send({ kind: 'video', path: PATH, durationMs: 120_000 })
        .expect(400);
    } finally {
      restore();
    }
  });
});

describe('Video messages', () => {
  it('stores a VIDEO message with its frame metadata and returns it to both sides', async () => {
    const { a, b, exchangeId } = await pairWithExchange();

    const sent = await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({
        body: 'https://storage.example/clip.mp4',
        type: 'VIDEO',
        caption: 'My guitar practice',
        mediaBytes: 8_388_608,
        mediaWidth: 720,
        mediaHeight: 1280,
        mediaDurationMs: 42_000,
      })
      .expect(200);

    expect(sent.body.data.type).toBe('VIDEO');
    expect(sent.body.data.mediaBytes).toBe(8_388_608);
    expect(sent.body.data.mediaDurationMs).toBe(42_000);

    const list = await api()
      .get(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', b.cookie)
      .expect(200);
    const received = list.body.data.find((msg: any) => msg.type === 'VIDEO');
    expect(received).toBeDefined();
    expect(received.caption).toBe('My guitar practice');
    expect(received.mediaWidth).toBe(720);
    expect(received.mediaHeight).toBe(1280);
  });

  it('accepts a mediaUrl that points at our own bucket', async () => {
    const restore = stubFetch(() => ({ status: 200, body: {} }));
    try {
      const { a, exchangeId } = await pairWithExchange();
      const res = await request(configuredApp())
        .post(`/api/exchanges/${exchangeId}/messages`)
        .set('Cookie', a.cookie)
        .send({ body: OWN_VIDEO_URL, type: 'VIDEO', mediaUrl: OWN_VIDEO_URL, thumbUrl: OWN_VIDEO_URL, mediaBytes: 1024 })
        .expect(200);
      expect(res.body.data.mediaUrl).toBe(OWN_VIDEO_URL);
    } finally {
      restore();
    }
  });

  it('refuses to attach a third-party URL to a chat bubble', async () => {
    const { a, exchangeId } = await pairWithExchange();
    const res = await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({ body: FOREIGN_URL, type: 'VIDEO', mediaUrl: FOREIGN_URL })
      .expect(400);
    expect(res.body.error.message).toMatch(/not from SkillSwap storage/);

    // Nothing was written.
    const stored = await prisma.message.findMany({ where: { exchangeId } });
    expect(stored.some((m) => m.type === 'VIDEO')).toBe(false);
  });

  it('refuses a foreign thumbnail URL too', async () => {
    const { a, exchangeId } = await pairWithExchange();
    await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({ body: 'clip', type: 'VIDEO', thumbUrl: 'https://tracker.example.com/pixel.jpg' })
      .expect(400);
  });

  it('enforces the duration ceiling at the message boundary', async () => {
    const { a, exchangeId } = await pairWithExchange();
    await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({ body: 'clip', type: 'VIDEO', mediaDurationMs: MAX_VIDEO_MS + 1 })
      .expect(400);
  });

  it('keeps v1.5 behaviour intact: text, stickers and inline base64 photos', async () => {
    const { a, exchangeId } = await pairWithExchange();

    await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({ body: 'Hello there', type: 'TEXT' })
      .expect(200);

    await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({ body: '🎸', type: 'STICKER' })
      .expect(200);

    const inline = await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({ body: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', type: 'IMAGE', caption: 'Old-school photo' })
      .expect(200);
    expect(inline.body.data.mediaUrl).toBeNull();

    const list = await api().get(`/api/exchanges/${exchangeId}/messages`).set('Cookie', a.cookie).expect(200);
    expect(list.body.data).toHaveLength(3);
  });

  it('still rejects unknown message types', async () => {
    const { a, exchangeId } = await pairWithExchange();
    await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({ body: 'audio bytes', type: 'AUDIO' })
      .expect(400);
  });
});
