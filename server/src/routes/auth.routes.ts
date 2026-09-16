import { Router } from 'express';
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
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
    ok(res, { user: result.user, token: result.token });
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    setAuthCookie(res, result.token);
    ok(res, { user: result.user, token: result.token });
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
    await authService.requestPasswordReset(req.body.email).catch(() => undefined);
    ok(res, { message: 'If an account exists for that email, you will receive a password reset link.' });
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

router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.changePassword({
      userId: req.user!.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    ok(res, { message: 'Password changed successfully' });
  })
);

export default router;