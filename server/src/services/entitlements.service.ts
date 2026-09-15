// Centralized entitlements — what free and pro users can do

import { prisma } from '../lib/prisma';

export const LIMITS = {
  FREE: {
    activeExchangeRequests: 3, // pending outgoing requests
    exchanges: 5, // active exchanges
    profileViewsCanSee: false, // pro only
    boost: false,
    priorityInMatches: false,
    proBadge: false,
  },
  PRO: {
    activeExchangeRequests: Infinity,
    exchanges: Infinity,
    profileViewsCanSee: true,
    boost: true,
    priorityInMatches: true,
    proBadge: true,
  },
} as const;

export type Tier = 'FREE' | 'PRO';

export async function getUserTier(userId: string): Promise<{ tier: Tier; subscription: any | null }> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { user: false },
  });
  if (!sub) return { tier: 'FREE', subscription: null };
  // Active if status ACTIVE and not expired
  const active =
    sub.status === 'ACTIVE' && (!sub.expiresAt || sub.expiresAt > new Date());
  return {
    tier: active && sub.tier === 'PRO' ? 'PRO' : 'FREE',
    subscription: sub,
  };
}

export function limitsFor(tier: Tier) {
  return LIMITS[tier];
}

export async function checkCanSendRequest(userId: string) {
  const { tier } = await getUserTier(userId);
  const limits = limitsFor(tier);
  if (limits.activeExchangeRequests === Infinity) return { allowed: true };
  const pending = await prisma.exchangeRequest.count({
    where: { senderId: userId, status: 'PENDING' },
  });
  if (pending >= limits.activeExchangeRequests) {
    return {
      allowed: false,
      reason: `Free users can have up to ${limits.activeExchangeRequests} pending requests. Upgrade to Pro for unlimited.`,
    };
  }
  return { allowed: true };
}

export async function checkCanStartExchange(userId: string) {
  const { tier } = await getUserTier(userId);
  const limits = limitsFor(tier);
  if (limits.exchanges === Infinity) return { allowed: true };
  const active = await prisma.exchange.count({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
      status: 'ACTIVE',
    },
  });
  if (active >= limits.exchanges) {
    return {
      allowed: false,
      reason: `Free users can have up to ${limits.exchanges} active exchanges. Upgrade to Pro for unlimited.`,
    };
  }
  return { allowed: true };
}

export async function recordProfileView(viewerId: string, profileId: string) {
  // Don't record self-views or repeated views within 30 minutes
  if (viewerId === profileId) return;
  const recent = await prisma.profileView.findFirst({
    where: {
      viewerId,
      profileId,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
  });
  if (recent) return;
  await prisma.profileView.create({
    data: { viewerId, profileId },
  });
}

export async function listProfileViewers(profileId: string) {
  const { tier } = await getUserTier(profileId);
  if (tier !== 'PRO') return { allowed: false, viewers: [] as any[] };
  const viewers = await prisma.profileView.findMany({
    where: { profileId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      viewer: {
        select: {
          id: true,
          displayName: true,
          profile: { select: { avatarUrl: true, university: true } },
        },
      },
    },
  });
  return {
    allowed: true,
    viewers: viewers.map((v: any) => ({
      id: v.id,
      viewedAt: v.createdAt,
      viewer: v.viewer,
    })),
  };
}