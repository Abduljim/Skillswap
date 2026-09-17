"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.getUserById = getUserById;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
const entitlements_service_1 = require("./entitlements.service");
const badges_service_1 = require("./badges.service");
const streak_service_1 = require("./streak.service");
async function getProfile(userId) {
    const [profile, tierResult, streak] = await Promise.all([
        prisma_1.prisma.profile.findUnique({
            where: { userId },
            include: {
                availabilities: true,
                user: {
                    select: { id: true, email: true, displayName: true, createdAt: true, isAdmin: true },
                },
            },
        }),
        (0, entitlements_service_1.getUserTier)(userId),
        (0, streak_service_1.readStreak)(userId).catch(() => ({ streak: 0, maxStreak: 0 })),
    ]);
    if (!profile)
        throw new errors_1.NotFoundError('Profile not found');
    const userSkills = await prisma_1.prisma.userSkill.findMany({
        where: { userId },
        include: { skill: { select: { id: true, name: true, category: true } } },
        orderBy: [{ type: 'asc' }, { skill: { name: 'asc' } }],
    });
    const completedCount = await prisma_1.prisma.exchange.count({
        where: { OR: [{ userAId: userId }, { userBId: userId }], status: 'COMPLETED' },
    });
    const ageDays = Math.floor((Date.now() - profile.user.createdAt.getTime()) / 86400000);
    const badges = (0, badges_service_1.computeBadges)({
        tier: tierResult.tier,
        completedExchanges: completedCount,
        ageDays,
    });
    return {
        ...profile,
        bannerStyle: profile.bannerStyle ?? 'cream',
        tier: tierResult.tier,
        badges,
        userSkills,
        streak: streak.streak,
        maxStreak: streak.maxStreak,
    };
}
async function updateProfile(userId, input) {
    const { availabilities, displayName, ...profileFields } = input;
    if (displayName !== undefined) {
        await prisma_1.prisma.user.update({ where: { id: userId }, data: { displayName } });
    }
    const profile = await prisma_1.prisma.profile.findUnique({ where: { userId } });
    if (!profile)
        throw new errors_1.NotFoundError('Profile not found');
    if (Object.keys(profileFields).length > 0) {
        await prisma_1.prisma.profile.update({
            where: { userId },
            data: {
                university: profileFields.university ?? undefined,
                department: profileFields.department ?? undefined,
                yearLevel: profileFields.yearLevel ?? undefined,
                occupation: profileFields.occupation ?? undefined,
                jobTitle: profileFields.jobTitle ?? undefined,
                company: profileFields.company ?? undefined,
                gender: profileFields.gender ?? undefined,
                age: profileFields.age ?? undefined,
                bio: profileFields.bio ?? undefined,
                avatarUrl: profileFields.avatarUrl ?? undefined,
                learningFormat: profileFields.learningFormat ?? undefined,
                avatarFrame: profileFields.avatarFrame ?? undefined,
                bannerStyle: profileFields.bannerStyle ?? undefined,
            },
        });
    }
    if (availabilities) {
        await prisma_1.prisma.availability.deleteMany({ where: { profile: { userId } } });
        await prisma_1.prisma.availability.createMany({
            data: availabilities.map((a) => ({ ...a, profileId: profile.id })),
            skipDuplicates: true,
        });
    }
    return getProfile(userId);
}
async function getUserById(id, viewerId) {
    if (viewerId && viewerId !== id) {
        await (0, entitlements_service_1.recordProfileView)(viewerId, id);
    }
    const user = await prisma_1.prisma.user.findFirst({
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
                    occupation: true,
                    jobTitle: true,
                    company: true,
                    gender: true,
                    age: true,
                    bio: true,
                    avatarUrl: true,
                    learningFormat: true,
                    avatarFrame: true,
                    bannerStyle: true,
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
    if (!user)
        throw new errors_1.NotFoundError('User not found');
    const wantedSkills = await prisma_1.prisma.userSkill.findMany({
        where: { userId: id, type: 'WANT' },
        select: { skill: { select: { id: true, name: true, category: true } } },
    });
    const ratings = user.reviewsReceived.map((r) => r.rating);
    const averageRating = ratings.length
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;
    const completedCount = user._count.exchangesAsA + user._count.exchangesAsB;
    const tierResult = await (0, entitlements_service_1.getUserTier)(id);
    const ageDays = Math.floor((Date.now() - user.createdAt.getTime()) / 86400000);
    const badges = (0, badges_service_1.computeBadges)({
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
        occupation: user.profile?.occupation ?? null,
        jobTitle: user.profile?.jobTitle ?? null,
        company: user.profile?.company ?? null,
        gender: user.profile?.gender ?? null,
        age: user.profile?.age ?? null,
        bio: user.profile?.bio ?? null,
        avatarUrl: user.profile?.avatarUrl ?? null,
        avatarFrame: user.profile?.avatarFrame ?? null,
        bannerStyle: user.profile?.bannerStyle ?? 'cream',
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
//# sourceMappingURL=profile.service.js.map