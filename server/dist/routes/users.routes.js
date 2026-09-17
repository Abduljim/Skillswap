"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const asyncHandler_1 = require("../utils/asyncHandler");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const schemas_1 = require("../validators/schemas");
const profileService = __importStar(require("../services/profile.service"));
const responses_1 = require("../utils/responses");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
router.get('/search', auth_1.requireAuth, (0, validate_1.validate)(schemas_1.userSearchSchema, 'query'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { q, skillId, university, format, page, pageSize, sort } = req.query;
    const userId = req.user.userId;
    const blocks = await prisma_1.prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedUserId: userId }] },
        select: { blockerId: true, blockedUserId: true },
    });
    const blockedIds = blocks.map((b) => (b.blockerId === userId ? b.blockedUserId : b.blockerId));
    const where = {
        isActive: true,
        id: { not: userId, notIn: blockedIds },
    };
    if (q) {
        where.displayName = { contains: q, mode: 'insensitive' };
    }
    const profileFilter = {};
    if (university)
        profileFilter.university = { contains: university, mode: 'insensitive' };
    if (format)
        profileFilter.learningFormat = format;
    if (Object.keys(profileFilter).length > 0)
        where.profile = profileFilter;
    if (skillId) {
        where.userSkills = { some: { skillId, type: 'TEACH' } };
    }
    const orderBy = { createdAt: 'desc' };
    const [users, total] = await Promise.all([
        prisma_1.prisma.user.findMany({
            where,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
                id: true,
                displayName: true,
                createdAt: true,
                profile: {
                    select: {
                        university: true,
                        department: true,
                        yearLevel: true,
                        avatarUrl: true,
                        learningFormat: true,
                    },
                },
                userSkills: {
                    where: { type: 'TEACH' },
                    select: {
                        proficiency: true,
                        skill: { select: { id: true, name: true, category: true } },
                    },
                },
                reviewsReceived: { select: { rating: true } },
                _count: {
                    select: {
                        exchangesAsA: { where: { status: 'COMPLETED' } },
                        exchangesAsB: { where: { status: 'COMPLETED' } },
                    },
                },
            },
        }),
        prisma_1.prisma.user.count({ where }),
    ]);
    const enriched = users.map((u) => {
        const ratings = u.reviewsReceived.map((r) => r.rating);
        const averageRating = ratings.length
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null;
        return {
            id: u.id,
            displayName: u.displayName,
            university: u.profile?.university ?? null,
            department: u.profile?.department ?? null,
            yearLevel: u.profile?.yearLevel ?? null,
            avatarUrl: u.profile?.avatarUrl ?? null,
            learningFormat: u.profile?.learningFormat ?? null,
            teachingSkills: u.userSkills.map((s) => ({ ...s.skill, proficiency: s.proficiency })),
            rating: averageRating,
            completedExchanges: u._count.exchangesAsA + u._count.exchangesAsB,
        };
    });
    (0, responses_1.ok)(res, { users: enriched, total, page, pageSize });
}));
router.get('/:id', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const user = await profileService.getUserById(req.params.id, req.user.userId);
    (0, responses_1.ok)(res, user);
}));
router.get('/:id/reviews', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const reviews = await prisma_1.prisma.review.findMany({
        where: { reviewedUserId: req.params.id },
        orderBy: { createdAt: 'desc' },
        include: {
            reviewer: { select: { id: true, displayName: true } },
            exchange: {
                select: {
                    skillA: { select: { name: true } },
                    skillB: { select: { name: true } },
                },
            },
        },
    });
    (0, responses_1.ok)(res, reviews);
}));
exports.default = router;
//# sourceMappingURL=users.routes.js.map