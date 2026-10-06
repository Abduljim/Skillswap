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

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Clearing the cookie only affects this browser: the JWT itself stays valid
    // until it expires (365d). Bumping tokenVersion revokes it everywhere —
    // including a token that was copied out of a response body or a log.
    await authService.revokeSessions(req.user!.userId);
    clearAuthCookie(res);
    ok(res, { loggedOut: true });
  })
);

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
    // The origin this request arrived on, used only as a fallback base for the
    // reset link when neither RESET_URL nor a usable CLIENT_URL is configured.
    const host = req.get('host');
    const origin = host ? `${req.protocol}://${host}` : undefined;
    await authService.requestPasswordReset(req.body.email, origin).catch(() => undefined);
    ok(res, { message: 'If an account exists for that email, you will receive a password reset link.' });
  })
);

/**
 * The page the reset email links to when there is no web frontend to link to.
 *
 * The link used to point at <api-origin>/reset-password, which is not a route:
 * the mail arrived, the click landed on a JSON 404, and "password reset does
 * not work" was indistinguishable from a mail failure. This page is tiny,
 * same-origin (so the POST needs no CORS), and works from any browser on any
 * phone - no domain required.
 */
router.get('/reset-password', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SkillSwap — choose a new password</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #f5f2ec; color: #12131a; }
  main { max-width: 26rem; margin: 3rem auto; padding: 1.5rem; background: #fff; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  p.sub { margin: 0 0 1.25rem; color: #6b6b70; font-size: .9rem; }
  label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: .9rem; }
  input { display: block; width: 100%; margin-top: .3rem; padding: .7rem .8rem; border: 1px solid #d8d2c6; border-radius: 10px; font-size: 1rem; box-sizing: border-box; }
  button { width: 100%; padding: .8rem; border: 0; border-radius: 12px; background: #fb4f1d; color: #fff; font-size: 1rem; font-weight: 700; }
  #msg { min-height: 1.2rem; font-size: .85rem; margin-top: .9rem; white-space: pre-wrap; }
</style>
</head>
<body>
<main>
  <h1>Choose a new password</h1>
  <p class="sub">For your SkillSwap account. The link works once and expires after an hour.</p>
  <form id="f">
    <label>New password (at least 8 characters)
      <input type="password" id="p" minlength="8" required autocomplete="new-password" />
    </label>
    <label>Type it again
      <input type="password" id="p2" minlength="8" required autocomplete="new-password" />
    </label>
    <button type="submit">Set password</button>
  </form>
  <p id="msg"></p>
</main>
<script>
  var token = new URLSearchParams(location.search).get('token') || '';
  var msg = document.getElementById('msg');
  function say(text, ok) { msg.textContent = text; msg.style.color = ok ? '#178a5c' : '#b3261e'; }
  if (!token) say('This link is missing its token. Request a new one from the app’s login screen.');
  document.getElementById('f').addEventListener('submit', async function (e) {
    e.preventDefault();
    var a = document.getElementById('p').value;
    var b = document.getElementById('p2').value;
    if (a !== b) return say('The two passwords do not match.');
    try {
      var r = await fetch(location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, password: a })
      });
      var j = null;
      try { j = await r.json(); } catch (err) {}
      if (r.ok) say('Password changed. Open SkillSwap and sign in with the new password.', true);
      else say((j && j.error && j.error.message) || 'That link is expired or was already used. Request a new one from the app’s login screen.');
    } catch (err) {
      say('Could not reach SkillSwap. Check your connection and try again.');
    }
  });
</script>
</body>
</html>`);
});

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