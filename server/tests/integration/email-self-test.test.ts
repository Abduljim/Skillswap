/**
 * POST /api/auth/email-self-test — the in-band delivery diagnostic.
 *
 * Password-reset failures are deliberately silent to the caller (the endpoint
 * cannot reveal which addresses exist), which meant nobody could say WHY a
 * reset link never arrived. The self-test answers that: provider config (no
 * secrets), a live SMTP handshake result and a real send — to YOURSELF only.
 */
import { api, signup, resetDatabase, prisma } from '../helpers/api';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Email self-test', () => {
  it('reports the delivery situation for the caller’s own address', async () => {
    const user = await signup('email-selftest@skillswap.test', 'Self Test');
    const res = await api()
      .post('/api/auth/email-self-test')
      .set('Cookie', user.cookie)
      .send({})
      .expect(200);

    const data = res.body.data;
    expect(data.to).toBe('email-selftest@skillswap.test');
    expect(typeof data.config).toBe('string');
    expect(typeof data.delivered).toBe('boolean');
    expect(data.diagnostics).toBeDefined();
    expect(data.diagnostics.smtp).toBeDefined();
    // No secret material, ever: the diagnostics expose host/port/user/from but
    // there is no password field at all.
    expect(JSON.stringify(data)).not.toMatch(/pass(word)?["']?\s*[:=]/i);
    expect(data.diagnostics.smtp).not.toHaveProperty('pass');
  });

  it('refuses anonymous callers', async () => {
    const res = await api().post('/api/auth/email-self-test').send({});
    expect(res.status).toBe(401);
  });
});
