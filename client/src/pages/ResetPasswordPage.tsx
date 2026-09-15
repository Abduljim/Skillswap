import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const toast = useToast();

  const token = params.get('token');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      toast.push({ type: 'success', title: 'Password reset. Please log in.' });
      nav('/login');
    } catch (err: any) {
      toast.push({ type: 'error', title: 'Reset failed', body: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="card p-8">
        <h1 className="font-display font-bold text-2xl text-ink-900">Choose a new password</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label">New password</label>
            <input
              type="password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading || !token} className="btn-primary w-full justify-center">
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        <div className="text-sm text-ink-600 text-center mt-6">
          <Link to="/login" className="text-coral-600 font-semibold hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}