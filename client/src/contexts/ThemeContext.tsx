import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type AppTheme = 'light' | 'dark' | 'ocean' | 'midnight' | 'forest' | 'sunset';

export interface ThemeDef {
  id: AppTheme;
  label: string;
  desc: string;
  /** hard-code to the swatch gradient classes below */
  swatch: string;
  dark: boolean;
  /** additional color themes are a Pro perk */
  pro: boolean;
}

export const THEMES: ThemeDef[] = [
  { id: 'light', label: 'Light', desc: 'Clean & bright', swatch: 'bg-gradient-to-br from-cream-50 to-cream-200', dark: false, pro: false },
  { id: 'dark', label: 'Dark', desc: 'Easy on the eyes', swatch: 'bg-gradient-to-br from-ink-900 to-ink-700', dark: true, pro: false },
  { id: 'ocean', label: 'Ocean', desc: 'Cool teal waters', swatch: 'bg-gradient-to-br from-teal-200 via-cyan-100 to-cyan-300', dark: false, pro: true },
  { id: 'forest', label: 'Forest', desc: 'Fresh green calm', swatch: 'bg-gradient-to-br from-emerald-200 via-green-100 to-green-300', dark: false, pro: true },
  { id: 'sunset', label: 'Sunset', desc: 'Warm golden hour', swatch: 'bg-gradient-to-br from-amber-200 via-orange-100 to-orange-300', dark: false, pro: true },
  { id: 'midnight', label: 'Midnight', desc: 'Deep navy night', swatch: 'bg-gradient-to-br from-blue-950 via-slate-900 to-slate-800', dark: true, pro: true },
];

const THEME_KEY = 'skillswap_theme';

const META_COLOR: Record<AppTheme, string> = {
  light: '#f5f2ec',
  dark: '#101218',
  ocean: '#f0f9f7',
  forest: '#f3f9f4',
  sunset: '#fdf6ee',
  midnight: '#0b1220',
};

function initialTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.some((t) => t.id === saved)) return saved as AppTheme;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch { /* ignore */ }
  return 'light';
}

interface ThemeState {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  themes: ThemeDef[];
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(initialTheme);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* ignore */ }
    const root = document.documentElement;
    if (theme === 'light') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    // Keep WebView/status bar in sync
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLOR[theme]);
  }, [theme]);

  const context: ThemeState = {
    theme,
    setTheme,
    themes: THEMES,
  };

  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}