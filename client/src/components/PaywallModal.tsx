import { Link } from 'react-router-dom';
import { Sparkles, X, Crown, Check, Zap } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
  title?: string;
}

export default function PaywallModal({ open, onClose, reason, title = 'Upgrade to Pro' }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-soft-lg relative animate-slide-up">
        <button onClick={onClose} className="absolute top-3 right-3 p-2 text-ink-500 hover:text-ink-900">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-coral-100 flex items-center justify-center text-coral-500 mb-3">
            <Crown className="w-7 h-7" />
          </div>
          <h2 className="font-display font-bold text-2xl text-ink-900">{title}</h2>
          {reason && <p className="text-sm text-ink-600 mt-2">{reason}</p>}
        </div>
        <ul className="mt-5 space-y-2 text-sm text-ink-700">
          <li className="flex items-center gap-2"><Check className="w-4 h-4 text-coral-500" /> Unlimited pending requests</li>
          <li className="flex items-center gap-2"><Check className="w-4 h-4 text-coral-500" /> Unlimited active exchanges</li>
          <li className="flex items-center gap-2"><Check className="w-4 h-4 text-coral-500" /> See who viewed your profile</li>
          <li className="flex items-center gap-2"><Zap className="w-4 h-4 text-coral-500" /> Boost visibility</li>
          <li className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-coral-500" /> Pro badge</li>
        </ul>
        <div className="mt-6 flex gap-2">
          <Link to="/membership" onClick={onClose} className="btn-coral flex-1 justify-center">
            See plans
          </Link>
          <button onClick={onClose} className="btn-outline">Maybe later</button>
        </div>
      </div>
    </div>
  );
}