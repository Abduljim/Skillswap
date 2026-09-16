import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../lib/api';
import { Shield, KeyRound, Moon, Sun, Crown } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: subData } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<{ tier: 'FREE' | 'PRO' }>('/subscription'),
  });
  const isPro = subData?.tier === 'PRO';

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 8) {
      toast.push({ type: 'error', title: 'New password must be at least 8 characters' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: currentPwd,
        newPassword: newPwd,
      });
      toast.push({ type: 'success', title: 'Password changed' });
      setCurrentPwd('');
      setNewPwd('');
    } catch (err: any) {
      toast.push({ type: 'error', title: 'Could not change password', body: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-display font-bold text-3xl text-ink-900">Settings</h1>

      <div className="card p-6">
        <h2 className="font-display font-bold text-lg text-ink-900 mb-3">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-500">Name</span><span>{user?.displayName}</span></div>
          <div className="flex justify-between"><span className="text-ink-500">Email</span><span>{user?.email}</span></div>
          <div className="flex justify-between"><span className="text-ink-500">Role</span><span>{user?.isAdmin ? 'Admin' : 'Member'}</span></div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-display font-bold text-lg text-ink-900 mb-3 flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Password
        </h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="label">Current password</label>
            <input
              className="input"
              type="password"
              required
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving…' : 'Change password'}
          </button>
          <div className="text-xs text-ink-500">
            Forgot your password? Use the <span className="text-coral-600 font-medium">Forgot password</span> flow
            on the login screen instead.
          </div>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="font-display font-bold text-lg text-ink-900 mb-3 flex items-center gap-2">
          <Moon className="w-4 h-4" /> Appearance
        </h2>
        {isPro ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Dark mode</div>
              <div className="text-xs text-ink-500">
                {theme === 'dark' ? 'Currently using dark theme.' : 'Currently using light theme.'}
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                theme === 'dark' ? 'bg-ink-900' : 'bg-cream-200'
              }`}
              aria-label="Toggle dark mode"
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-soft-sm transition-transform ${
                  theme === 'dark' ? 'translate-x-7' : 'translate-x-1'
                }`}
              >
                {theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-ink-700" /> : <Sun className="w-3.5 h-3.5 text-coral-500" />}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Dark mode</div>
              <div className="text-xs text-ink-500">A Pro feature — easy on the eyes at night.</div>
            </div>
            <Link to="/membership" className="btn-coral text-xs px-3 py-2 shrink-0">
              <Crown className="w-3 h-3" /> Upgrade
            </Link>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-display font-bold text-lg text-ink-900 mb-3 flex items-center gap-2">
          <Crown className="w-4 h-4 text-coral-500" /> Membership
        </h2>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{isPro ? 'Pro plan' : 'Free plan'}</div>
            <div className="text-xs text-ink-500">
              {isPro
                ? 'You have unlimited requests, boosts & Pro perks. (Admins get Pro free.)'
                : 'Unlock dark mode, badges, unlimited requests, boosts & more.'}
            </div>
          </div>
          <Link to="/membership" className="btn-outline text-xs px-3 py-2 shrink-0">
            {isPro ? 'Manage' : 'See plans'}
          </Link>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-display font-bold text-lg text-ink-900 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4" /> Safety
        </h2>
        <p className="text-sm text-ink-600">
          You can block users from their profile page. Blocked users will not appear in your matches, search, or exchanges.
        </p>
      </div>
    </div>
  );
}