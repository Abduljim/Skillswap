import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { Sparkles, Check, Zap, Eye, Crown, Shield, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isNativeAndroid, getProducts, purchase, reportPurchaseToServer, restorePurchases } from '../lib/billing-bridge';

interface Product {
  productId: string;
  priceCents: number;
  currency: string;
  durationDays: number;
  platform: 'WEB' | 'ANDROID' | 'IOS';
}

interface SubscriptionInfo {
  tier: 'FREE' | 'PRO';
  subscription: any;
  products: Product[];
}

export default function MembershipPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [boosting, setBoosting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<SubscriptionInfo>('/subscription'),
  });

  const upgradeMutation = useMutation({
    mutationFn: async (productKey: string) => {
      // Native: open Play Billing flow + report purchase to backend
      if (isNativeAndroid()) {
        const products = await getProducts();
        const productId =
          productKey === 'WEB_MONTHLY' ? 'skillswap_pro_android_monthly' : 'skillswap_pro_android_yearly';
        const p = await purchase(productId);
        if (p) await reportPurchaseToServer(p);
        return;
      }
      // Web: instant dev upgrade (no payment integration in MVP)
      return api.post('/subscription/web', { productKey });
    },
    onSuccess: () => {
      toast.push({ type: 'success', title: "You're Pro! 🎉", body: 'Enjoy unlimited exchanges.' });
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
    },
    onError: (e: any) => toast.push({ type: 'error', title: 'Upgrade failed', body: e.message }),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const purchases = await restorePurchases();
      if (purchases.length > 0) {
        // Re-report each active purchase
        for (const p of purchases) {
          try { await reportPurchaseToServer(p); } catch {}
        }
      }
      return purchases;
    },
    onSuccess: (purchases) => {
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
      if (purchases.length > 0) {
        toast.push({ type: 'success', title: 'Subscription restored' });
      } else {
        toast.push({ type: 'info', title: 'No active subscription found' });
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post('/subscription/cancel'),
    onSuccess: () => {
      toast.push({ type: 'info', title: 'Subscription cancelled' });
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
    },
  });

  const boost = async () => {
    setBoosting(true);
    try {
      // Use the native bridge if available (Android), else call server
      const native = (window as any).SkillswapBilling;
      if (native?.activateBoost) {
        await native.activateBoost();
      }
      await api.post('/boost');
      toast.push({ type: 'success', title: 'Boosted!', body: 'You\'ll appear at the top of matches for 1 hour.' });
      qc.invalidateQueries({ queryKey: ['matches'] });
    } catch (e: any) {
      toast.push({ type: 'error', title: 'Boost failed', body: e.message });
    } finally {
      setBoosting(false);
    }
  };

  if (isLoading) return <div className="card p-6">Loading…</div>;

  const isPro = data?.tier === 'PRO';
  const sub = data?.subscription;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <span className="chip-coral inline-flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" /> SkillSwap Pro
        </span>
        <h1 className="font-display font-bold text-4xl text-ink-900 mt-3">
          Trade more. Wait less.
        </h1>
        <p className="text-ink-600 mt-2">
          You're on the <strong>{isPro ? 'Pro' : 'Free'}</strong> plan.
        </p>
      </div>

      {isPro && sub && (
        <div className="card p-6 bg-gradient-to-br from-ink-900 to-ink-800 text-cream-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-coral-300 font-semibold">
                Pro active
              </div>
              <h2 className="font-display font-bold text-2xl mt-1">Thanks for supporting SkillSwap</h2>
              {sub.expiresAt && (
                <div className="text-sm text-cream-300 mt-2">
                  Renews/expires on {new Date(sub.expiresAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <Crown className="w-12 h-12 text-coral-300" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={boost} disabled={boosting} className="btn-coral">
              {boosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Boost for 1 hour
            </button>
            <button onClick={() => cancelMutation.mutate()} className="btn-outline bg-transparent border-cream-200 text-cream-50 hover:bg-ink-700">
              Cancel subscription
            </button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-6">
          <h3 className="font-display font-bold text-xl text-ink-900">Free</h3>
          <div className="text-3xl font-display font-bold text-ink-900 mt-2">$0</div>
          <div className="text-sm text-ink-500">Forever</div>
          <ul className="mt-5 space-y-2.5 text-sm text-ink-700">
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-mint-500" /> Find matches</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-mint-500" /> Send 3 pending requests at a time</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-mint-500" /> Up to 5 active exchanges</li>
            <li className="flex items-center gap-2 text-ink-400"><span className="w-4 h-4">×</span> No visibility boost</li>
            <li className="flex items-center gap-2 text-ink-400"><span className="w-4 h-4">×</span> No "who viewed me" insights</li>
          </ul>
          {!isPro && <div className="mt-5 chip-cream">Current plan</div>}
        </div>

        <div className="card p-6 ring-2 ring-coral-500 relative">
          <div className="absolute -top-3 left-6 chip-coral">Most popular</div>
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-xl text-ink-900">Pro</h3>
            <Sparkles className="w-5 h-5 text-coral-500" />
          </div>
          <div className="text-3xl font-display font-bold text-ink-900 mt-2">
            $4.99<span className="text-base font-normal text-ink-500">/month</span>
          </div>
          <div className="text-sm text-ink-500">or $49/year (save 18%)</div>
          <ul className="mt-5 space-y-2.5 text-sm text-ink-700">
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-coral-500" /> Everything in Free</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-coral-500" /> Unlimited pending requests</li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-coral-500" /> Unlimited active exchanges</li>
            <li className="flex items-center gap-2"><Eye className="w-4 h-4 text-coral-500" /> See who viewed your profile</li>
            <li className="flex items-center gap-2"><Zap className="w-4 h-4 text-coral-500" /> Boost your visibility for 1 hour</li>
            <li className="flex items-center gap-2"><Crown className="w-4 h-4 text-coral-500" /> Pro badge on your profile</li>
          </ul>
          {!isPro && (
            <div className="mt-5 space-y-2">
              <button
                onClick={() => upgradeMutation.mutate('WEB_MONTHLY')}
                disabled={upgradeMutation.isPending}
                className="btn-coral w-full"
              >
                {upgradeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isNativeAndroid() ? 'Subscribe via Google Play' : 'Go Pro — Monthly'}
              </button>
              <button
                onClick={() => upgradeMutation.mutate('WEB_YEARLY')}
                disabled={upgradeMutation.isPending}
                className="btn-outline w-full"
              >
                {isNativeAndroid() ? 'Yearly via Google Play' : 'Go Pro — Yearly (save 18%)'}
              </button>
              <button
                onClick={() => restoreMutation.mutate()}
                disabled={restoreMutation.isPending}
                className="btn-ghost w-full text-xs"
              >
                Restore purchase
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5 text-sm text-ink-600">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-ink-700 shrink-0 mt-0.5" />
          <div>
            <strong className="text-ink-900">Fair use.</strong> Pro is priced for sustainability. Cancel anytime — your subscription stays active until the end of the period. No hidden fees.
          </div>
        </div>
      </div>
    </div>
  );
}