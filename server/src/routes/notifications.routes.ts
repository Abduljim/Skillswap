import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import * as notifService from '../services/notification.service';
import { ok } from '../utils/responses';

const router = Router();

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