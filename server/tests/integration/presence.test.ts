/**
 * Presence over REST — the seed data behind the green/red dots in Messages.
 *
 *  1. GET /api/users/presence/partners lists exactly the ACTIVE-exchange
 *     partners with their live online flag (nobody socketed ⇒ all false).
 *  2. GET /api/messages/conversations rows carry partnerOnline.
 *  3. Anonymous callers get 401, not the partner list.
 *  4. A partner without an ACTIVE exchange is not listed (privacy: presence
 *     is only exposed to people you actually chat with).
 *
 * The socket side (live presence:update broadcasts) is covered in
 * calls-signaling.test.ts.
 */
import { api, signup, resetDatabase, prisma, createSkill, type Session } from '../helpers/api';

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

/** Two users with an ACTIVE exchange and one message, as the app creates it. */
async function pairWithExchange() {
  const python = await createSkill('Python (presence test)');
  const guitar = await createSkill('Guitar (presence test)');
  const a = await userWithSkills('presence-a@skillswap.test', 'Ada', [python], [guitar]);
  const b = await userWithSkills('presence-b@skillswap.test', 'Ben', [guitar], [python]);

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

  await api()
    .post(`/api/exchanges/${exchange.id}/messages`)
    .set('Cookie', a.cookie)
    .send({ body: 'Hello Ben!', type: 'TEXT' })
    .expect(200);

  return { a, b, exchangeId: exchange.id };
}

describe('GET /api/users/presence/partners', () => {
  it('refuses anonymous callers', async () => {
    await api().get('/api/users/presence/partners').expect(401);
  });

  it('lists ACTIVE-exchange partners with their online flag', async () => {
    const { a, b } = await pairWithExchange();
    const res = await api()
      .get('/api/users/presence/partners')
      .set('Cookie', a.cookie)
      .expect(200);
    const rows = res.body.data as Array<{ userId: string; online: boolean }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(b.userId);
    // No sockets in a REST test ⇒ honestly offline.
    expect(rows[0].online).toBe(false);
  });

  it('does not leak presence of users without an ACTIVE exchange', async () => {
    const { a } = await pairWithExchange();
    const stranger = await signup('presence-stranger@skillswap.test', 'Stranger');
    const res = await api()
      .get('/api/users/presence/partners')
      .set('Cookie', a.cookie)
      .expect(200);
    const ids = (res.body.data as Array<{ userId: string }>).map((r) => r.userId);
    expect(ids).not.toContain(stranger.userId);
  });
});

describe('conversations carry partnerOnline', () => {
  it('includes the flag on every conversation row', async () => {
    const { b, a } = await pairWithExchange();
    const res = await api()
      .get('/api/messages/conversations')
      .set('Cookie', b.cookie)
      .expect(200);
    const rows = res.body.data as Array<{ partner: { id: string }; partnerOnline: boolean }>;
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.partner.id === a.userId);
    expect(row).toBeDefined();
    expect(row!.partnerOnline).toBe(false);
  });
});
