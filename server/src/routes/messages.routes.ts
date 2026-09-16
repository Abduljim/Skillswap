import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import * as messageService from '../services/message.service';
import { ok } from '../utils/responses';

const router = Router();

router.get(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await messageService.listConversations(req.user!.userId);
    ok(res, list);
  })
);

export default router;