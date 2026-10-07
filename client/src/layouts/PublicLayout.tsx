import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PublicLayout() {
  const { user } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass-nav border-b border-ink-100 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* One logo per bar: signed-in users already get the dashboard logo
              at the right, so the left brand would double it. */}
          {user ? (
            <span aria-hidden="true" />
          ) : (
            <Link to="/" className="flex items-center gap-2">
              <img src="/app-logo.png" alt="SkillSwap" className="w-9 h-9 rounded-xl" />
              <span className="font-display font-bold text-lg text-ink-900">SkillSwap</span>
            </Link>
          )}
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <NavLink to="/" className={({ isActive }) => isActive ? 'text-ink-900 font-semibold' : 'text-ink-600 hover:text-ink-900'}>
              Home
            </NavLink>
            <a href="#how" className="text-ink-600 hover:text-ink-900">How it works</a>
            <a href="#skills" className="text-ink-600 hover:text-ink-900">Skills</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <button
                onClick={() => nav('/dashboard')}
                aria-label="Open your dashboard"
                title="Open your dashboard"
                className="shrink-0 active:scale-95"
              >
                <img src="/app-logo.png" alt="SkillSwap" className="w-9 h-9 rounded-xl" />
              </button>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Log in</Link>
                <Link to="/signup" className="btn-primary">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-ink-100 py-8 text-center text-xs text-ink-500">
        <div className="flex items-center justify-center gap-4 mb-2">
          <Link to="/privacy" className="hover:text-ink-900">Privacy</Link>
          <Link to="/terms" className="hover:text-ink-900">Terms</Link>
        </div>
        © {new Date().getFullYear()} SkillSwap. Trade what you know.
      </footer>
    </div>
  );
}