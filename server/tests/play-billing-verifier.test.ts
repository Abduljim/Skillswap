/**
 * Google Play Billing verifier — key loading and endpoint selection.
 *
 * Google's API is mocked: these tests cover the three things that silently
 * rejected every real Pro purchase in production.
 *   1. GOOGLE_PLAY_SERVICE_ACCOUNT_JSON was read as a file *path*, so pasting
 *      the key contents (the documented PaaS setup) threw ENOENT.
 *   2. Only purchases.products.get was called, which serves one-time products;
 *      Pro is a subscription and lives on purchases.subscriptionsv2.
 *   3. The GoogleAuth client was built but never attached to the API client, so
 *      every request went out unauthenticated and got a 401.
 */

jest.mock('googleapis', () => {
  const state = {
    purchases: {
      products: { get: jest.fn() },
      subscriptions: { get: jest.fn() },
      subscriptionsv2: { get: jest.fn() },
    },
    getAccessToken: jest.fn(),
    androidpublisherCalls: [] as any[],
    googleAuthCalls: [] as any[],
  };
  (global as any).__gapiMock = state;
  return {
    google: {
      auth: {
        GoogleAuth: jest.fn().mockImplementation((opts: any) => {
          state.googleAuthCalls.push(opts);
          return { getAccessToken: state.getAccessToken };
        }),
      },
      androidpublisher: jest.fn().mockImplementation((opts: any) => {
        state.androidpublisherCalls.push(opts);
        return { purchases: state.purchases };
      }),
    },
  };
});

// Production is the configuration that matters: dev mode trusts any token, so
// testing against it would prove nothing.
jest.mock('../src/config/env', () => {
  const actual = jest.requireActual('../src/config/env');
  return { ...actual, isProduction: true, env: { ...actual.env } };
});

import { env } from '../src/config/env';
import { loadServiceAccountKey, verifyPlayPurchase } from '../src/services/playBillingVerifier';

const gapi = () => (global as any).__gapiMock;

const KEY = {
  type: 'service_account',
  project_id: 'skillswap-play',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvg\n-----END PRIVATE KEY-----\n',
  client_email: 'billing@skillswap-play.iam.gserviceaccount.com',
};

const httpError = (code: number, message: string) =>
  Object.assign(new Error(message), { code });

beforeEach(() => {
  jest.clearAllMocks();
  env.PLAY_BILLING_VERIFY = 'true';
  env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify(KEY);
  env.ANDROID_PACKAGE_NAME = 'app.skillswap.client';
});

describe('loadServiceAccountKey', () => {
  it('reads the key from the env var contents, which is how a PaaS gets it in', () => {
    const key = loadServiceAccountKey() as any;
    expect(key.client_email).toBe(KEY.client_email);
    expect(key.project_id).toBe('skillswap-play');
    expect(key.private_key).toContain('BEGIN PRIVATE KEY');
  });

  it('repairs a private_key whose newlines survived as literal backslash-n', () => {
    // What a dashboard paste looks like after shell escaping: valid JSON, but
    // the key block contains two-character \n sequences instead of newlines.
    const mangled = JSON.stringify(KEY).replace(/\n/g, '\\n');
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = mangled;
    const key = loadServiceAccountKey() as any;
    expect(key.private_key).toContain('\n');
    expect(key.private_key).not.toContain('\\n');
  });

  it('still accepts a path to a key file for local development', () => {
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const file = path.join(os.tmpdir(), `ss-key-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(KEY));
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = file;
    expect((loadServiceAccountKey() as any).client_email).toBe(KEY.client_email);
    fs.unlinkSync(file);
  });

  it('throws a clear error when nothing is configured', () => {
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '';
    expect(() => loadServiceAccountKey()).toThrow(/not configured/);
  });
});

describe('verifyPlayPurchase', () => {
  const purchase = { productId: 'pro_monthly', purchaseToken: 'token-abc' };

  it('refuses an unverified purchase in production', async () => {
    env.PLAY_BILLING_VERIFY = 'false';
    const result = await verifyPlayPurchase(purchase);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/PLAY_BILLING_VERIFY/);
  });

  // Must run before any test that authenticates: getClient() caches, and a
  // cached client would hide the missing-key error.
  it('reports a missing key instead of guessing', async () => {
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '';
    const result = await verifyPlayPurchase(purchase);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/not configured/);
  });

  it('attaches the auth client to the API client', async () => {
    gapi().purchases.subscriptionsv2.get.mockResolvedValue({
      data: { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [] },
    });
    await verifyPlayPurchase(purchase);
    const calls = gapi().androidpublisherCalls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].auth).toBeDefined();
    expect(gapi().googleAuthCalls[0].scopes).toContain(
      'https://www.googleapis.com/auth/androidpublisher'
    );
  });

  it('accepts an active subscription and reads its expiry', async () => {
    gapi().purchases.subscriptionsv2.get.mockResolvedValue({
      data: {
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId: 'pro_monthly', expiryTime: '2026-10-30T12:00:00Z' }],
      },
    });
    const result = await verifyPlayPurchase(purchase);
    expect(result).toMatchObject({ valid: true, kind: 'subscription' });
    expect(result.expiresAt?.toISOString()).toBe('2026-10-30T12:00:00.000Z');
    // A subscription token must never be looked up as a one-time product.
    expect(gapi().purchases.products.get).not.toHaveBeenCalled();
  });

  it('keeps Pro during the payment grace period', async () => {
    gapi().purchases.subscriptionsv2.get.mockResolvedValue({
      data: { subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', lineItems: [] },
    });
    expect((await verifyPlayPurchase(purchase)).valid).toBe(true);
  });

  it('rejects a subscription that is on hold or expired', async () => {
    gapi().purchases.subscriptionsv2.get.mockResolvedValue({
      data: { subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD', lineItems: [] },
    });
    const result = await verifyPlayPurchase(purchase);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/ON_HOLD/);
  });

  it('falls back to the one-time product endpoint when the token is not a subscription', async () => {
    gapi().purchases.subscriptionsv2.get.mockRejectedValue(httpError(404, 'notFound'));
    gapi().purchases.subscriptions.get.mockRejectedValue(httpError(404, 'notFound'));
    gapi().purchases.products.get.mockResolvedValue({ data: { purchaseState: 0 } });
    const result = await verifyPlayPurchase(purchase);
    expect(result).toMatchObject({ valid: true, kind: 'product' });
  });

  it('rejects a cancelled one-time purchase', async () => {
    gapi().purchases.subscriptionsv2.get.mockRejectedValue(httpError(400, 'badRequest'));
    gapi().purchases.subscriptions.get.mockRejectedValue(httpError(400, 'badRequest'));
    gapi().purchases.products.get.mockResolvedValue({ data: { purchaseState: 1 } });
    const result = await verifyPlayPurchase(purchase);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/purchaseState=1/);
  });

  it('turns a 403 into the Play Console permission it actually needs', async () => {
    gapi().purchases.subscriptionsv2.get.mockRejectedValue(httpError(403, 'forbidden'));
    const result = await verifyPlayPurchase(purchase);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/View financial data/);
    // An auth failure is a configuration problem, not "wrong endpoint": it must
    // not fall through and get reported as a bogus product lookup.
    expect(gapi().purchases.products.get).not.toHaveBeenCalled();
  });
});
