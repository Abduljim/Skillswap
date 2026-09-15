import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../lib/api';
import { Shield, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [loading, setLoading] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // No direct /change-password endpoint exposed; use reset for now.
      toast.push({ type: 'info', title: 'Use forgot password to reset.' });
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
        <h2 className="font-display font-bold text-lg text-ink-900 mb-3">Password</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <input className="input" type="password" placeholder="Current password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
          <input className="input" type="password" placeholder="New password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          <Link to="/forgot-password" className="text-xs text-coral-600 hover:underline">
            Forgot your password?
          </Link>
          <div>
            <button type="button" className="btn-outline" disabled>
              Use forgot password flow to change password
            </button>
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