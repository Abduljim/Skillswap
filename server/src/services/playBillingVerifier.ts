/**
 * Google Play Billing verifier
 *
 * In production, verifies the purchaseToken with the Google Play Developer API.
 * In dev (or when PLAY_BILLING_VERIFY=false), accepts the token and treats it as valid.
 *
 * Pro is sold as a subscription, so the subscription endpoints are tried first
 * and the one-time-product endpoint is the fallback.
 *
 * Docs:
 *  - subscriptions (current): https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get
 *  - subscriptions (legacy):  https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/get
 *  - one-time products:       https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
 */
import { google } from 'googleapis';
import { env, isProduction } from '../config/env';
import fs from 'fs';

let authClient: any = null;
let androidPublisher: any = null;

/**
 * Resolve the service-account key.
 *
 * GOOGLE_PLAY_SERVICE_ACCOUNT_JSON normally holds the key *contents*: on a PaaS
 * the filesystem is ephemeral and the key must never be committed, so you paste
 * the JSON into the env var. A path to a key file is also accepted, which is
 * what local development usually wants.
 *
 * This used to be `readFileSync(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)` only, so
 * the documented setup — pasting the JSON — threw ENOENT and every purchase was
 * rejected even with a perfectly good key.
 */
export function loadServiceAccountKey(): Record<string, unknown> {
  const raw = (env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured');

  const key = normaliseKey(
    raw.startsWith('{') ? tryParse(raw) : JSON.parse(fs.readFileSync(raw, 'utf8'))
  );
  return key;
}

function tryParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    // Some hosts deliver the value with literal backslash-n sequences instead
    // of real newlines, which is not valid JSON inside a string literal.
    return JSON.parse(raw.replace(/\\n/g, '\n'));
  }
}

/**
 * Repair the double-escaping a dashboard paste produces: the value parses, but
 * private_key holds the two characters backslash-n instead of a newline, and
 * Google's JWT signer then fails with a confusing "No valid account credentials"
 * or "sign_jwt" error.
 */
function normaliseKey(key: any): Record<string, unknown> {
  if (key && typeof key.private_key === 'string' && key.private_key.includes('\\n')) {
    key.private_key = key.private_key.replace(/\\n/g, '\n');
  }
  return key;
}

async function getClient() {
  if (authClient && androidPublisher) return { authClient, androidPublisher };
  const keyFile = loadServiceAccountKey();
  authClient = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  // The auth client has to be attached to the API client. Building it and then
  // calling `google.androidpublisher('v3')` separately sends every request
  // unauthenticated, which Google answers with a 401.
  androidPublisher = google.androidpublisher({ version: 'v3', auth: authClient });
  return { authClient, androidPublisher };
}

export interface PlayPurchase {
  productId: string;
  purchaseToken: string;
  orderId?: string;
}

export interface PlayVerification {
  valid: boolean;
  expiresAt?: Date;
  reason?: string;
  /** Which Google endpoint accepted the token — useful when debugging a SKU. */
  kind?: 'subscription' | 'product';
}

/** A subscriber keeps Pro while paying and during the grace period. */
const ENTITLED_SUBSCRIPTION_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]);

/** Errors that mean "wrong credentials", not "wrong endpoint". */
function isAuthFailure(e: any): boolean {
  return e?.code === 401 || e?.code === 403;
}

async function verifyViaSubscriptionsV2(
  ap: any,
  p: PlayPurchase
): Promise<PlayVerification | null> {
  if (typeof ap?.purchases?.subscriptionsv2?.get !== 'function') return null;
  try {
    const res = await ap.purchases.subscriptionsv2.get({
      packageName: env.ANDROID_PACKAGE_NAME,
      token: p.purchaseToken,
    });
    const d = res.data ?? {};
    const state = String(d.subscriptionState ?? '');
    const expiries = (d.lineItems ?? [])
      .map((li: any) => (li?.expiryTime ? Date.parse(li.expiryTime) : NaN))
      .filter((n: number) => Number.isFinite(n));
    const expiresAt = expiries.length ? new Date(Math.max(...expiries)) : undefined;
    if (!ENTITLED_SUBSCRIPTION_STATES.has(state)) {
      return {
        valid: false,
        reason: `subscriptionState=${state || 'unspecified'}`,
        kind: 'subscription',
      };
    }
    return { valid: true, expiresAt, kind: 'subscription' };
  } catch (e: any) {
    if (isAuthFailure(e)) {
      return {
        valid: false,
        reason: `Google rejected the service account (${e.code}). Grant it "View financial data" in Play Console.`,
        kind: 'subscription',
      };
    }
    // 400/404 here usually means the token is not a subscription at all, so let
    // the caller fall through to the one-time-product endpoint.
    return null;
  }
}

async function verifyViaLegacySubscription(
  ap: any,
  p: PlayPurchase
): Promise<PlayVerification | null> {
  if (typeof ap?.purchases?.subscriptions?.get !== 'function') return null;
  try {
    const res = await ap.purchases.subscriptions.get({
      packageName: env.ANDROID_PACKAGE_NAME,
      subscriptionId: p.productId,
      token: p.purchaseToken,
    });
    const expiry = res.data?.expiryTimeMillis ? Number(res.data.expiryTimeMillis) : NaN;
    if (Number.isFinite(expiry) && expiry <= Date.now()) {
      return { valid: false, reason: 'subscription expired', kind: 'subscription' };
    }
    return {
      valid: true,
      expiresAt: Number.isFinite(expiry) ? new Date(expiry) : undefined,
      kind: 'subscription',
    };
  } catch (e: any) {
    if (isAuthFailure(e)) {
      return {
        valid: false,
        reason: `Google rejected the service account (${e.code}). Grant it "View financial data" in Play Console.`,
        kind: 'subscription',
      };
    }
    return null;
  }
}

async function verifyViaProduct(ap: any, p: PlayPurchase): Promise<PlayVerification> {
  const res = await ap.purchases.products.get({
    packageName: env.ANDROID_PACKAGE_NAME,
    productId: p.productId,
    token: p.purchaseToken,
  });
  const purchase = res.data ?? {};
  // purchaseState: 0 = Purchased, 1 = Cancelled, 2 = Pending
  if (purchase.purchaseState !== 0) {
    return {
      valid: false,
      reason: `purchaseState=${purchase.purchaseState}`,
      kind: 'product',
    };
  }
  const expiresAt = purchase.expiryTimeMillis
    ? new Date(Number(purchase.expiryTimeMillis))
    : undefined;
  return { valid: true, expiresAt, kind: 'product' };
}

export async function verifyPlayPurchase(p: PlayPurchase): Promise<PlayVerification> {
  if (env.PLAY_BILLING_VERIFY !== 'true') {
    // Development: trust the token so the billing UI can be exercised without a
    // Play Console service account.
    //
    // Production: refusing is the only safe default. Accepting an unverified
    // purchaseToken means any client can mint PRO for free by posting
    // { productId, purchaseToken: 'anything' }.
    if (isProduction) {
      return {
        valid: false,
        reason:
          'Purchase verification is not configured on this server (PLAY_BILLING_VERIFY must be "true" with GOOGLE_PLAY_SERVICE_ACCOUNT_JSON set).',
      };
    }
    return { valid: true };
  }

  try {
    const { androidPublisher } = await getClient();
    const viaV2 = await verifyViaSubscriptionsV2(androidPublisher, p);
    if (viaV2) return viaV2;
    const viaLegacy = await verifyViaLegacySubscription(androidPublisher, p);
    if (viaLegacy) return viaLegacy;
    return await verifyViaProduct(androidPublisher, p);
  } catch (e: any) {
    return { valid: false, reason: e?.message ?? String(e) };
  }
}

/**
 * Admin-only configuration check. Proves the key parses, the service account
 * can mint a token, and which endpoints the installed googleapis exposes — so a
 * bad paste is caught before the first real customer tries to buy Pro.
 *
 * Deliberately makes no purchase call: there is no token to check yet.
 */
export async function selfTestPlayBilling(): Promise<{
  verificationEnabled: boolean;
  packageName: string;
  keyConfigured: boolean;
  keySource?: 'inline-json' | 'file-path';
  serviceAccountEmail?: string;
  projectId?: string;
  accessToken?: 'ok' | string;
  endpoints?: { subscriptionsv2: boolean; subscriptions: boolean; products: boolean };
  error?: string;
}> {
  const out: any = {
    verificationEnabled: env.PLAY_BILLING_VERIFY === 'true',
    packageName: env.ANDROID_PACKAGE_NAME,
    keyConfigured: Boolean((env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim()),
  };
  if (!out.keyConfigured) {
    out.error = 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is empty';
    return out;
  }
  const raw = (env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  out.keySource = raw.startsWith('{') ? 'inline-json' : 'file-path';
  try {
    const key = loadServiceAccountKey() as any;
    out.serviceAccountEmail = key.client_email;
    out.projectId = key.project_id;
    const { authClient, androidPublisher } = await getClient();
    const t: any = await authClient.getAccessToken();
    const token = typeof t === 'string' ? t : t?.token;
    out.accessToken = token ? 'ok' : 'no token returned';
    out.endpoints = {
      subscriptionsv2: typeof androidPublisher?.purchases?.subscriptionsv2?.get === 'function',
      subscriptions: typeof androidPublisher?.purchases?.subscriptions?.get === 'function',
      products: typeof androidPublisher?.purchases?.products?.get === 'function',
    };
  } catch (e: any) {
    out.accessToken = 'failed';
    out.error = (e?.message ?? String(e)).slice(0, 200);
  }
  return out;
}
