import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const nav = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post<{ resetToken?: string }>('/auth/forgot-password', { email });
      setToken(res?.resetToken ?? null);
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="card p-8">
        <h1 className="font-display font-bold text-2xl text-ink-900">Reset password</h1>
        <p className="text-sm text-ink-600 mt-1">
          Enter your email and we'll generate a reset link for your account.
        </p>
        {sent ? (
          <div className="mt-6 space-y-3">
            <div className="p-4 bg-mint-100 text-mint-700 rounded-xl text-sm">
              {token ? (
                <>
                  A reset token was generated for <strong>{email}</strong>. Because email
                  delivery isn't configured yet, your reset token is shown here:
                  <div className="mt-2 font-mono text-xs bg-white/60 rounded-lg p-2 break-all select-all">
                    {token}
                  </div>
                  <div className="mt-2 text-xs text-mint-600">
                    It expires in 1 hour and can only be used once.
                  </div>
                </>
              ) : (
                <>If an account exists for <strong>{email}</strong>, a reset link has been sent.</>
              )}
            </div>
            {token && (
              <button
                onClick={() => nav(`/reset-password?token=${encodeURIComponent(token)}`)}
                className="btn-primary w-full justify-center"
              >
                Continue to choose new password
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Generating…' : 'Send reset link'}
            </button>
          </form>
        )}
        <div className="text-sm text-ink-600 text-center mt-6">
          <Link to="/login" className="text-coral-600 font-semibold hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}