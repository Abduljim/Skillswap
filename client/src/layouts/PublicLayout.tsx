import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PublicLayout() {
  const { user } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass-nav border-b border-ink-100 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-ink-900 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-coral-500" />
            </div>
            <span className="font-display font-bold text-lg text-ink-900">SkillSwap</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <NavLink to="/" className={({ isActive }) => isActive ? 'text-ink-900 font-semibold' : 'text-ink-600 hover:text-ink-900'}>
              Home
            </NavLink>
            <a href="#how" className="text-ink-600 hover:text-ink-900">How it works</a>
            <a href="#skills" className="text-ink-600 hover:text-ink-900">Skills</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <button onClick={() => nav('/dashboard')} className="btn-primary">
                Dashboard
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
        © {new Date().getFullYear()} SkillSwap — trade what you know
      </footer>
    </div>
  );
}