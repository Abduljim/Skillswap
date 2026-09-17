"use strict";
// Subscription service — manages tier upgrades, downgrades, and tier features.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRO_PRODUCTS = void 0;
exports.getMySubscription = getMySubscription;
exports.upgradeWeb = upgradeWeb;
exports.activateAndroidPurchase = activateAndroidPurchase;
exports.cancelSubscription = cancelSubscription;
exports.restorePurchases = restorePurchases;
exports.activateBoost = activateBoost;
exports.activeBoosts = activeBoosts;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
const entitlements_service_1 = require("./entitlements.service");
exports.PRO_PRODUCTS = {
    WEB_MONTHLY: { productId: 'skillswap_pro_web_monthly', priceCents: 499, currency: 'USD', durationDays: 30, platform: 'WEB' },
    WEB_YEARLY: { productId: 'skillswap_pro_web_yearly', priceCents: 4900, currency: 'USD', durationDays: 365, platform: 'WEB' },
    ANDROID_MONTHLY: { productId: 'skillswap_pro_android_monthly', priceCents: 499, currency: 'USD', durationDays: 30, platform: 'ANDROID' },
    ANDROID_YEARLY: { productId: 'skillswap_pro_android_yearly', priceCents: 4900, currency: 'USD', durationDays: 365, platform: 'ANDROID' },
};
async function getMySubscription(userId) {
    const { tier, subscription } = await (0, entitlements_service_1.getUserTier)(userId);
    return {
        tier,
        subscription,
        products: Object.values(exports.PRO_PRODUCTS),
    };
}
/**
 * Web (server-side) upgrades a user to PRO without payment processing.
 * In a production system, you'd gate this behind Stripe/PayPal. For this MVP,
 * we treat "purchase" as a server action — the client never touches billing.
 */
async function upgradeWeb(userId, productKey) {
    const product = exports.PRO_PRODUCTS[productKey];
    if (!product || product.platform !== 'WEB')
        throw new errors_1.BadRequestError('Invalid web product');
    const expiresAt = new Date(Date.now() + product.durationDays * 24 * 60 * 60 * 1000);
    const sub = await prisma_1.prisma.subscription.upsert({
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
async function activateAndroidPurchase(input) {
    const product = Object.values(exports.PRO_PRODUCTS).find((p) => p.productId === input.productId);
    if (!product || product.platform !== 'ANDROID') {
        throw new errors_1.BadRequestError('Unknown Android product');
    }
    const expiresAt = new Date(Date.now() + product.durationDays * 24 * 60 * 60 * 1000);
    const sub = await prisma_1.prisma.subscription.upsert({
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
async function cancelSubscription(userId) {
    const sub = await prisma_1.prisma.subscription.findUnique({ where: { userId } });
    if (!sub)
        throw new errors_1.NotFoundError('No subscription found');
    return prisma_1.prisma.subscription.update({
        where: { userId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), autoRenew: false },
    });
}
async function restorePurchases(userId) {
    const sub = await prisma_1.prisma.subscription.findUnique({ where: { userId } });
    if (!sub)
        return { tier: 'FREE', restored: false };
    // If platform is ANDROID, we'd re-query Google Play here.
    const active = sub.status === 'ACTIVE' && (!sub.expiresAt || sub.expiresAt > new Date());
    return { tier: active ? 'PRO' : 'FREE', restored: true, subscription: sub };
}
/**
 * Activate a 1-hour visibility boost (Pro only).
 */
async function activateBoost(userId) {
    const { tier } = await (0, entitlements_service_1.getUserTier)(userId);
    if (tier !== 'PRO')
        throw new errors_1.BadRequestError('Boost is a Pro feature');
    const endsAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const boost = await prisma_1.prisma.boost.create({
        data: { userId, startsAt: new Date(), endsAt },
    });
    return boost;
}
async function activeBoosts() {
    const now = new Date();
    const boosts = await prisma_1.prisma.boost.findMany({ where: { endsAt: { gt: now } } });
    return new Set(boosts.map((b) => b.userId));
}
//# sourceMappingURL=subscription.service.js.map