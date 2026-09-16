import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFailed(false);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="card p-8">
        <h1 className="font-display font-bold text-2xl text-ink-900">Reset password</h1>
        <p className="text-sm text-ink-600 mt-1">
          Enter your email to request a password reset link.
        </p>
        {sent ? (
          <div role="status" className="mt-6 p-4 bg-mint-100 text-mint-700 rounded-xl text-sm">
            If an account exists for that email, you will receive a password reset link.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {failed && (
              <div role="alert" className="rounded-xl bg-coral-50 text-coral-700 text-sm p-3">
                Couldn't send the request. Check your connection and try again.
              </div>
            )}
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
              {loading ? 'Sending…' : failed ? 'Try again' : 'Send reset link'}
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