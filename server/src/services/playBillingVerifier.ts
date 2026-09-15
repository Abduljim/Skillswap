/**
 * Google Play Billing verifier
 *
 * In production, verifies the purchaseToken with the Google Play Developer API.
 * In dev (or when PLAY_BILLING_VERIFY=false), accepts the token and treats it as valid.
 *
 * Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
 */
import { google } from 'googleapis';
import { env } from '../config/env';
import fs from 'fs';

let authClient: any = null;
let androidPublisher: any = null;

async function getClient() {
  if (authClient) return { authClient, androidPublisher };
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured');
  }
  const keyFile = JSON.parse(
    fs.readFileSync(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, 'utf8')
  );
  authClient = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  androidPublisher = google.androidpublisher('v3');
  return { authClient, androidPublisher };
}

export interface PlayPurchase {
  productId: string;
  purchaseToken: string;
  orderId?: string;
}

export async function verifyPlayPurchase(p: PlayPurchase): Promise<{
  valid: boolean;
  expiresAt?: Date;
  reason?: string;
}> {
  if (env.PLAY_BILLING_VERIFY !== 'true') {
    // Dev mode: trust the token. In production, set PLAY_BILLING_VERIFY=true
    // and provide GOOGLE_PLAY_SERVICE_ACCOUNT_JSON to enforce verification.
    return { valid: true };
  }

  try {
    const { androidPublisher } = await getClient();
    const res = await androidPublisher.purchases.products.get({
      packageName: env.ANDROID_PACKAGE_NAME,
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
  } catch (e: any) {
    return { valid: false, reason: e.message };
  }
}