import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import {
  Sparkles,
  Check,
  X,
  Zap,
  Eye,
  Crown,
  Shield,
  Loader2,
  ChevronDown,
  Infinity as InfinityIcon,
  BadgeCheck,
  TrendingUp,
  Heart,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  isNativeAndroid,
  getProducts,
  purchase,
  reportPurchaseToServer,
  restorePurchases,
} from '../lib/billing-bridge';

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

const FEATURES: { name: string; free: string | boolean; pro: string | boolean }[] = [
  {
    name: 'Find matches across the network',
    free: true,
    pro: true,
  },
  {
    name: 'Direct messages with matched partners',
    free: true,
    pro: true,
  },
  {
    name: 'Pending exchange requests',
    free: '3 at a time',
    pro: 'Unlimited',
  },
  {
    name: 'Active exchanges',
    free: '5 at a time',
    pro: 'Unlimited',
  },
  {
    name: 'See who viewed your profile',
    free: false,
    pro: true,
  },
  {
    name: 'Boost your visibility for 1 hour',
    free: false,
    pro: '4 boosts/month',
  },
  {
    name: 'Pro badge on your profile and messages',
    free: false,
    pro: true,
  },
  {
    name: 'Priority placement in match results',
    free: false,
    pro: true,
  },
  {
    name: 'Early access to new features',
    free: false,
    pro: true,
  },
];

const FAQ = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel in one tap from this page. Your Pro perks stay active until the end of the period you paid for. No fees, no questions.',
  },
  {
    q: 'What happens to my matches if I downgrade?',
    a: 'Nothing. All your existing exchanges and conversations keep working. You only lose the ability to send new requests beyond the free tier limit.',
  },
  {
    q: 'Is the yearly plan really cheaper?',
    a: 'Yes. Yearly is $49 vs $59.88 if you paid monthly. That is 18% off, or about two months free.',
  },
  {
    q: 'Do you store my payment details?',
    a: 'On Android, payment goes through Google Play. On web, we never see your card. Stripe handles it for us when real billing is enabled.',
  },
  {
    q: 'Is there a refund policy?',
    a: 'Within 7 days of your first charge, email us for a full refund. After that you can still cancel anytime and keep access until your period ends.',
  },
];

function FeatureRow({ name, free, pro }: { name: string; free: string | boolean; pro: string | boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 sm:gap-6 items-center py-3 border-b border-ink-100/70 last:border-b-0">
      <div className="text-sm text-ink-700 min-w-0 break-words pr-1">{name}</div>
      <div className="text-center w-16 sm:w-28 min-w-0">
        {typeof free === 'boolean' ? (
          free ? (
            <Check className="w-4 h-4 text-mint-500 mx-auto" />
          ) : (
            <X className="w-4 h-4 text-ink-300 mx-auto" />
          )
        ) : (
          <span className="text-xs font-medium text-ink-600 break-words">{free}</span>
        )}
      </div>
      <div className="text-center w-16 sm:w-28 min-w-0">
        {typeof pro === 'boolean' ? (
          pro ? (
            <Check className="w-4 h-4 text-coral-500 mx-auto" />
          ) : (
            <X className="w-4 h-4 text-ink-300 mx-auto" />
          )
        ) : (
          <span className="text-xs font-semibold text-coral-600 inline-flex items-center gap-1 justify-center">
            {pro === 'Unlimited' && <InfinityIcon className="w-3 h-3" />}
            <span className="min-w-0 break-words">{pro}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink-100/70 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-4 flex items-center justify-between gap-4 text-left hover:text-ink-900 transition-colors"
      >
        <span className="text-sm font-medium text-ink-800">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-ink-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-4 -mt-1 text-sm text-ink-600 leading-relaxed">{a}</div>
      )}
    </div>
  );
}

export default function MembershipPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [boosting, setBoosting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<SubscriptionInfo>('/subscription'),
  });

  const upgradeMutation = useMutation({
    mutationFn: async (productKey: 'WEB_MONTHLY' | 'WEB_YEARLY') => {
      if (isNativeAndroid()) {
        const products = await getProducts();
        const productId =
          productKey === 'WEB_MONTHLY'
            ? 'skillswap_pro_android_monthly'
            : 'skillswap_pro_android_yearly';
        const p = await purchase(productId);
        if (p) await reportPurchaseToServer(p);
        return;
      }
      return api.post('/subscription/web', { productKey });
    },
    onSuccess: () => {
      toast.push({ type: 'success', title: 'Welcome to Pro', body: 'Your perks are live.' });
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
    },
    onError: (e: any) => toast.push({ type: 'error', title: 'Upgrade failed', body: e.message }),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const purchases = await restorePurchases();
      for (const p of purchases) {
        try {
          await reportPurchaseToServer(p);
        } catch {}
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
      const native = (window as any).SkillswapBilling;
      if (native?.activateBoost) {
        await native.activateBoost();
      }
      await api.post('/boost');
      toast.push({
        type: 'success',
        title: 'Boosted',
        body: 'You will appear at the top of matches for the next hour.',
      });
      qc.invalidateQueries({ queryKey: ['matches'] });
    } catch (e: any) {
      toast.push({ type: 'error', title: 'Boost failed', body: e.message });
    } finally {
      setBoosting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-ink-400" />
      </div>
    );
  }

  const isPro = data?.tier === 'PRO';
  const sub = data?.subscription;
  const monthly = data?.products?.find((p) => p.durationDays === 30);
  const yearly = data?.products?.find((p) => p.durationDays === 365);
  const monthlyPrice = monthly ? (monthly.priceCents / 100).toFixed(2) : '4.99';
  const yearlyPrice = yearly ? (yearly.priceCents / 100).toFixed(2) : '49.00';
  const yearlyMonthly = ((Number(yearlyPrice) || 49) / 12).toFixed(2);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-24">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-coral-100 text-coral-700 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          SkillSwap Pro
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink-900 mt-4 tracking-tight">
          Trade what you know.<br className="hidden sm:block" /> Skip the waitlist.
        </h1>
        <p className="text-ink-600 mt-3 max-w-md mx-auto leading-relaxed">
          Pro removes the limits on how many people you can swap with and adds tools to help
          you stand out.
        </p>
        {isPro && (
          <div className="mt-4 inline-flex items-center gap-2 text-sm text-mint-700 bg-mint-100 px-3 py-1.5 rounded-full">
            <BadgeCheck className="w-4 h-4" />
            You are on Pro
            {sub?.expiresAt && (
              <span className="text-mint-600">
                · renews {new Date(sub.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Pricing cards */}
      {!isPro && (
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {/* Monthly */}
          <div className="bg-white rounded-2xl border border-ink-100/80 p-5 hover:border-ink-200 transition-colors">
            <div className="text-sm font-medium text-ink-700">Monthly</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-display font-bold text-ink-900">${monthlyPrice}</span>
              <span className="text-sm text-ink-500">/ month</span>
            </div>
            <p className="text-xs text-ink-500 mt-1.5">Cancel anytime. No commitment.</p>
            <button
              onClick={() => upgradeMutation.mutate('WEB_MONTHLY')}
              disabled={upgradeMutation.isPending}
              className="mt-4 w-full h-10 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {upgradeMutation.isPending && upgradeMutation.variables === 'WEB_MONTHLY' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {isNativeAndroid() ? 'Subscribe via Google Play' : 'Choose Monthly'}
            </button>
          </div>

          {/* Yearly (highlighted) */}
          <div className="bg-gradient-to-br from-coral-500 to-coral-600 rounded-2xl p-5 text-white relative shadow-soft-lg">
            <div className="absolute -top-2 right-4 bg-cream-50 text-coral-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
              Save 18%
            </div>
            <div className="text-sm font-medium text-coral-100">Yearly</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-display font-bold">${yearlyPrice}</span>
              <span className="text-sm text-coral-100">/ year</span>
            </div>
            <p className="text-xs text-coral-100 mt-1.5">
              ${yearlyMonthly}/ month, billed yearly.
            </p>
            <button
              onClick={() => upgradeMutation.mutate('WEB_YEARLY')}
              disabled={upgradeMutation.isPending}
              className="mt-4 w-full h-10 rounded-xl bg-white text-coral-700 text-sm font-semibold hover:bg-cream-50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {upgradeMutation.isPending && upgradeMutation.variables === 'WEB_YEARLY' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {isNativeAndroid() ? 'Yearly via Google Play' : 'Choose Yearly'}
            </button>
          </div>
        </div>
      )}

      {/* Manage Pro (when already Pro) */}
      {isPro && sub && (
        <div className="bg-ink-900 rounded-2xl p-5 mb-8 text-cream-50 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-coral-300 font-semibold">
              Pro active
            </div>
            <div className="text-sm text-cream-200 mt-1 break-words">
              {sub.expiresAt
                ? `Active until ${new Date(sub.expiresAt).toLocaleDateString()}`
                : 'Lifetime access'}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={boost}
              disabled={boosting}
              className="h-9 px-3 rounded-lg bg-coral-500 hover:bg-coral-600 text-white text-sm font-semibold transition-all active:scale-[0.98] flex items-center gap-1.5 disabled:opacity-50"
            >
              {boosting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Boost
            </button>
            <button
              onClick={() => cancelMutation.mutate()}
              className="h-9 px-3 rounded-lg bg-ink-900 hover:bg-ink-800 text-cream-50 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* What you get (Pro perks highlight) */}
      <div className="bg-white rounded-2xl border border-ink-100/80 p-5 mb-6">
        <div className="text-xs uppercase tracking-widest text-ink-500 font-semibold mb-3">
          What you get with Pro
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { icon: InfinityIcon, title: 'Unlimited requests', desc: 'No more 3 pending at a time' },
            { icon: Eye, title: 'Who viewed me', desc: 'See who is checking your profile' },
            { icon: Zap, title: '4 boosts / month', desc: 'Top of matches for an hour' },
            { icon: Crown, title: 'Pro badge', desc: 'Stand out on every profile' },
          ].map((p) => (
            <div key={p.title} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-coral-100 flex items-center justify-center shrink-0">
                <p.icon className="w-4 h-4 text-coral-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-900">{p.title}</div>
                <div className="text-xs text-ink-600 mt-0.5">{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-white rounded-2xl border border-ink-100/80 p-5 mb-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 sm:gap-6 pb-3 border-b border-ink-200">
          <div className="text-xs uppercase tracking-widest text-ink-500 font-semibold min-w-0">
            Feature
          </div>
          <div className="text-xs uppercase tracking-widest text-ink-500 font-semibold w-16 sm:w-28 text-center min-w-0">
            Free
          </div>
          <div className="text-xs uppercase tracking-widest text-coral-600 font-semibold w-16 sm:w-28 text-center min-w-0">
            Pro
          </div>
        </div>
        {FEATURES.map((f) => (
          <FeatureRow key={f.name} name={f.name} free={f.free} pro={f.pro} />
        ))}
      </div>

      {/* Restore button (Android only) */}
      {!isPro && isNativeAndroid() && (
        <button
          onClick={() => restoreMutation.mutate()}
          disabled={restoreMutation.isPending}
          className="w-full h-10 rounded-xl border border-ink-200 text-ink-700 text-sm font-medium hover:bg-ink-50 transition-colors flex items-center justify-center gap-2 mb-6 disabled:opacity-50"
        >
          {restoreMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Heart className="w-4 h-4" />
          )}
          Restore previous purchase
        </button>
      )}

      {/* Trust signals */}
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {[
          { icon: Shield, label: 'Cancel anytime' },
          { icon: TrendingUp, label: '2x more matches on average' },
          { icon: BadgeCheck, label: '7-day refund window' },
        ].map((t) => (
          <div
            key={t.label}
            className="flex items-center gap-2 px-3 py-2.5 bg-cream-100/60 rounded-xl text-xs text-ink-700"
          >
            <t.icon className="w-3.5 h-3.5 text-ink-500 shrink-0" />
            {t.label}
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="mb-8">
        <h2 className="font-display font-bold text-xl text-ink-900 mb-3">Questions</h2>
        <div className="bg-white rounded-2xl border border-ink-100/80 px-5">
          {FAQ.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="text-center text-xs text-ink-500 leading-relaxed">
        Prices in USD. On Android, charged through Google Play. On web, charged through
        Stripe. Cancel anytime from this page or your app store subscription settings.
      </div>
    </div>
  );
}