import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updateSessionSchema } from '../validators/schemas';
import * as sessionService from '../services/session.service';
import { ok } from '../utils/responses';

const router = Router();

router.put(
  '/:id',
  requireAuth,
  validate(updateSessionSchema),
  asyncHandler(async (req, res) => {
    const updated = await sessionService.updateSession(req.user!.userId, req.params.id, req.body);
    ok(res, updated);
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sessionService.deleteSession(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

router.post(
  '/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sessionService.completeSession(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

export default router;