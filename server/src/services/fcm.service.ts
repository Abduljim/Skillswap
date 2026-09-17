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
    throw new Error(`OAuth token exchange failed: ${res.status}`);
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
export async function sendFcmV1(token: string, data: Record<string, string>): Promise<'ok' | 'invalid' | 'error'> {
  const sa = parseServiceAccount();
  if (!sa) return 'error';
  try {
    const accessToken = await getAccessToken(sa);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
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
    if (res.ok) return 'ok';
    if (res.status === 400 || res.status === 404 || res.status === 410) return 'invalid';
    if (res.status === 401 || res.status === 403) {
      // Token/scope problem — clear the cache so the next call re-auths.
      cachedAccessToken = null;
    }
    return 'error';
  } catch {
    return 'error';
  }
}

export const fcmV1Configured = (): boolean => parseServiceAccount() !== null;