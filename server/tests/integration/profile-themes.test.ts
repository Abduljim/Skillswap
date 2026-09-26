/**
 * Profile looks — one free look, five Pro looks, enforced on the server.
 *
 * A "look" is the colour field behind the profile header (`bannerStyle`); a
 * "card" is the ring around the avatar (`avatarFrame`). They used to be a single
 * choice driving both, which is why the profile and the profile card looked
 * identical. These tests drive PUT /api/profile directly so the locked picker is
 * not the boundary, and the last one pins the split itself: changing one must
 * never change the other.
 *
 * Legacy compatibility is covered too — `bannerStyle` existed for a long time as
 * an unused nine-colour enum, so rows and old APKs may still carry those values.
 */
import { api, signup, resetDatabase, prisma, type Session } from '../helpers/api';

const PRO_LOOKS = ['terracotta', 'verdant', 'cobalt', 'mulberry', 'copper'];
const FREE_LOOK = 'cream';
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

async function stored(userId: string): Promise<{ bannerStyle: string | null; avatarFrame: string | null }> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { bannerStyle: true, avatarFrame: true },
  });
  return { bannerStyle: profile?.bannerStyle ?? null, avatarFrame: profile?.avatarFrame ?? null };
}

function saveLook(session: Session, bannerStyle: string) {
  return api().put('/api/profile').set('Cookie', session.cookie).send({ bannerStyle });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Profile looks', () => {
  it('gives every new user the free look', async () => {
    const user = await signup('looks-new@skillswap.test', 'New User');
    expect((await stored(user.userId)).bannerStyle).toBe(FREE_LOOK);
  });

  it('lets a free user save the free look', async () => {
    const user = await signup('looks-free@skillswap.test', 'Free User');
    await saveLook(user, FREE_LOOK).expect(200);
    expect((await stored(user.userId)).bannerStyle).toBe(FREE_LOOK);
  });

  it('refuses every premium look on a free account', async () => {
    const user = await signup('looks-blocked@skillswap.test', 'Free User');
    for (const look of PRO_LOOKS) {
      const res = await saveLook(user, look).expect(403);
      expect(res.body.error.message).toMatch(/pro perk/i);
      expect((await stored(user.userId)).bannerStyle).toBe(FREE_LOOK);
    }
  });

  it('unlocks all five premium looks once the user is Pro', async () => {
    const user = await signup('looks-pro@skillswap.test', 'Pro User');
    await upgradeToPro(user);
    for (const look of PRO_LOOKS) {
      await saveLook(user, look).expect(200);
      expect((await stored(user.userId)).bannerStyle).toBe(look);
    }
  });

  it('refuses a premium look once Pro lapses', async () => {
    const user = await signup('looks-lapsed@skillswap.test', 'Lapsed Pro');
    await upgradeToPro(user);
    await saveLook(user, 'cobalt').expect(200);
    expect((await stored(user.userId)).bannerStyle).toBe('cobalt');

    await prisma.subscription.updateMany({
      where: { userId: user.userId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await saveLook(user, 'mulberry').expect(403);
    expect(res.body.error.message).toMatch(/pro perk/i);
    // The lapsed save must not have half-applied.
    expect((await stored(user.userId)).bannerStyle).toBe('cobalt');
  });

  it('normalises the retired nine-colour bannerStyle values', async () => {
    const user = await signup('looks-legacy@skillswap.test', 'Legacy Row');
    for (const legacy of ['purple', 'blue', 'teal', 'orange', 'pink', 'gold', 'indigo', 'green']) {
      await saveLook(user, legacy).expect(200);
      expect((await stored(user.userId)).bannerStyle).toBe(FREE_LOOK);
    }
  });

  it('rejects a look id that does not exist', async () => {
    const user = await signup('looks-unknown@skillswap.test', 'Unknown Look');
    const res = await saveLook(user, 'chartreuse').expect(400);
    expect(JSON.stringify(res.body)).toMatch(/bannerStyle/i);
    expect((await stored(user.userId)).bannerStyle).toBe(FREE_LOOK);
  });

  it('keeps the look and the card independent in both directions', async () => {
    const user = await signup('looks-split@skillswap.test', 'Split Check');
    await upgradeToPro(user);

    // Choose a card, then a look: the card must survive.
    await api().put('/api/profile').set('Cookie', user.cookie).send({ avatarFrame: 'aurum' }).expect(200);
    expect(await stored(user.userId)).toEqual({ bannerStyle: FREE_LOOK, avatarFrame: 'aurum' });

    await saveLook(user, 'verdant').expect(200);
    expect(await stored(user.userId)).toEqual({ bannerStyle: 'verdant', avatarFrame: 'aurum' });

    // And the other way round: choosing a card must not repaint the header.
    await api().put('/api/profile').set('Cookie', user.cookie).send({ avatarFrame: 'nova' }).expect(200);
    expect(await stored(user.userId)).toEqual({ bannerStyle: 'verdant', avatarFrame: 'nova' });

    // Saving both in one request is still two independent fields.
    await api()
      .put('/api/profile')
      .set('Cookie', user.cookie)
      .send({ avatarFrame: FREE_CARD, bannerStyle: FREE_LOOK })
      .expect(200);
    expect(await stored(user.userId)).toEqual({ bannerStyle: FREE_LOOK, avatarFrame: FREE_CARD });
  });

  it('gates the look and the card separately for a free user', async () => {
    // A free user who is refused a Pro look must still be able to save a free
    // card in the same breath, and vice versa — one refusal cannot poison the
    // other field.
    const user = await signup('looks-mixed@skillswap.test', 'Mixed Gate');
    await api()
      .put('/api/profile')
      .set('Cookie', user.cookie)
      .send({ avatarFrame: FREE_CARD, bannerStyle: 'copper' })
      .expect(403);
    expect(await stored(user.userId)).toEqual({ bannerStyle: FREE_LOOK, avatarFrame: FREE_CARD });
  });
});
