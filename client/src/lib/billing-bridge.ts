// JavaScript shim for the Android PlayBillingBridge.
//
// When running in Capacitor (Android), the native plugin is registered globally
// by Capacitor at `window.Capacitor.Plugins.PlayBilling`.
// When running on the web, we provide a fallback that calls the server-side
// /api/subscription/web upgrade (a no-payment dev path).

import { api } from './api';

declare global {
  interface Window {
    Capacitor?: any;
    SkillswapBilling?: any;
  }
}

interface Product {
  productId: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  formattedPrice: string;
  billingPeriodDays: number;
}

interface Purchase {
  productId: string;
  purchaseToken: string;
  orderId?: string;
}

export function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.Capacitor?.isNativePlatform?.();
}

export async function getProducts(): Promise<Product[]> {
  if (isNativeAndroid()) {
    const res = await window.Capacitor.Plugins.PlayBilling.getProducts();
    return res.products || [];
  }
  // Web fallback — read from server
  const sub = await api.get<{ products: Product[] }>('/subscription');
  return sub.products;
}

export async function purchase(productId: string): Promise<Purchase | null> {
  if (!isNativeAndroid()) {
    // Web purchase via dev "instant upgrade" — the web has no real billing flow
    const monthly = productId.includes('monthly') ? 'WEB_MONTHLY' : 'WEB_YEARLY';
    await api.post('/subscription/web', { productKey: monthly });
    return { productId, purchaseToken: `web-mock-${Date.now()}` };
  }

  return new Promise((resolve, reject) => {
    const successHandler = (event: any) => {
      window.Capacitor?.Plugins?.PlayBilling?.removeAllListeners?.('purchase:success');
      window.Capacitor?.Plugins?.PlayBilling?.removeAllListeners?.('purchase:failed');
      const data = event?.detail || event;
      resolve(data as Purchase);
    };
    const failHandler = (event: any) => {
      window.Capacitor?.Plugins?.PlayBilling?.removeAllListeners?.('purchase:success');
      window.Capacitor?.Plugins?.PlayBilling?.removeAllListeners?.('purchase:failed');
      reject(new Error(event?.detail?.message || 'Purchase failed'));
    };

    window.Capacitor?.Plugins?.PlayBilling?.addListener?.('purchase:success', successHandler);
    window.Capacitor?.Plugins?.PlayBilling?.addListener?.('purchase:failed', failHandler);

    window.Capacitor.Plugins.PlayBilling.purchase({ productId }).catch(reject);
  });
}

export async function restorePurchases(): Promise<Purchase[]> {
  if (isNativeAndroid()) {
    const res = await window.Capacitor.Plugins.PlayBilling.restorePurchases();
    return res.purchases || [];
  }
  // Web restore is a no-op; subscription is already tracked server-side
  const res = await api.post<{ tier: 'FREE' | 'PRO' }>('/subscription/restore');
  return res.tier === 'PRO' ? [{ productId: 'web-restore', purchaseToken: 'restored' }] : [];
}

export async function reportPurchaseToServer(p: Purchase) {
  await api.post('/subscription/android', {
    productId: p.productId,
    purchaseToken: p.purchaseToken,
    orderId: p.orderId,
  });
}