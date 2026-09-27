import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function parseServiceAccount(): ServiceAccount | null {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) return null;
  try {
    const parsed = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Fetch a short-lived OAuth2 access token for the firebase.messaging scope.
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token;
  }
  const assertion = jwt.sign({ scope: SCOPE }, sa.private_key, {
    algorithm: 'RS256',
    issuer: sa.client_email,
    subject: sa.client_email,
    audience: TOKEN_URL,
    expiresIn: 3600,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let code = '';
    try {
      code = String((JSON.parse(detail) as { error?: string })?.error ?? '');
    } catch {}
    // Deliberately excludes the assertion: it is signed with the private key.
    throw new Error(`OAuth token exchange failed: HTTP ${res.status}${code ? ` ${code}` : ''}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

/**
 * Send an FCM data message to one device using the Firebase HTTP v1 API
 * (service-account auth). Returns true on success, and 'invalid' when the token
 * is dead (the device should be dropped).
 */
const warned = new Set<string>();

/** Log a repeating problem once per process — push runs in a loop over devices. */
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.error(message);
}

/**
 * Send an FCM data message to one device over the Firebase HTTP v1 API
 * (service-account auth).
 *
 * Returns 'ok' on delivery, 'invalid' ONLY when the device token itself is dead
 * and safe to delete, and 'error' for everything else. That split matters:
 * callers delete the stored token when this says 'invalid', so answering
 * 'invalid' to a credentials problem silently wipes every user's push
 * registration. It used to do exactly that, because HTTP 400 was treated as a
 * dead token and FCM answers 400 SENDER_ID_MISMATCH when the service account
 * belongs to a different Firebase project than the app's google-services.json.
 * A wrongly-classified token is unrecoverable; a kept one only costs a retry.
 */
export async function sendFcmV1(
  token: string,
  data: Record<string, string>
): Promise<'ok' | 'invalid' | 'error'> {
  const sa = parseServiceAccount();
  if (!sa) {
    warnOnce(
      'no-service-account',
      '[fcm] FCM_SERVICE_ACCOUNT_JSON is missing or is not JSON containing project_id, client_email and private_key — push notifications are disabled'
    );
    return 'error';
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    console.error('[fcm] cannot authenticate with Firebase:', (e as Error).message);
    console.error(
      '[fcm] device tokens are being kept. Firebase console > Project settings > Service accounts > Generate new private key, then paste the WHOLE JSON into FCM_SERVICE_ACCOUNT_JSON — newlines inside private_key must survive the paste.'
    );
    return 'error';
  }

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          data,
          android: { priority: 'HIGH' },
        },
      }),
    });
  } catch (e) {
    console.error('[fcm] network error reaching FCM:', (e as Error).message);
    return 'error';
  }

  if (res.ok) return 'ok';

  const body = await res.text().catch(() => '');
  let status = '';
  try {
    status = String((JSON.parse(body) as { error?: { status?: string } })?.error?.status ?? '');
  } catch {}

  // 404 UNREGISTERED and 410 GONE are the only verdicts that mean this device is
  // gone. Anything else is our problem and must not cost the user their token.
  if ((res.status === 404 && (!status || status === 'UNREGISTERED')) || res.status === 410) {
    warnOnce(
      'dead-token',
      `[fcm] a device token is no longer registered (HTTP ${res.status} ${status || 'no-status'}) — dropping it`
    );
    return 'invalid';
  }

  if (res.status === 401 || res.status === 403) {
    // Credential/scope problem — clear the cache so the next call re-auths.
    cachedAccessToken = null;
  }
  console.error(
    `[fcm] send failed: HTTP ${res.status} ${status || 'no-status'} ${body.slice(0, 200)}`
  );
  if (
    status === 'SENDER_ID_MISMATCH' ||
    status === 'PERMISSION_DENIED' ||
    status === 'UNAUTHENTICATED'
  ) {
    console.error(
      '[fcm] that is a credentials or project mismatch, not a dead device — device tokens are being kept. FCM_SERVICE_ACCOUNT_JSON must come from the SAME Firebase project as the app google-services.json.'
    );
  }
  return 'error';
}

export const fcmV1Configured = (): boolean => parseServiceAccount() !== null;

/**
 * Live check for GET /api/admin/diagnostics: parses the service account, then
 * performs the real OAuth2 exchange — the only thing that proves the private key
 * and client_email are usable without sending anyone a notification. Returns no
 * key material.
 */
export async function fcmDiagnostics(): Promise<{
  configured: boolean;
  projectId: string | null;
  clientEmail: string | null;
  oauth: 'ok' | 'failed' | 'not_attempted';
  error: string | null;
}> {
  const sa = parseServiceAccount();
  if (!sa) {
    return {
      configured: false,
      projectId: null,
      clientEmail: null,
      oauth: 'not_attempted',
      error: env.FCM_SERVICE_ACCOUNT_JSON
        ? 'FCM_SERVICE_ACCOUNT_JSON is set but is not valid JSON with project_id, client_email and private_key'
        : 'FCM_SERVICE_ACCOUNT_JSON is empty',
    };
  }
  try {
    await getAccessToken(sa);
    return {
      configured: true,
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      oauth: 'ok',
      error: null,
    };
  } catch (e) {
    return {
      configured: true,
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      oauth: 'failed',
      error: String((e as Error).message).slice(0, 200),
    };
  }
}
