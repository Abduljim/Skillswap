/**
 * GET /api/admin/diagnostics — turns "I pasted the keys into Render" into "the
 * keys actually work", for integrations whose failures are otherwise invisible.
 *
 * Admin-only, and its whole purpose is to be pasted into a chat or an issue, so
 * leaking a secret through it would be worse than not having it at all.
 *
 * The environment is pinned explicitly rather than assumed empty: these checks
 * contact real services, and a stray SMTP_HOST in a .env file would make the
 * suite try to open a socket to someone's mail server.
 */
import { api, signup, resetDatabase, prisma } from '../helpers/api';
import { env } from '../../src/config/env';

const PINNED = {
  FCM_SERVICE_ACCOUNT_JSON: '',
  FCM_SERVER_KEY: '',
  SMTP_HOST: '',
  SMTP_FROM: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  RESEND_API_KEY: '',
};

describe('GET /api/admin/diagnostics', () => {
  const original: Record<string, string> = {};

  beforeAll(() => {
    for (const [key, value] of Object.entries(PINNED)) {
      original[key] = (env as unknown as Record<string, string>)[key];
      (env as unknown as Record<string, string>)[key] = value;
    }
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(original)) {
      (env as unknown as Record<string, string>)[key] = value;
    }
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('refuses an anonymous caller', async () => {
    const res = await api().get('/api/admin/diagnostics');
    expect(res.status).toBe(401);
  });

  it('refuses a signed-in non-admin', async () => {
    const user = await signup('diag.plain@skillswap.test', 'Plain User');
    const res = await api().get('/api/admin/diagnostics').set('Cookie', user.cookie);
    expect(res.status).toBe(403);
  });

  it('names the exact problem when push is not configured', async () => {
    const admin = await signup('diag.admin@skillswap.test', 'Admin User');
    await prisma.user.update({ where: { id: admin.userId }, data: { isAdmin: true } });

    const res = await api().get('/api/admin/diagnostics').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(typeof d.generatedAt).toBe('string');
    expect(d.push.configured).toBe(false);
    expect(d.push.oauth).toBe('not_attempted');
    expect(d.push.error).toMatch(/FCM_SERVICE_ACCOUNT_JSON/);
    expect(typeof d.push.deviceTokens).toBe('number');
    expect(d.push.hint).toMatch(/Fix the credential problem/);
  });

  it('reports email, media and billing state, and carries no secret material', async () => {
    const admin = await signup('diag.admin2@skillswap.test', 'Admin Two');
    await prisma.user.update({ where: { id: admin.userId }, data: { isAdmin: true } });

    const res = await api().get('/api/admin/diagnostics').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    const d = res.body.data;

    // No provider configured -> say which, and do not pretend to have tested it.
    expect(d.email.provider).toBe('none');
    expect(d.email.smtp.configured).toBe(false);
    expect(d.email.smtp.verify).toBe('not_attempted');
    expect(d.email.resend.keyCheck).toBe('not_attempted');
    expect(d.email.smtp).not.toHaveProperty('pass');

    expect(Array.isArray(d.media.missing)).toBe(true);
    expect(typeof d.media.configured).toBe('boolean');
    expect(d.media.bucket).toBeTruthy();

    expect(typeof d.billing.playVerificationEnabled).toBe('boolean');
    expect(typeof d.billing.playServiceAccountSet).toBe('boolean');
    expect(d.billing.hint).toBeTruthy();

    expect(d.database).toEqual(
      expect.objectContaining({
        users: expect.any(Number),
        messages: expect.any(Number),
        exchanges: expect.any(Number),
      })
    );

    // This response is meant to be shared, so it must carry no credentials.
    const raw = JSON.stringify(d);
    expect(raw).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(raw).not.toMatch(/sb_secret_/);
    expect(raw).not.toMatch(/ya29\./); // a live Google OAuth access token
    expect(raw).not.toMatch(/github_pat_/);
  });
});
