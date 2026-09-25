/**
 * Freemium limits — real HTTP flows against a real database.
 *
 * Covers the two documented caps:
 *   FREE: up to 3 pending exchange requests   (was enforced)
 *   FREE: up to 5 active exchanges            (was NOT enforced — checkCanStartExchange
 *                                              had no callers, so accepting was unlimited)
 * plus the Pro escape hatch and the Pro-only boost.
 */
import {
  api,
  signup,
  resetDatabase,
  createSkill,
  prisma,
  type Session,
} from '../helpers/api';

const MESSAGE = 'Hi! I would love to swap skills with you.';

function expectCreated(res: { status: number }) {
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Expected 200/201, got ${res.status}`);
  }
}

/** Registers a user and attaches skills through the public API. */
async function userWithSkills(
  email: string,
  name: string,
  teach: string[],
  want: string[] = []
): Promise<Session> {
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

/** Not `async`: supertest's Test is a thenable, and wrapping it in a Promise
 *  would break `.expect()` chaining. */
function sendRequest(from: Session, to: Session, offered: string, requested: string) {
  return api()
    .post('/api/exchange-requests')
    .set('Cookie', from.cookie)
    .send({ receiverId: to.userId, offeredSkillId: offered, requestedSkillId: requested, message: MESSAGE });
}

function accept(acceptor: Session, requestId: string) {
  return api().post(`/api/exchange-requests/${requestId}/accept`).set('Cookie', acceptor.cookie);
}

async function upgradeToPro(session: Session) {
  // Non-production: the dev upgrade path is intentionally available so the
  // paywall UI can be exercised. Production behaviour is covered by
  // billing-gates.test.ts.
  const res = await api()
    .post('/api/subscription/web')
    .set('Cookie', session.cookie)
    .send({ productKey: 'WEB_MONTHLY' })
    .expect(200);
  expect(res.body.data.tier).toBe('PRO');
}

describe('Freemium limits', () => {
  let python: string;
  let photoshop: string;

  beforeEach(async () => {
    await resetDatabase();
    python = await createSkill('Python');
    photoshop = await createSkill('Photoshop', 'Design');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('caps a FREE user at 3 pending requests, and Pro removes the cap', async () => {
    const sender = await userWithSkills('limit-sender@skillswap.test', 'Sender', [python]);
    const receivers = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        userWithSkills(`limit-recv-${n}@skillswap.test`, `Receiver ${n}`, [photoshop])
      )
    );

    for (const receiver of receivers.slice(0, 3)) {
      await sendRequest(sender, receiver, python, photoshop).expect(expectCreated);
    }

    const fourth = await sendRequest(sender, receivers[3]!, python, photoshop).expect(403);
    expect(fourth.body.error.code).toBe('FORBIDDEN');
    expect(fourth.body.error.message).toMatch(/up to 3 pending requests/i);

    await upgradeToPro(sender);
    await sendRequest(sender, receivers[3]!, python, photoshop).expect(expectCreated);
  });

  it('caps a FREE acceptor at 5 active exchanges, and Pro removes the cap', async () => {
    const acceptor = await userWithSkills('limit-acceptor@skillswap.test', 'Acceptor', [photoshop]);
    const senders = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        userWithSkills(`limit-send-${n}@skillswap.test`, `Sender ${n}`, [python])
      )
    );

    const requestIds: string[] = [];
    for (const sender of senders) {
      const res = await sendRequest(sender, acceptor, python, photoshop).expect(expectCreated);
      requestIds.push(res.body.data.id);
    }

    // First five accepts create ACTIVE exchanges.
    for (const id of requestIds.slice(0, 5)) {
      await accept(acceptor, id).expect(expectCreated);
    }
    expect(
      await prisma.exchange.count({ where: { status: 'ACTIVE', userBId: acceptor.userId } })
    ).toBe(5);

    // The sixth must be refused — this cap was never enforced before.
    const sixth = await accept(acceptor, requestIds[5]!).expect(403);
    expect(sixth.body.error.message).toMatch(/up to 5 active exchanges/i);

    await upgradeToPro(acceptor);
    await accept(acceptor, requestIds[5]!).expect(expectCreated);
  });

  it('refuses an accept when the SENDER is at their exchange limit', async () => {
    const sender = await userWithSkills('limit-heavy@skillswap.test', 'Heavy Sender', [python]);
    const acceptors = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        userWithSkills(`limit-acc-${n}@skillswap.test`, `Acceptor ${n}`, [photoshop])
      )
    );

    // Walk the sender up to 5 active exchanges. Pending requests stop counting
    // once accepted, so the 3-request cap does not get in the way.
    for (const acceptor of acceptors.slice(0, 5)) {
      const res = await sendRequest(sender, acceptor, python, photoshop).expect(expectCreated);
      await accept(acceptor, res.body.data.id).expect(expectCreated);
    }
    expect(
      await prisma.exchange.count({ where: { status: 'ACTIVE', userAId: sender.userId } })
    ).toBe(5);

    const res = await sendRequest(sender, acceptors[5]!, python, photoshop).expect(expectCreated);
    const refused = await accept(acceptors[5]!, res.body.data.id).expect(403);
    expect(refused.body.error.message).toMatch(/sent this request .*active-exchange limit/i);
  });

  it('keeps boost a Pro-only feature', async () => {
    const free = await userWithSkills('limit-boost@skillswap.test', 'Booster', [python]);

    const refused = await api().post('/api/boost').set('Cookie', free.cookie).expect(400);
    expect(refused.body.error.message).toMatch(/Pro feature/i);

    await upgradeToPro(free);
    const boosted = await api().post('/api/boost').set('Cookie', free.cookie).expect(200);
    expect(new Date(boosted.body.data.endsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('gives admins Pro without a subscription', async () => {
    const admin = await signup('limit-admin@skillswap.test', 'Admin');
    await prisma.user.update({ where: { id: admin.userId }, data: { isAdmin: true } });

    const sub = await api().get('/api/subscription').set('Cookie', admin.cookie).expect(200);
    expect(sub.body.data.tier).toBe('PRO');

    await api().post('/api/boost').set('Cookie', admin.cookie).expect(200);
  });

  it('treats an expired subscription as FREE again', async () => {
    const user = await signup('limit-expired@skillswap.test', 'Expired');
    await prisma.subscription.create({
      data: {
        userId: user.userId,
        tier: 'PRO',
        status: 'ACTIVE',
        platform: 'WEB',
        productId: 'skillswap_pro_web_monthly',
        startedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
        autoRenew: false,
      },
    });

    const sub = await api().get('/api/subscription').set('Cookie', user.cookie).expect(200);
    expect(sub.body.data.tier).toBe('FREE');

    await api().post('/api/boost').set('Cookie', user.cookie).expect(400);
  });
});
