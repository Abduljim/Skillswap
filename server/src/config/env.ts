import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '365d',
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  // Optional comma-separated extra origins (e.g. a marketing site or a second web host).
  EXTRA_ALLOWED_ORIGINS: process.env.EXTRA_ALLOWED_ORIGINS || '',
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:4000',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'dev-cookie-secret-change-me',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '',
  ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME || 'app.skillswap.client',
  PLAY_BILLING_VERIFY: process.env.PLAY_BILLING_VERIFY || 'false',
  // Grants PRO from POST /api/subscription/web with no payment provider.
  // Unset = allowed in development (so the paywall UI can be exercised),
  // refused in production. Set "true" to open it in production, "false" to
  // close it everywhere.
  ENABLE_WEB_BILLING: process.env.ENABLE_WEB_BILLING || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  EMAIL_FROM: process.env.EMAIL_FROM || '',
  RESET_URL: process.env.RESET_URL || '',
  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY || '',
  FCM_SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON || '',

  // ── TURN relay for calls ────────────────────────────────────────────────
  // Server-side on purpose. GET /api/calls/ice-servers mints a short-lived
  // credential from TURN_SECRET per request, so the secret never ships inside
  // the web bundle or the APK — a static VITE_TURN_CREDENTIAL would be readable
  // by anyone who unpacks the app, who could then relay their own traffic on our
  // bandwidth. See docs/TURN.md for standing up coturn for free.
  TURN_URLS: process.env.TURN_URLS || '',
  /** coturn `static-auth-secret`. When set, credentials are minted per request. */
  TURN_SECRET: process.env.TURN_SECRET || '',
  TURN_REALM: process.env.TURN_REALM || 'skillswap',
  /** Lifetime of a minted credential. coturn re-checks it on every refresh, so
   *  it must outlive the whole call, not just the allocation. */
  TURN_TTL_SECONDS: parseInt(process.env.TURN_TTL_SECONDS || '3600', 10),
  /** Static credentials for providers without HMAC support (Xirsys, Metered).
   *  Used only when TURN_SECRET is empty. */
  TURN_USERNAME: process.env.TURN_USERNAME || '',
  TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',

  // ── Group calls ─────────────────────────────────────────────────────────
  // Mesh: every participant uploads one stream per other participant, so cost
  // and CPU grow with n*(n-1). Capped, and groups start audio-only.
  MAX_GROUP_CALL_PARTICIPANTS: parseInt(process.env.MAX_GROUP_CALL_PARTICIPANTS || '4', 10),
};

if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
// ---------------------------------------------------------------------------
// Derived configuration
// ---------------------------------------------------------------------------

export const isProduction = env.NODE_ENV === 'production';

/**
 * POST /api/subscription/web grants PRO without a payment provider.
 * Off in production unless explicitly enabled — otherwise Pro is free for
 * anyone with a session cookie (including Android users, bypassing Play Billing).
 */
export const webBillingEnabled =
  env.ENABLE_WEB_BILLING === 'true' || (!isProduction && env.ENABLE_WEB_BILLING !== 'false');

/** Real Google Play receipt verification. Required in production. */
export const playVerificationEnabled = env.PLAY_BILLING_VERIFY === 'true';

/**
 * Explicit CORS allowlist. Never reflects an arbitrary Origin while credentials
 * are enabled — that would let any website drive a logged-in session.
 *
 * Capacitor origins are always allowed because the Android WebView loads the
 * bundle from https://localhost (androidScheme: "https") and calls this API
 * cross-origin; iOS uses capacitor://localhost.
 */
export const allowedOrigins: string[] = (() => {
  const native = ['capacitor://localhost', 'https://localhost', 'http://localhost'];
  const fromEnv = [env.CLIENT_URL, env.SERVER_URL, env.EXTRA_ALLOWED_ORIGINS]
    .flatMap((value) => value.split(','))
    .map((origin) => origin.trim())
    // '*' means "not configured" — it must NOT become "allow everything".
    .filter((origin) => origin && origin !== '*');
  return Array.from(new Set([...fromEnv, ...native]));
})();
