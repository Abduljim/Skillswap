"use strict";
// Centralized entitlements — what free and pro users can do
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIMITS = void 0;
exports.getUserTier = getUserTier;
exports.limitsFor = limitsFor;
exports.checkCanSendRequest = checkCanSendRequest;
exports.checkCanStartExchange = checkCanStartExchange;
exports.recordProfileView = recordProfileView;
exports.listProfileViewers = listProfileViewers;
const prisma_1 = require("../lib/prisma");
exports.LIMITS = {
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
};
async function getUserTier(userId) {
    const [sub, user] = await Promise.all([
        prisma_1.prisma.subscription.findUnique({ where: { userId } }),
        prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
    ]);
    const isAdmin = user?.isAdmin ?? false;
    // Admins always get Pro/Premium for free (operator perk).
    if (isAdmin)
        return { tier: 'PRO', subscription: sub, isAdmin };
    if (!sub)
        return { tier: 'FREE', subscription: null, isAdmin };
    // Active if status ACTIVE and not expired
    const active = sub.status === 'ACTIVE' && (!sub.expiresAt || sub.expiresAt > new Date());
    return {
        tier: active && sub.tier === 'PRO' ? 'PRO' : 'FREE',
        subscription: sub,
        isAdmin,
    };
}
function limitsFor(tier) {
    return exports.LIMITS[tier];
}
async function checkCanSendRequest(userId) {
    const { tier } = await getUserTier(userId);
    const limits = limitsFor(tier);
    if (limits.activeExchangeRequests === Infinity)
        return { allowed: true };
    const pending = await prisma_1.prisma.exchangeRequest.count({
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
async function checkCanStartExchange(userId) {
    const { tier } = await getUserTier(userId);
    const limits = limitsFor(tier);
    if (limits.exchanges === Infinity)
        return { allowed: true };
    const active = await prisma_1.prisma.exchange.count({
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
async function recordProfileView(viewerId, profileId) {
    // Don't record self-views or repeated views within 30 minutes
    if (viewerId === profileId)
        return;
    const recent = await prisma_1.prisma.profileView.findFirst({
        where: {
            viewerId,
            profileId,
            createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
    });
    if (recent)
        return;
    await prisma_1.prisma.profileView.create({
        data: { viewerId, profileId },
    });
}
async function listProfileViewers(profileId) {
    const { tier } = await getUserTier(profileId);
    if (tier !== 'PRO')
        return { allowed: false, viewers: [] };
    const viewers = await prisma_1.prisma.profileView.findMany({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
            viewer: {
                select: {
                    id: true,
                    displayName: true,
                    profile: { select: { avatarUrl: true, avatarFrame: true, university: true } },
                },
            },
        },
    });
    return {
        allowed: true,
        viewers: viewers.map((v) => ({
            id: v.id,
            viewedAt: v.createdAt,
            viewer: v.viewer,
        })),
    };
}
//# sourceMappingURL=entitlements.service.js.map