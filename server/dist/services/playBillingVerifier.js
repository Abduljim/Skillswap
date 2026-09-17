"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPlayPurchase = verifyPlayPurchase;
/**
 * Google Play Billing verifier
 *
 * In production, verifies the purchaseToken with the Google Play Developer API.
 * In dev (or when PLAY_BILLING_VERIFY=false), accepts the token and treats it as valid.
 *
 * Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
 */
const googleapis_1 = require("googleapis");
const env_1 = require("../config/env");
const fs_1 = __importDefault(require("fs"));
let authClient = null;
let androidPublisher = null;
async function getClient() {
    if (authClient)
        return { authClient, androidPublisher };
    if (!env_1.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
        throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured');
    }
    const keyFile = JSON.parse(fs_1.default.readFileSync(env_1.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, 'utf8'));
    authClient = new googleapis_1.google.auth.GoogleAuth({
        credentials: keyFile,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    androidPublisher = googleapis_1.google.androidpublisher('v3');
    return { authClient, androidPublisher };
}
async function verifyPlayPurchase(p) {
    if (env_1.env.PLAY_BILLING_VERIFY !== 'true') {
        // Dev mode: trust the token. In production, set PLAY_BILLING_VERIFY=true
        // and provide GOOGLE_PLAY_SERVICE_ACCOUNT_JSON to enforce verification.
        return { valid: true };
    }
    try {
        const { androidPublisher } = await getClient();
        const res = await androidPublisher.purchases.products.get({
            packageName: env_1.env.ANDROID_PACKAGE_NAME,
            productId: p.productId,
            token: p.purchaseToken,
        });
        const purchase = res.data;
        // purchase.expiryTimeMillis is a string in ms; purchase.purchaseState: 0=Purchased, 1=Cancelled, 2=Pending
        if (purchase.purchaseState !== 0) {
            return { valid: false, reason: `purchaseState=${purchase.purchaseState}` };
        }
        const expiresAt = purchase.expiryTimeMillis
            ? new Date(Number(purchase.expiryTimeMillis))
            : undefined;
        return { valid: true, expiresAt };
    }
    catch (e) {
        return { valid: false, reason: e.message };
    }
}
//# sourceMappingURL=playBillingVerifier.js.map