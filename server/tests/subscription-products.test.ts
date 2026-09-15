import { PRO_PRODUCTS } from '../src/services/subscription.service';

describe('Subscription products', () => {
  it('defines web and android products', () => {
    expect(PRO_PRODUCTS.WEB_MONTHLY).toBeDefined();
    expect(PRO_PRODUCTS.WEB_YEARLY).toBeDefined();
    expect(PRO_PRODUCTS.ANDROID_MONTHLY).toBeDefined();
    expect(PRO_PRODUCTS.ANDROID_YEARLY).toBeDefined();
  });

  it('web products have correct prices (in cents)', () => {
    expect(PRO_PRODUCTS.WEB_MONTHLY.priceCents).toBe(499);
    expect(PRO_PRODUCTS.WEB_YEARLY.priceCents).toBe(4900);
  });

  it('android products mirror web prices', () => {
    expect(PRO_PRODUCTS.ANDROID_MONTHLY.priceCents).toBe(PRO_PRODUCTS.WEB_MONTHLY.priceCents);
    expect(PRO_PRODUCTS.ANDROID_YEARLY.priceCents).toBe(PRO_PRODUCTS.WEB_YEARLY.priceCents);
  });

  it('yearly is meaningfully cheaper per month', () => {
    const monthlyPerYear = PRO_PRODUCTS.WEB_MONTHLY.priceCents * 12;
    expect(PRO_PRODUCTS.WEB_YEARLY.priceCents).toBeLessThan(monthlyPerYear);
  });

  it('products have correct platforms', () => {
    expect(PRO_PRODUCTS.WEB_MONTHLY.platform).toBe('WEB');
    expect(PRO_PRODUCTS.WEB_YEARLY.platform).toBe('WEB');
    expect(PRO_PRODUCTS.ANDROID_MONTHLY.platform).toBe('ANDROID');
    expect(PRO_PRODUCTS.ANDROID_YEARLY.platform).toBe('ANDROID');
  });

  it('all products have a duration', () => {
    Object.values(PRO_PRODUCTS).forEach((p) => {
      expect(p.durationDays).toBeGreaterThan(0);
      expect(p.productId).toMatch(/^skillswap_pro_/);
    });
  });
});