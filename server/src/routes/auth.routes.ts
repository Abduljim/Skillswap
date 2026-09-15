import { Router } from 'express';
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/schemas';
import { validate } from '../middleware/validate';
import * as authService from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';
import { setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth';
import { ok } from '../utils/responses';

const router = Router();

router.post(
  '/signup',
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.signup(req.body);
    setAuthCookie(res, result.token);
    ok(res, { user: result.user });
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    setAuthCookie(res, result.token);
    ok(res, { user: result.user });
  })
);

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  ok(res, { loggedOut: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = await authService.getMe(req.user!.userId);
    ok(res, me);
  })
);

router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.requestPasswordReset(req.body.email);
    ok(res, { message: 'If the email exists, a reset link has been sent.' });
  })
);

router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.password);
    ok(res, { message: 'Password reset successfully' });
  })
);

export default router;