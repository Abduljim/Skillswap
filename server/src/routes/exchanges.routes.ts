import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import * as exchangeService from '../services/exchange.service';
import * as sessionService from '../services/session.service';
import * as messageService from '../services/message.service';
import * as reviewService from '../services/review.service';
import { ok } from '../utils/responses';
import { validate } from '../middleware/validate';
import {
  createSessionSchema,
  updateSessionSchema,
  createMessageSchema,
  createReviewSchema,
} from '../validators/schemas';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await exchangeService.listUserExchanges(req.user!.userId);
    ok(res, list);
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const exchange = await exchangeService.getExchange(req.user!.userId, req.params.id);
    ok(res, exchange);
  })
);

router.post(
  '/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await exchangeService.completeExchange(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await exchangeService.cancelExchange(req.user!.userId, req.params.id);
    ok(res, result);
  })
);

// Sessions
router.get(
  '/:id/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await sessionService.listSessions(req.user!.userId, req.params.id);
    ok(res, list);
  })
);

router.post(
  '/:id/sessions',
  requireAuth,
  validate(createSessionSchema),
  asyncHandler(async (req: any, res) => {
    const created = await sessionService.createSession(req.user!.userId, req.params.id, {
      ...req.body,
      scheduledAt: new Date(req.body.scheduledAt),
    });
    ok(res, created);
  })
);

// Messages
router.get(
  '/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await messageService.listMessages(req.user!.userId, req.params.id);
    ok(res, list);
  })
);

router.post(
  '/:id/messages',
  requireAuth,
  validate(createMessageSchema),
  asyncHandler(async (req, res) => {
    const msg = await messageService.createMessage(
      req.user!.userId,
      req.params.id,
      req.body.body,
      req.body.type
    );
    ok(res, msg);
  })
);

// Reviews
router.post(
  '/:id/review',
  requireAuth,
  validate(createReviewSchema),
  asyncHandler(async (req, res) => {
    const review = await reviewService.createReview(req.user!.userId, req.params.id, req.body);
    ok(res, review);
  })
);

export default router;