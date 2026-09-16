import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../lib/api';
import { Shield, KeyRound } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [loading, setLoading] = useState(false);

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
          <Shield className="w-4 h-4" /> Safety
        </h2>
        <p className="text-sm text-ink-600">
          You can block users from their profile page. Blocked users will not appear in your matches, search, or exchanges.
        </p>
      </div>
    </div>
  );
}