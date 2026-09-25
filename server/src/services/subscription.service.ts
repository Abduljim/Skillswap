// Subscription service — manages tier upgrades, downgrades, and tier features.

import { prisma } from '../lib/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';
import { getUserTier } from './entitlements.service';
import { isProduction, webBillingEnabled } from '../config/env';

export const PRO_PRODUCTS = {
  WEB_MONTHLY: { productId: 'skillswap_pro_web_monthly', priceCents: 499, currency: 'USD', durationDays: 30, platform: 'WEB' as const },
  WEB_YEARLY: { productId: 'skillswap_pro_web_yearly', priceCents: 4900, currency: 'USD', durationDays: 365, platform: 'WEB' as const },
  ANDROID_MONTHLY: { productId: 'skillswap_pro_android_monthly', priceCents: 499, currency: 'USD', durationDays: 30, platform: 'ANDROID' as const },
  ANDROID_YEARLY: { productId: 'skillswap_pro_android_yearly', priceCents: 4900, currency: 'USD', durationDays: 365, platform: 'ANDROID' as const },
};

export async function getMySubscription(userId: string) {
  const { tier, subscription } = await getUserTier(userId);
  return {
    tier,
    subscription,
    products: Object.values(PRO_PRODUCTS),
  };
}

/**
 * Web (server-side) upgrade to PRO **without a payment provider**.
 *
 * This is a development convenience: there is no Stripe/Paystack integration, so
 * calling it simply grants PRO. It is therefore refused in production unless
 * ENABLE_WEB_BILLING=true is set explicitly — otherwise anyone with a session
 * cookie (including Android users, bypassing Google Play Billing) could take PRO
 * for free with a single POST.
 */
export async function upgradeWeb(userId: string, productKey: keyof typeof PRO_PRODUCTS) {
  if (!webBillingEnabled) {
    throw new ForbiddenError(
      isProduction
        ? 'Web upgrades are not available. Purchase Pro from the Android app instead.'
        : 'Web billing is disabled. Set ENABLE_WEB_BILLING=true to use the no-payment dev upgrade.'
    );
  }

  const product = PRO_PRODUCTS[productKey];
  if (!product || product.platform !== 'WEB') throw new BadRequestError('Invalid web product');

  const expiresAt = new Date(Date.now() + product.durationDays * 24 * 60 * 60 * 1000);

  const sub = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier: 'PRO',
      status: 'ACTIVE',
      platform: 'WEB',
      productId: product.productId,
      startedAt: new Date(),
      expiresAt,
      autoRenew: false,
    },
    update: {
      tier: 'PRO',
      status: 'ACTIVE',
      platform: 'WEB',
      productId: product.productId,
      startedAt: new Date(),
      expiresAt,
      cancelledAt: null,
    },
  });

  return sub;
}

/**
 * Android (Play Billing) — the native bridge sends us a verified purchase token.
 * For an MVP we trust the token server-side; in production you'd verify with Google Play Developer API.
 */
export async function activateAndroidPurchase(input: {
  userId: string;
  productId: string;
  purchaseToken: string;
  orderId?: string;
}) {
  const product = Object.values(PRO_PRODUCTS).find((p) => p.productId === input.productId);
  if (!product || product.platform !== 'ANDROID') {
    throw new BadRequestError('Unknown Android product');
  }

  const expiresAt = new Date(Date.now() + product.durationDays * 24 * 60 * 60 * 1000);

  const sub = await prisma.subscription.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      tier: 'PRO',
      status: 'ACTIVE',
      platform: 'ANDROID',
      productId: product.productId,
      purchaseToken: input.purchaseToken,
      orderId: input.orderId,
      startedAt: new Date(),
      expiresAt,
      autoRenew: true,
    },
    update: {
      tier: 'PRO',
      status: 'ACTIVE',
      platform: 'ANDROID',
      productId: product.productId,
      purchaseToken: input.purchaseToken,
      orderId: input.orderId,
      startedAt: new Date(),
      expiresAt,
      cancelledAt: null,
    },
  });

  return sub;
}

export async function cancelSubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError('No subscription found');
  return prisma.subscription.update({
    where: { userId },
    data: { status: 'CANCELLED', cancelledAt: new Date(), autoRenew: false },
  });
}

export async function restorePurchases(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return { tier: 'FREE' as const, restored: false };
  // If platform is ANDROID, we'd re-query Google Play here.
  const active = sub.status === 'ACTIVE' && (!sub.expiresAt || sub.expiresAt > new Date());
  return { tier: active ? 'PRO' : 'FREE', restored: true, subscription: sub };
}

/**
 * Activate a 1-hour visibility boost (Pro only).
 */
export async function activateBoost(userId: string) {
  const { tier } = await getUserTier(userId);
  if (tier !== 'PRO') throw new BadRequestError('Boost is a Pro feature');

  const endsAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  const boost = await prisma.boost.create({
    data: { userId, startsAt: new Date(), endsAt },
  });
  return boost;
}

export async function activeBoosts(): Promise<Set<string>> {
  const now = new Date();
  const boosts = await prisma.boost.findMany({ where: { endsAt: { gt: now } } });
  return new Set(boosts.map((b: { userId: string }) => b.userId));
}