import { prisma } from '../lib/prisma';
import { NotFoundError } from '../utils/errors';
import { recordProfileView } from './entitlements.service';

export async function getProfile(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: {
      availabilities: true,
      user: {
        select: { id: true, email: true, displayName: true, createdAt: true, isAdmin: true },
      },
    },
  });
  if (!profile) throw new NotFoundError('Profile not found');
  const userSkills = await prisma.userSkill.findMany({
    where: { userId },
    include: { skill: { select: { id: true, name: true, category: true } } },
    orderBy: [{ type: 'asc' }, { skill: { name: 'asc' } }],
  });
  return { ...profile, userSkills };
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
  const { availabilities, ...rest } = input;
  const data: any = { ...rest };
  await prisma.user.update({ where: { id: userId }, data: { displayName: rest.displayName } });

  if (availabilities) {
    await prisma.availability.deleteMany({ where: { profile: { userId } } });
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (profile) {
      await prisma.availability.createMany({
        data: availabilities.map((a) => ({ ...a, profileId: profile.id })),
        skipDuplicates: true,
      });
    }
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