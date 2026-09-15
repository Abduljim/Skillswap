import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { userSearchSchema } from '../validators/schemas';
import * as profileService from '../services/profile.service';
import { ok } from '../utils/responses';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../utils/errors';

const router = Router();

router.get(
  '/search',
  requireAuth,
  validate(userSearchSchema, 'query'),
  asyncHandler(async (req: any, res) => {
    const { q, skillId, university, format, page, pageSize, sort } = req.query;
    const userId = req.user!.userId;

    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedUserId: userId }] },
      select: { blockerId: true, blockedUserId: true },
    });
    const blockedIds = blocks.map((b) => (b.blockerId === userId ? b.blockedUserId : b.blockerId));

    const where: any = {
      isActive: true,
      id: { not: userId, notIn: blockedIds },
    };

    if (q) {
      where.displayName = { contains: q, mode: 'insensitive' };
    }
    const profileFilter: any = {};
    if (university) profileFilter.university = { contains: university, mode: 'insensitive' };
    if (format) profileFilter.learningFormat = format;
    if (Object.keys(profileFilter).length > 0) where.profile = profileFilter;
    if (skillId) {
      where.userSkills = { some: { skillId, type: 'TEACH' } };
    }

    const orderBy: any = { createdAt: 'desc' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
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
      prisma.user.count({ where }),
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

    ok(res, { users: enriched, total, page, pageSize });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const user = await profileService.getUserById(req.params.id, req.user.userId);
    ok(res, user);
  })
);

router.get(
  '/:id/reviews',
  requireAuth,
  asyncHandler(async (req, res) => {
    const reviews = await prisma.review.findMany({
      where: { reviewedUserId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewer: { select: { id: true, displayName: true } },
        exchange: {
          select: {
            skillA: { select: { name: true } },
            skillB: { select: { name: true } },
          } as any,
        } as any,
      },
    });
    ok(res, reviews);
  })
);

export default router;