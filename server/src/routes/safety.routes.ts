import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createReportSchema } from '../validators/schemas';
import * as safetyService from '../services/safety.service';
import { ok } from '../utils/responses';

const router = Router();

router.post(
  '/reports',
  requireAuth,
  validate(createReportSchema),
  asyncHandler(async (req, res) => {
    const report = await safetyService.reportUser(req.user!.userId, req.body);
    ok(res, report);
  })
);

router.post(
  '/users/:id/block',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await safetyService.blockUser(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

router.delete(
  '/users/:id/block',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await safetyService.unblockUser(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

export default router;