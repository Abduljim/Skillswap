import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import * as notifService from '../services/notification.service';
import { prisma } from '../lib/prisma';
import { ok } from '../utils/responses';

const router = Router();

// Register a Firebase Cloud Messaging device token for this user so incoming
// calls can ring even when the app isn't open (Android native push).
router.post(
  '/push-token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token || token.length < 20 || token.length > 512) {
      return res.status(400).json({ error: 'A valid push token is required.' });
    }
    const platform = typeof req.body?.platform === 'string' ? req.body.platform.slice(0, 20) : 'android';
    await prisma.pushToken.upsert({
      where: { token },
      create: { token, userId: req.user!.userId, platform },
      update: { userId: req.user!.userId, platform, updatedAt: new Date() },
    });
    ok(res, { registered: true });
  })
);

router.delete(
  '/push-token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (token) {
      await prisma.pushToken.deleteMany({ where: { token, userId: req.user!.userId } });
    }
    ok(res, { unregistered: true });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await notifService.listNotifications(req.user!.userId);
    const unreadCount = list.filter((n) => !n.isRead).length;
    ok(res, { notifications: list, unreadCount });
  })
);

router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const updated = await notifService.markRead(req.user!.userId, req.params.id);
    ok(res, updated);
  })
);

router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await notifService.markAllRead(req.user!.userId);
    ok(res, { updated: result.count });
  })
);

export default router;