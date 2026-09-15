import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { Home, Compass, Repeat, MessageSquare, User, Bell, LogOut, Shield, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import clsx from 'clsx';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications: any[]; unreadCount: number }>('/notifications'),
    refetchInterval: 30_000,
  });
  const unread = notifData?.unreadCount ?? 0;

  const { data: sub } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<{ tier: 'FREE' | 'PRO' }>('/subscription'),
  });
  const isPro = sub?.tier === 'PRO';

  const navItems = [
    { to: '/dashboard', icon: Home, label: 'Home' },
    { to: '/discover', icon: Compass, label: 'Discover' },
    { to: '/exchanges', icon: Repeat, label: 'Exchanges' },
    { to: '/notifications', icon: MessageSquare, label: 'Messages' },
    { to: '/profile', icon: User, label: 'Profile' },
  ];

  const handleLogout = async () => {
    await logout();
    nav('/');
  };

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Top bar (desktop + tablet) */}
      <header className="hidden md:flex glass-nav border-b border-ink-100 sticky top-0 z-30 h-16 items-center px-6">
        <Link to="/dashboard" className="flex items-center gap-2 mr-8">
          <div className="w-8 h-8 rounded-lg bg-ink-900 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-coral-500" />
          </div>
          <span className="font-display font-bold text-lg text-ink-900">SkillSwap</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors',
                  isActive ? 'bg-ink-900 text-cream-50' : 'text-ink-700 hover:bg-cream-100'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
              {item.to === '/notifications' && unread > 0 && (
                <span className="ml-1 bg-coral-500 text-white text-[10px] rounded-full px-1.5 font-bold">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              clsx(
                'relative p-2 rounded-lg',
                isActive ? 'bg-cream-100 text-ink-900' : 'text-ink-600 hover:bg-cream-100'
              )
            }
          >
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-coral-500 text-white text-[10px] rounded-full font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </NavLink>
          {user?.isAdmin && (
            <Link to="/admin" className="btn-outline" title="Admin">
              <Shield className="w-4 h-4" />
            </Link>
          )}
          <Link
            to="/membership"
            className={`btn-outline text-xs px-2.5 py-1.5 ${isPro ? 'bg-coral-500 text-white border-coral-500 hover:bg-coral-600' : ''}`}
            title="Membership"
          >
            <Crown className="w-4 h-4" />
            <span className="hidden lg:inline">{isPro ? 'Pro' : 'Upgrade'}</span>
          </Link>
          <div className="text-sm text-ink-700 px-3 hidden lg:block">{user?.displayName}</div>
          <button onClick={handleLogout} className="btn-ghost" title="Log out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 glass-nav border-t border-ink-100 pb-safe">
        <div className="grid grid-cols-5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium',
                  isActive ? 'text-ink-900' : 'text-ink-500'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile top bar */}
      <header className="md:hidden glass-nav border-b border-ink-100 sticky top-0 z-30 h-14 flex items-center justify-between px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-ink-900 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-coral-500" />
          </div>
          <span className="font-display font-bold text-base text-ink-900">SkillSwap</span>
        </Link>
        <div className="flex items-center gap-2">
          <NavLink to="/notifications" className="relative p-2 text-ink-600">
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-coral-500 text-white text-[10px] rounded-full font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </NavLink>
          <button onClick={handleLogout} className="p-2 text-ink-600">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>
    </div>
  );
}