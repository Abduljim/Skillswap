import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import * as profileService from '../services/profile.service';
import { ok } from '../utils/responses';
import { validate } from '../middleware/validate';
import { updateProfileSchema } from '../validators/schemas';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await profileService.getProfile(req.user!.userId);
    ok(res, profile);
  })
);

router.put(
  '/',
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const profile = await profileService.updateProfile(req.user!.userId, req.body);
    ok(res, profile);
  })
);

export default router;