import { prisma } from '../lib/prisma';
import { NotFoundError } from '../utils/errors';
import { recordProfileView, getUserTier } from './entitlements.service';
import { computeBadges } from './badges.service';

export async function getProfile(userId: string) {
  const [profile, tierResult] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      include: {
        availabilities: true,
        user: {
          select: { id: true, email: true, displayName: true, createdAt: true, isAdmin: true },
        },
      },
    }),
    getUserTier(userId),
  ]);
  if (!profile) throw new NotFoundError('Profile not found');
  const userSkills = await prisma.userSkill.findMany({
    where: { userId },
    include: { skill: { select: { id: true, name: true, category: true } } },
    orderBy: [{ type: 'asc' }, { skill: { name: 'asc' } }],
  });
  const completedCount = await prisma.exchange.count({
    where: { OR: [{ userAId: userId }, { userBId: userId }], status: 'COMPLETED' },
  });
  const ageDays = Math.floor((Date.now() - profile.user.createdAt.getTime()) / 86400000);
  const badges = computeBadges({
    tier: tierResult.tier,
    completedExchanges: completedCount,
    ageDays,
  });
  return { ...profile, tier: tierResult.tier, badges, userSkills };
}

export async function updateProfile(
  userId: string,
  input: {
    displayName?: string;
    university?: string | null;
    department?: string | null;
    yearLevel?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    learningFormat?: 'ONLINE' | 'IN_PERSON' | 'EITHER';
    availabilities?: { weekday: any; timeOfDay: any }[];
  }
) {
  const { availabilities, displayName, ...profileFields } = input;

  if (displayName !== undefined) {
    await prisma.user.update({ where: { id: userId }, data: { displayName } });
  }

  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError('Profile not found');

  if (Object.keys(profileFields).length > 0) {
    await prisma.profile.update({
      where: { userId },
      data: {
        university: profileFields.university ?? undefined,
        department: profileFields.department ?? undefined,
        yearLevel: profileFields.yearLevel ?? undefined,
        bio: profileFields.bio ?? undefined,
        avatarUrl: profileFields.avatarUrl ?? undefined,
        learningFormat: profileFields.learningFormat ?? undefined,
      },
    });
  }

  if (availabilities) {
    await prisma.availability.deleteMany({ where: { profile: { userId } } });
    await prisma.availability.createMany({
      data: availabilities.map((a) => ({ ...a, profileId: profile.id })),
      skipDuplicates: true,
    });
  }

  return getProfile(userId);
}

export async function getUserById(id: string, viewerId?: string) {
  if (viewerId && viewerId !== id) {
    await recordProfileView(viewerId, id);
  }
  const user = await prisma.user.findFirst({
    where: { id, isActive: true },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      profile: {
        select: {
          university: true,
          department: true,
          yearLevel: true,
          bio: true,
          avatarUrl: true,
          learningFormat: true,
          availabilities: true,
        },
      },
      userSkills: {
        where: { type: 'TEACH' },
        select: {
          proficiency: true,
          skill: { select: { id: true, name: true, category: true } },
        },
      },
      reviewsReceived: {
        select: { rating: true },
      },
      _count: {
        select: {
          exchangesAsA: { where: { status: 'COMPLETED' } },
          exchangesAsB: { where: { status: 'COMPLETED' } },
        },
      },
    },
  });
  if (!user) throw new NotFoundError('User not found');

  const wantedSkills = await prisma.userSkill.findMany({
    where: { userId: id, type: 'WANT' },
    select: { skill: { select: { id: true, name: true, category: true } } },
  });

  const ratings = user.reviewsReceived.map((r) => r.rating);
  const averageRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;

  const completedCount = user._count.exchangesAsA + user._count.exchangesAsB;
  const tierResult = await getUserTier(id);
  const ageDays = Math.floor((Date.now() - user.createdAt.getTime()) / 86400000);
  const badges = computeBadges({
    tier: tierResult.tier,
    completedExchanges: completedCount,
    ageDays,
  });

  return {
    id: user.id,
    displayName: user.displayName,
    university: user.profile?.university ?? null,
    department: user.profile?.department ?? null,
    yearLevel: user.profile?.yearLevel ?? null,
    bio: user.profile?.bio ?? null,
    avatarUrl: user.profile?.avatarUrl ?? null,
    learningFormat: user.profile?.learningFormat ?? null,
    availabilities: user.profile?.availabilities ?? [],
    tier: tierResult.tier,
    badges,
    teachingSkills: user.userSkills.map((s) => ({
      ...s.skill,
      proficiency: s.proficiency,
    })),
    wantedSkills: wantedSkills.map((w) => w.skill),
    rating: averageRating,
    reviewsCount: ratings.length,
    completedExchanges: completedCount,
  };
}