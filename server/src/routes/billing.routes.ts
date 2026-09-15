import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as subscriptionService from '../services/subscription.service';
import * as entitlementsService from '../services/entitlements.service';
import { ok } from '../utils/responses';

const router = Router();

router.get(
  '/subscription',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.getMySubscription(req.user!.userId);
    ok(res, sub);
  })
);

const webUpgradeSchema = z.object({
  productKey: z.enum(['WEB_MONTHLY', 'WEB_YEARLY']),
});

router.post(
  '/subscription/web',
  requireAuth,
  validate(webUpgradeSchema),
  asyncHandler(async (req: any, res) => {
    const sub = await subscriptionService.upgradeWeb(req.user.userId, req.body.productKey);
    ok(res, sub);
  })
);

const androidPurchaseSchema = z.object({
  productId: z.string(),
  purchaseToken: z.string().min(5),
  orderId: z.string().optional(),
});

router.post(
  '/subscription/android',
  requireAuth,
  validate(androidPurchaseSchema),
  asyncHandler(async (req: any, res) => {
    const { verifyPlayPurchase } = await import('../services/playBillingVerifier');
    const verification = await verifyPlayPurchase(req.body);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PURCHASE', message: verification.reason || 'Purchase not valid' },
      });
    }
    const sub = await subscriptionService.activateAndroidPurchase({
      userId: req.user.userId,
      ...req.body,
    });
    ok(res, sub);
  })
);

router.post(
  '/subscription/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.cancelSubscription(req.user!.userId);
    ok(res, sub);
  })
);

router.post(
  '/subscription/restore',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await subscriptionService.restorePurchases(req.user!.userId);
    ok(res, result);
  })
);

router.post(
  '/boost',
  requireAuth,
  asyncHandler(async (req, res) => {
    const boost = await subscriptionService.activateBoost(req.user!.userId);
    ok(res, boost);
  })
);

router.get(
  '/profile-views',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await entitlementsService.listProfileViewers(req.user!.userId);
    ok(res, result);
  })
);

export default router;