import { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Compass, Repeat, MessageSquare, User, Bell, LogOut, Shield, Crown, Settings, WifiOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ensureMediaPermissions } from '../lib/media-permissions';
import type { Conversation } from '../types';
import clsx from 'clsx';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Chat conversations fill the whole screen (like WhatsApp), so the app chrome is hidden there.
  const isFullScreenChat = /^\/messages\/[^/]+$/.test(location.pathname);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // One-time permission prompt for camera + mic so calls work for everyone.
  useEffect(() => {
    void ensureMediaPermissions();
  }, []);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications: any[]; unreadCount: number }>('/notifications'),
    refetchInterval: 30_000,
  });
  const notifUnread = notifData?.unreadCount ?? 0;

  const { data: convData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/messages/conversations'),
    refetchInterval: 30_000,
  });
  const messagesUnread = convData?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;

  const { data: sub } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<{ tier: 'FREE' | 'PRO' }>('/subscription'),
  });
  const isPro = sub ? sub.tier === 'PRO' : (user as any)?.tier === 'PRO';

  const navItems = [
    { to: '/dashboard', icon: Home, label: 'Home', badge: 0 },
    { to: '/discover', icon: Compass, label: 'Discover', badge: 0 },
    { to: '/exchanges', icon: Repeat, label: 'Exchanges', badge: 0 },
    { to: '/messages', icon: MessageSquare, label: 'Messages', badge: messagesUnread },
    { to: '/profile', icon: User, label: 'Profile', badge: 0 },
  ];

  const handleLogout = async () => {
    await logout();
    nav('/');
  };

  return (
    <div className={`min-h-screen ${isFullScreenChat ? '' : 'bg-cream-50'}`}>
      {!online && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-coral-500 text-white text-xs font-semibold px-4 py-2 text-center flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          You are offline. Check your internet connection.
        </div>
      )}
      {/* Top bar (desktop + tablet) */}
      {!isFullScreenChat && (
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
              {item.badge > 0 && (
                <span className="ml-1 bg-coral-500 text-white text-[10px] rounded-full px-1.5 font-bold">
                  {item.badge > 99 ? '99+' : item.badge}
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
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {notifUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-coral-500 text-white text-[10px] rounded-full font-bold flex items-center justify-center">
                {notifUnread}
              </span>
            )}
          </NavLink>
          <Link to="/settings" className="p-2 rounded-lg text-ink-600 hover:bg-cream-100" title="Settings">
            <Settings className="w-5 h-5" />
          </Link>
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
      )}

      {/* Mobile bottom nav */}
      {!isFullScreenChat && (
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
              {item.badge > 0 && (
                <span className="absolute top-1.5 right-1/2 translate-x-5 w-4 h-4 bg-coral-500 text-white text-[10px] rounded-full font-bold flex items-center justify-center">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      )}

      {/* Mobile top bar */}
      {!isFullScreenChat && (
      <header className="md:hidden glass-nav border-b border-ink-100 sticky top-0 z-30 h-14 flex items-center justify-between px-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-ink-900 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-coral-500" />
          </div>
          <span className="font-display font-bold text-base text-ink-900">SkillSwap</span>
        </Link>
        <div className="flex items-center gap-1">
          <NavLink
            to="/membership"
            className={({ isActive }) =>
              clsx(
                'p-2 rounded-lg text-ink-600',
                isPro ? 'text-coral-500' : '',
                isActive ? 'bg-cream-100 text-ink-900' : ''
              )
            }
            title={isPro ? 'Pro active' : 'Upgrade to Pro'}
          >
            <Crown className="w-5 h-5" />
          </NavLink>
          <NavLink to="/settings" className="p-2 text-ink-600" title="Settings">
            <Settings className="w-5 h-5" />
          </NavLink>
          <NavLink to="/notifications" className="relative p-2 text-ink-600">
            <Bell className="w-5 h-5" />
            {notifUnread > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-coral-500 text-white text-[10px] rounded-full font-bold flex items-center justify-center">
                {notifUnread}
              </span>
            )}
          </NavLink>
          <button onClick={handleLogout} className="p-2 text-ink-600">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>
      )}

      <main className={isFullScreenChat ? '' : 'max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6'}>
        <Outlet />
      </main>
    </div>
  );
}