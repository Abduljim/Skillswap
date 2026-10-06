/**
 * View-once media — the contract that makes "view once" a behaviour, not a label.
 *
 * Pinned here:
 *  1. The recipient's thread list never carries the URL (bubble shows a chip).
 *  2. The live socket event doesn't carry it either.
 *  3. POST /view hands the URL out exactly once, then answers 410 forever.
 *  4. The sender can always re-check without consuming the view.
 *  5. A stranger gets 403, not the URL.
 *  6. Normal media messages are untouched by all of it.
 *
 * The create path validates mediaUrl against our own bucket, so the stored URL
 * is written straight into the row the way the storage pipeline would — the
 * view-once contract is about *distribution*, not about where bytes live.
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

/** Two users with an ACTIVE exchange, exactly as the app creates one. */
async function pairWithExchange() {
  const python = await createSkill('Python (view-once test)');
  const guitar = await createSkill('Guitar (view-once test)');

  const a = await userWithSkills('vo-a@skillswap.test', 'Ada Once', [python], [guitar]);
  const b = await userWithSkills('vo-b@skillswap.test', 'Ben Once', [guitar], [python]);

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

/** Creates a view-once message and gives the row its stored-file URL. */
async function sendViewOnce(a: Session, exchangeId: string, type: 'IMAGE' | 'VIDEO' | 'AUDIO') {
  const sent = await api()
    .post(`/api/exchanges/${exchangeId}/messages`)
    .set('Cookie', a.cookie)
    .send({ body: 'view-once placeholder', type, viewOnce: true, mediaBytes: 4321 })
    .expect(200);
  const id: string = sent.body.data.id;
  await prisma.message.update({
    where: { id },
    data: {
      mediaUrl: `https://fake-project.supabase.co/storage/v1/object/public/skillswap-media/x/${id}.bin`,
      thumbUrl: `https://fake-project.supabase.co/storage/v1/object/public/skillswap-media/x/${id}-t.bin`,
    },
  });
  return id;
}

describe('View-once media', () => {
  it('hides the URL from the recipient thread but keeps it for the sender', async () => {
    const { a, b, exchangeId } = await pairWithExchange();
    const id = await sendViewOnce(a, exchangeId, 'IMAGE');

    const forB = await api().get(`/api/exchanges/${exchangeId}/messages`).set('Cookie', b.cookie).expect(200);
    const seen = forB.body.data.find((m: any) => m.id === id);
    expect(seen).toBeDefined();
    expect(seen.viewOnce).toBe(true);
    expect(seen.mediaUrl).toBeNull();
    expect(seen.thumbUrl).toBeNull();
    expect(seen.mediaViewedAt).toBeNull();

    const forA = await api().get(`/api/exchanges/${exchangeId}/messages`).set('Cookie', a.cookie).expect(200);
    const mine = forA.body.data.find((m: any) => m.id === id);
    expect(mine.mediaUrl).not.toBeNull();
  });

  it('hides the URL in the conversations list too', async () => {
    const { a, b, exchangeId } = await pairWithExchange();
    await sendViewOnce(a, exchangeId, 'VIDEO');

    const list = await api().get('/api/messages/conversations').set('Cookie', b.cookie).expect(200);
    const row = list.body.data.find((c: any) => c.exchangeId === exchangeId);
    expect(row.lastMessage.viewOnce).toBe(true);
    expect(row.lastMessage.mediaUrl).toBeNull();
    expect(row.lastMessage.thumbUrl).toBeNull();
  });

  it('hands the URL out exactly once, then answers 410 forever', async () => {
    const { a, b, exchangeId } = await pairWithExchange();
    const id = await sendViewOnce(a, exchangeId, 'AUDIO');

    const first = await api()
      .post(`/api/exchanges/${exchangeId}/messages/${id}/view`)
      .set('Cookie', b.cookie)
      .expect(200);
    expect(first.body.data.url).toMatch(/\.bin$/);
    expect(first.body.data.viewedAt).not.toBeNull();

    const second = await api()
      .post(`/api/exchanges/${exchangeId}/messages/${id}/view`)
      .set('Cookie', b.cookie);
    expect(second.status).toBe(410);
    expect(second.body.error?.code ?? second.body.code).toBe('VIEW_ONCE_ALREADY_VIEWED');

    // The sender's thread now shows the opened state.
    const forA = await api().get(`/api/exchanges/${exchangeId}/messages`).set('Cookie', a.cookie).expect(200);
    expect(forA.body.data.find((m: any) => m.id === id).mediaViewedAt).not.toBeNull();
  });

  it('lets the sender re-check without consuming the view', async () => {
    const { a, exchangeId } = await pairWithExchange();
    const id = await sendViewOnce(a, exchangeId, 'IMAGE');

    const once = await api()
      .post(`/api/exchanges/${exchangeId}/messages/${id}/view`)
      .set('Cookie', a.cookie)
      .expect(200);
    expect(once.body.data.url).toMatch(/\.bin$/);

    const twice = await api()
      .post(`/api/exchanges/${exchangeId}/messages/${id}/view`)
      .set('Cookie', a.cookie)
      .expect(200);
    expect(twice.body.data.url).toMatch(/\.bin$/);
  });

  it('refuses a stranger', async () => {
    const { a, exchangeId } = await pairWithExchange();
    const id = await sendViewOnce(a, exchangeId, 'IMAGE');
    const stranger = await signup('vo-stranger@skillswap.test', 'Eve Stranger');

    const res = await api()
      .post(`/api/exchanges/${exchangeId}/messages/${id}/view`)
      .set('Cookie', stranger.cookie);
    expect(res.status).toBe(403);
  });

  it('answers 404 for a message that is not in the exchange', async () => {
    const { b, exchangeId } = await pairWithExchange();
    const res = await api()
      .post(`/api/exchanges/${exchangeId}/messages/11111111-1111-4111-8111-111111111111/view`)
      .set('Cookie', b.cookie);
    expect(res.status).toBe(404);
  });

  it('leaves normal media messages alone', async () => {
    const { a, b, exchangeId } = await pairWithExchange();
    const sent = await api()
      .post(`/api/exchanges/${exchangeId}/messages`)
      .set('Cookie', a.cookie)
      .send({ body: 'plain text', type: 'TEXT' })
      .expect(200);
    expect(sent.body.data.viewOnce).toBe(false);

    const list = await api().get(`/api/exchanges/${exchangeId}/messages`).set('Cookie', b.cookie).expect(200);
    expect(list.body.data.find((m: any) => m.id === sent.body.data.id).viewOnce).toBe(false);
  });
});
