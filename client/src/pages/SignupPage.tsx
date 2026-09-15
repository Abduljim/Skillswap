import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ApiError } from '../lib/api';

export default function SignupPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const nav = useNavigate();
  const toast = useToast();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signup(email, password, displayName);
      toast.push({ type: 'success', title: 'Welcome to SkillSwap!' });
      nav('/onboarding');
    } catch (err) {
      if (err instanceof ApiError) toast.push({ type: 'error', title: 'Sign up failed', body: err.message });
      else toast.push({ type: 'error', title: 'Sign up failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="card p-8">
        <h1 className="font-display font-bold text-2xl text-ink-900">Create your account</h1>
        <p className="text-sm text-ink-600 mt-1">Tell us your name to get started.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label">Display name</label>
            <input
              required
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sarah Okafor"
              minLength={2}
              maxLength={80}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-xs text-ink-500 mt-1">At least 8 characters.</p>
          </div>
          <button type="submit" disabled={loading} className="btn-coral w-full justify-center">
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <div className="text-sm text-ink-600 text-center mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-coral-600 font-semibold hover:underline">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}