import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { matchQuerySchema } from '../validators/schemas';
import * as matchService from '../services/match.service';
import { ok } from '../utils/responses';

const router = Router();

router.get(
  '/',
  requireAuth,
  validate(matchQuerySchema, 'query'),
  asyncHandler(async (req: any, res) => {
    const result = await matchService.getMatchesForUser(req.user!.userId, req.query);
    ok(res, result);
  })
);

router.get(
  '/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const detail = await matchService.getMatchDetail(req.user!.userId, req.params.userId);
    ok(res, detail);
  })
);

export default router;