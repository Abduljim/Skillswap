/**
 * Profile cards — one free card, five Pro cards, enforced on the server.
 *
 * The client locks the premium cards in the picker, but the picker is not the
 * boundary: these tests drive PUT /api/profile directly so a modified client
 * cannot save a premium card on a free account. They also pin the backwards
 * compatibility rule for the retired PNG frames (`frame_0`..`frame_11`) that
 * older installed APKs still send.
 */
import { api, signup, resetDatabase, prisma, type Session } from '../helpers/api';

const PRO_CARDS = ['aurum', 'diamond', 'nova', 'inferno', 'sovereign'];
const FREE_CARD = 'linen';

async function upgradeToPro(session: Session) {
  // Non-production only: the dev upgrade path exists so the paywall UI can be
  // exercised. Production behaviour is covered by billing-gates.test.ts.
  await api()
    .post('/api/subscription/web')
    .set('Cookie', session.cookie)
    .send({ productKey: 'WEB_MONTHLY' })
    .expect(200);
}

async function storedCard(userId: string): Promise<string | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { avatarFrame: true },
  });
  return profile?.avatarFrame ?? null;
}

function saveCard(session: Session, avatarFrame: string) {
  return api().put('/api/profile').set('Cookie', session.cookie).send({ avatarFrame });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Profile cards', () => {
  it('gives every new user the free card', async () => {
    const user = await signup('cards-new@skillswap.test', 'New User');
    expect(await storedCard(user.userId)).toBe(FREE_CARD);
  });

  it('lets a free user save the free card', async () => {
    const user = await signup('cards-free@skillswap.test', 'Free User');
    await saveCard(user, FREE_CARD).expect(200);
    expect(await storedCard(user.userId)).toBe(FREE_CARD);
  });

  it('refuses every premium card on a free account', async () => {
    const user = await signup('cards-blocked@skillswap.test', 'Free User');
    for (const card of PRO_CARDS) {
      const res = await saveCard(user, card).expect(403);
      expect(res.body.error.message).toMatch(/pro perk/i);
      expect(await storedCard(user.userId)).toBe(FREE_CARD);
    }
  });

  it('unlocks all five premium cards once the user is Pro', async () => {
    const user = await signup('cards-pro@skillswap.test', 'Pro User');
    await upgradeToPro(user);
    for (const card of PRO_CARDS) {
      await saveCard(user, card).expect(200);
      expect(await storedCard(user.userId)).toBe(card);
    }
  });

  it('refuses a premium card once Pro lapses', async () => {
    const user = await signup('cards-lapsed@skillswap.test', 'Lapsed Pro');
    await upgradeToPro(user);
    await saveCard(user, 'sovereign').expect(200);
    expect(await storedCard(user.userId)).toBe('sovereign');

    // Subscription expires → the gate must refuse further premium saves.
    await prisma.subscription.updateMany({
      where: { userId: user.userId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await saveCard(user, 'aurum').expect(403);
    expect(res.body.error.message).toMatch(/pro perk/i);
  });

  it('normalises the retired PNG frame ids older APKs still send', async () => {
    const user = await signup('cards-legacy@skillswap.test', 'Legacy APK');
    for (const legacy of ['default', 'frame_0', 'frame_7', 'frame_11']) {
      await saveCard(user, legacy).expect(200);
      expect(await storedCard(user.userId)).toBe(FREE_CARD);
    }
  });

  it('rejects a card id that does not exist', async () => {
    const user = await signup('cards-unknown@skillswap.test', 'Unknown Card');
    const res = await saveCard(user, 'frame_99').expect(400);
    expect(JSON.stringify(res.body)).toMatch(/avatarFrame/i);
    expect(await storedCard(user.userId)).toBe(FREE_CARD);
  });
});
