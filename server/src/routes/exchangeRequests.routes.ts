import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createExchangeRequestSchema } from '../validators/schemas';
import * as service from '../services/exchangeRequest.service';
import { ok } from '../utils/responses';

const router = Router();

router.post(
  '/',
  requireAuth,
  validate(createExchangeRequestSchema),
  asyncHandler(async (req: any, res) => {
    const created = await service.createExchangeRequest({
      ...req.body,
      senderId: req.user.userId,
    });
    ok(res, created);
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const type = (req.query.type as 'sent' | 'received') || 'received';
    const list = await service.listRequests(req.user!.userId, type);
    ok(res, list);
  })
);

router.post(
  '/:id/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await service.acceptRequest(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

router.post(
  '/:id/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await service.rejectRequest(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await service.cancelRequest(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

export default router;