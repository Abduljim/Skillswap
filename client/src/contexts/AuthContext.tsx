import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { getToken, setToken, clearToken } from '../lib/session';
import type { User } from '../types';

const USER_KEY = 'skillswap_user';

function cacheUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}

function cachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => (getToken() ? cachedUser() : null));
  const [loading, setLoading] = useState(true);

  const setAndCache = (u: User | null) => {
    setUser(u);
    cacheUser(u);
  };

  const refresh = async () => {
    try {
      const data = await api.get<User>('/auth/me');
      setAndCache(data);
    } catch (e) {
      // Only a real auth failure (expired/invalid token) should sign the user out.
      // Transient errors (offline on cold start, server restarting) must keep the
      // last known session so users aren't logged out when they reopen the app.
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401 || status === 403) {
        clearToken();
        setAndCache(null);
      }
      // else: keep optimistic cached user; next successful request restores the session.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api.post<{ user: User; token?: string }>('/auth/login', { email, password });
    if (data.token) setToken(data.token);
    setAndCache(data.user);
  };

  const signup = async (email: string, password: string, displayName: string) => {
    const data = await api.post<{ user: User; token?: string }>('/auth/signup', {
      email,
      password,
      displayName,
    });
    if (data.token) setToken(data.token);
    setAndCache(data.user);
  };

  const logout = async () => {
    clearToken();
    setAndCache(null);
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore — local session dropped regardless
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}