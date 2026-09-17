"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchesForUser = getMatchesForUser;
exports.getMatchDetail = getMatchDetail;
const prisma_1 = require("../lib/prisma");
const matching_service_1 = require("./matching.service");
const subscription_service_1 = require("./subscription.service");
async function getMatchesForUser(userId, filters) {
    const minScore = filters.minScore ?? 40;
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    // Get block lists for the viewer
    const blocks = await prisma_1.prisma.block.findMany({
        where: {
            OR: [{ blockerId: userId }, { blockedUserId: userId }],
        },
        select: { blockerId: true, blockedUserId: true },
    });
    const blockedUserIds = new Set();
    blocks.forEach((b) => {
        blockedUserIds.add(b.blockerId === userId ? b.blockedUserId : b.blockerId);
    });
    // Viewer profile + skills
    const viewer = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            isActive: true,
            profile: {
                select: {
                    university: true,
                    learningFormat: true,
                    availabilities: { select: { weekday: true, timeOfDay: true } },
                },
            },
            userSkills: {
                select: {
                    type: true,
                    skill: { select: { id: true, name: true, category: true } },
                },
            },
        },
    });
    if (!viewer)
        return { matches: [], total: 0, page, pageSize };
    const viewerInput = {
        id: viewer.id,
        isActive: viewer.isActive,
        profile: viewer.profile
            ? {
                university: viewer.profile.university,
                learningFormat: viewer.profile.learningFormat,
                availabilities: viewer.profile.availabilities,
            }
            : null,
        teachingSkills: viewer.userSkills
            .filter((s) => s.type === 'TEACH')
            .map((s) => s.skill),
        wantedSkills: viewer.userSkills
            .filter((s) => s.type === 'WANT')
            .map((s) => s.skill),
    };
    // Candidate users
    const candidateWhere = {
        isActive: true,
        id: { not: userId, notIn: Array.from(blockedUserIds) },
    };
    if (filters.university) {
        candidateWhere.profile = {
            ...(candidateWhere.profile || {}),
            university: { contains: filters.university, mode: 'insensitive' },
        };
    }
    if (filters.format) {
        candidateWhere.profile = {
            ...(candidateWhere.profile || {}),
            learningFormat: filters.format,
        };
    }
    if (filters.skillId) {
        candidateWhere.userSkills = {
            some: { skillId: filters.skillId, type: 'TEACH' },
        };
    }
    const candidates = await prisma_1.prisma.user.findMany({
        where: candidateWhere,
        select: {
            id: true,
            isActive: true,
            profile: {
                select: {
                    university: true,
                    learningFormat: true,
                    availabilities: { select: { weekday: true, timeOfDay: true } },
                },
            },
            userSkills: {
                select: {
                    type: true,
                    skill: { select: { id: true, name: true, category: true } },
                },
            },
        },
        take: 200,
    });
    // Get active boosts to slightly boost Pro users in sort
    const boostSet = await (0, subscription_service_1.activeBoosts)();
    // Get all candidate user tiers
    const candidateSubs = await prisma_1.prisma.subscription.findMany({
        where: { userId: { in: candidates.map((c) => c.id) } },
    });
    const tierMap = new Map(candidateSubs.map((s) => [
        s.userId,
        s.status === 'ACTIVE' && (!s.expiresAt || s.expiresAt > new Date()) && s.tier === 'PRO' ? 'PRO' : 'FREE',
    ]));
    const scores = candidates
        .map((c) => {
        const candidateInput = {
            id: c.id,
            isActive: c.isActive,
            profile: c.profile
                ? {
                    university: c.profile.university,
                    learningFormat: c.profile.learningFormat,
                    availabilities: c.profile.availabilities,
                }
                : null,
            teachingSkills: c.userSkills.filter((s) => s.type === 'TEACH').map((s) => s.skill),
            wantedSkills: c.userSkills.filter((s) => s.type === 'WANT').map((s) => s.skill),
        };
        const ms = (0, matching_service_1.calculateMatchScore)(viewerInput, candidateInput);
        const category = (0, matching_service_1.matchCategory)(ms.score);
        // Tiny boost for active boost (preserves determinism while making boost meaningful)
        const boost = boostSet.has(c.id) ? 0.5 : 0;
        const adjusted = Math.min(100, ms.score + boost);
        return {
            ...ms,
            score: adjusted,
            category,
            isBoosted: boostSet.has(c.id),
            tier: tierMap.get(c.id) === 'PRO' ? 'PRO' : 'FREE',
        };
    })
        .filter((m) => m.score >= minScore)
        .sort((a, b) => {
        // Pro-boosted users sort first when within 5 score points
        if (Math.abs(b.score - a.score) < 5 && a.isBoosted && !b.isBoosted)
            return 1;
        if (Math.abs(b.score - a.score) < 5 && !a.isBoosted && b.isBoosted)
            return -1;
        return b.score - a.score;
    });
    // Hydrate with profile basics
    const userIds = scores.map((s) => s.userId);
    const profiles = await prisma_1.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
            id: true,
            displayName: true,
            profile: {
                select: { avatarUrl: true, avatarFrame: true, university: true, department: true, learningFormat: true },
            },
            reviewsReceived: { select: { rating: true } },
            _count: {
                select: {
                    exchangesAsA: { where: { status: 'COMPLETED' } },
                    exchangesAsB: { where: { status: 'COMPLETED' } },
                },
            },
        },
    });
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const total = scores.length;
    const paginated = scores.slice((page - 1) * pageSize, page * pageSize);
    const enriched = paginated.map((m) => {
        const p = profileMap.get(m.userId);
        const ratings = p?.reviewsReceived.map((r) => r.rating) ?? [];
        const avg = ratings.length
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null;
        return {
            ...m,
            displayName: p?.displayName ?? null,
            avatarUrl: p?.profile?.avatarUrl ?? null,
            avatarFrame: p?.profile?.avatarFrame ?? null,
            university: p?.profile?.university ?? null,
            department: p?.profile?.department ?? null,
            learningFormat: p?.profile?.learningFormat ?? null,
            rating: avg,
            completedExchanges: (p?._count.exchangesAsA ?? 0) + (p?._count.exchangesAsB ?? 0),
            isBoosted: m.isBoosted,
        };
    });
    return { matches: enriched, total, page, pageSize };
}
async function getMatchDetail(viewerId, otherId) {
    const result = await getMatchesForUser(viewerId, {
        minScore: 0,
        pageSize: 100,
    });
    const found = result.matches.find((m) => m.userId === otherId);
    return found || null;
}
//# sourceMappingURL=match.service.js.map