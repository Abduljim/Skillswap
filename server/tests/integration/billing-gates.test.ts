/**
 * Billing gates — the production refusals that stop Pro from being free.
 *
 * These run with NODE_ENV flipped to 'production' inside an isolated module
 * registry, because `isProduction` / `webBillingEnabled` are computed once when
 * config/env is first imported.
 *
 * googleapis is mocked: the real package is ~211 MB on disk and the production
 * branch returns long before it is used.
 */
jest.mock('googleapis', () => ({ google: { auth: { GoogleAuth: jest.fn() }, androidpublisher: () => ({}) } }));
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    subscription: { upsert: jest.fn(), findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    boost: { create: jest.fn() },
  },
}));

type SubscriptionService = typeof import('../../src/services/subscription.service');
type Verifier = typeof import('../../src/services/playBillingVerifier');

/** Loads a module fresh, with NODE_ENV=production (and any extra env overrides). */
function inProduction<T>(loader: () => T, overrides: Record<string, string> = {}): T {
  const saved = { NODE_ENV: process.env.NODE_ENV, ...pickEnv(overrides) };
  process.env.NODE_ENV = 'production';
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;

  let result!: T;
  jest.isolateModules(() => {
    result = loader();
  });

  process.env.NODE_ENV = saved.NODE_ENV;
  for (const key of Object.keys(overrides)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  return result;
}

function pickEnv(keys: Record<string, string>) {
  const out: Record<string, string | undefined> = {};
  for (const key of Object.keys(keys)) out[key] = process.env[key];
  return out;
}

describe('Billing gates in production', () => {
  it('refuses the no-payment web upgrade (the free-Pro bypass)', async () => {
    const svc: SubscriptionService = inProduction(() => require('../../src/services/subscription.service'));

    await expect(svc.upgradeWeb('00000000-0000-0000-0000-000000000000', 'WEB_YEARLY')).rejects.toThrow(
      /Web upgrades are not available/i
    );
  });

  it('refuses it even when an explicit ENABLE_WEB_BILLING=false is set', async () => {
    const svc: SubscriptionService = inProduction(
      () => require('../../src/services/subscription.service'),
      { ENABLE_WEB_BILLING: 'false' }
    );

    await expect(svc.upgradeWeb('00000000-0000-0000-0000-000000000000', 'WEB_MONTHLY')).rejects.toThrow(
      /not available/i
    );
  });

  it('still allows it when an operator explicitly opts in with ENABLE_WEB_BILLING=true', async () => {
    // The mock has to be configured inside the isolated registry, otherwise the
    // service under test gets a fresh (unconfigured) copy of the prisma mock.
    const svc: SubscriptionService = inProduction(() => {
      const { prisma } = require('../../src/lib/prisma');
      prisma.subscription.upsert.mockResolvedValue({ tier: 'PRO', status: 'ACTIVE' });
      return require('../../src/services/subscription.service');
    }, { ENABLE_WEB_BILLING: 'true' });

    const sub = await svc.upgradeWeb('00000000-0000-0000-0000-000000000000', 'WEB_YEARLY');
    expect(sub).toEqual({ tier: 'PRO', status: 'ACTIVE' });
  });

  it('rejects an unverified Google Play purchase instead of trusting the token', async () => {
    const verifier: Verifier = inProduction(() => require('../../src/services/playBillingVerifier'));

    const result = await verifier.verifyPlayPurchase({
      productId: 'skillswap_pro_android_yearly',
      purchaseToken: 'anything-at-all',
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/verification is not configured/i);
  });

  it('attempts real verification once PLAY_BILLING_VERIFY=true', async () => {
    const verifier: Verifier = inProduction(() => require('../../src/services/playBillingVerifier'), {
      PLAY_BILLING_VERIFY: 'true',
    });

    // No service account is configured here, so verification must fail closed
    // rather than fall back to "trust the token".
    const result = await verifier.verifyPlayPurchase({
      productId: 'skillswap_pro_android_yearly',
      purchaseToken: 'anything-at-all',
    });

    expect(result.valid).toBe(false);
  });
});

describe('Billing gates outside production', () => {
  it('allows the dev upgrade so the paywall UI can be exercised', async () => {
    const svc: SubscriptionService = require('../../src/services/subscription.service');
    const { prisma } = require('../../src/lib/prisma');
    prisma.subscription.upsert.mockResolvedValue({ tier: 'PRO' });

    await expect(
      svc.upgradeWeb('00000000-0000-0000-0000-000000000000', 'WEB_MONTHLY')
    ).resolves.toEqual({ tier: 'PRO' });
  });

  it('rejects Android product keys on the web endpoint', async () => {
    const svc: SubscriptionService = require('../../src/services/subscription.service');

    await expect(
      svc.upgradeWeb('00000000-0000-0000-0000-000000000000', 'ANDROID_YEARLY')
    ).rejects.toThrow(/Invalid web product/i);
  });
});
