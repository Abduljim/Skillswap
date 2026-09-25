import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

/**
 * App themes, wallpapers and dark mode.
 *
 * SIX wallpapers: one free ("Linen", deliberately plain) and five Pro. Every
 * wallpaper paints the whole app from pure CSS (layered gradients + inline SVG
 * data-URIs) — no image assets, so it works offline in the APK and costs
 * nothing to ship. The same `--wp-image` variable is reused by the chat screen
 * (see `.chat-white` / `.chat-dark` in index.css) so conversations match the app.
 *
 * Dark mode is a separate Pro switch (`mode`) that re-renders whichever
 * wallpaper is active with a dark palette — including the message section,
 * which used to have its own disconnected dark toggle. Graphite and Midnight
 * are dark-only wallpapers and always render dark.
 *
 * Legacy ids from older APK builds (themes forest/gold/sky/rose, frames
 * frame_0..frame_11) are not in these lists; unknown values fall back to the
 * free option instead of failing.
 */
export type AppTheme = 'light' | 'dark' | 'midnight' | 'ocean' | 'sunset' | 'purple';

/** Light/dark rendering of whichever wallpaper is active. A Pro perk. */
export type AppMode = 'light' | 'dark';

export interface ThemeDef {
  id: AppTheme;
  label: string;
  desc: string;
  /** CSS class that paints this wallpaper into a picker tile */
  swatchCls: string;
  /** this wallpaper has no light rendering */
  dark: boolean;
  /** fallback gradient for surfaces with no profile card of their own */
  cardCls: string;
  /** whether that gradient needs light text */
  cardDark: boolean;
  /** the five premium wallpapers are a Pro perk */
  pro: boolean;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'light',
    label: 'Linen',
    desc: 'Clean & bright — free',
    swatchCls: 'wp-preview-linen',
    dark: false,
    cardCls: 'card-color-light',
    cardDark: false,
    pro: false,
  },
  {
    id: 'dark',
    label: 'Graphite',
    desc: 'Soft grid, twin glow',
    swatchCls: 'wp-preview-dark',
    dark: true,
    cardCls: 'card-color-dark',
    cardDark: true,
    pro: true,
  },
  {
    id: 'midnight',
    label: 'Midnight',
    desc: 'Starfield over deep navy',
    swatchCls: 'wp-preview-midnight',
    dark: true,
    cardCls: 'card-color-midnight',
    cardDark: true,
    pro: true,
  },
  {
    id: 'ocean',
    label: 'Ocean',
    desc: 'Teal depth, light caustics',
    swatchCls: 'wp-preview-ocean',
    dark: false,
    cardCls: 'card-color-ocean',
    cardDark: true,
    pro: true,
  },
  {
    id: 'sunset',
    label: 'Ember',
    desc: 'Golden-hour dusk',
    swatchCls: 'wp-preview-sunset',
    dark: false,
    cardCls: 'card-color-sunset',
    cardDark: true,
    pro: true,
  },
  {
    id: 'purple',
    label: 'Amethyst',
    desc: 'Royal violet facets',
    swatchCls: 'wp-preview-purple',
    dark: false,
    cardCls: 'card-color-purple',
    cardDark: true,
    pro: true,
  },
];

export const FREE_THEME: AppTheme = 'light';
export const FREE_MODE: AppMode = 'light';

const THEME_KEY = 'skillswap_theme';
/**
 * Shared with the chat screen's dark switch, which existed before dark mode
 * became an app-wide setting. One key means the two can never disagree, and an
 * existing Pro user's chat preference carries over.
 */
const MODE_KEY = 'skillswap_chat_mode';

const META_COLOR: Record<AppTheme, string> = {
  light: '#f5f2ec',
  dark: '#101218',
  midnight: '#0b1220',
  ocean: '#f0f9f7',
  sunset: '#fdf6ee',
  purple: '#f6f1fd',
};

function initialTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.some((t) => t.id === saved)) return saved as AppTheme;
  } catch { /* ignore */ }
  // A fresh install always starts on the free wallpaper, even if the OS is in
  // dark mode — the premium dark wallpapers are a Pro perk.
  return FREE_THEME;
}

function initialMode(): AppMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'dark') return 'dark';
    if (saved === 'light') return 'light';
  } catch { /* ignore */ }
  return FREE_MODE;
}

interface ThemeState {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  themes: ThemeDef[];
  activeTheme: ThemeDef;
  /** light/dark rendering of the active wallpaper (Pro perk) */
  mode: AppMode;
  setMode: (m: AppMode) => void;
  /**
   * True when the app renders dark — either because dark mode is on, or because
   * the wallpaper itself is dark-only (Graphite, Midnight).
   */
  isDark: boolean;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(initialTheme);
  const [mode, setModeState] = useState<AppMode>(initialMode);
  const activeTheme = THEMES.find((t) => t.id === theme) ?? THEMES[0]!;
  const isDark = mode === 'dark' || activeTheme.dark;

  /** Anything outside the catalogue (e.g. a retired theme id) falls back to free. */
  const setTheme = (t: AppTheme) => {
    setThemeState(THEMES.some((x) => x.id === t) ? t : FREE_THEME);
  };
  const setMode = (m: AppMode) => setModeState(m === 'dark' ? 'dark' : FREE_MODE);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* ignore */ }
    const root = document.documentElement;
    if (theme === FREE_THEME) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    // Keep the WebView/status bar in sync — dark wins over the wallpaper's own
    // colour so the status bar never turns light above a dark screen.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0b0d12' : META_COLOR[theme]);
  }, [theme, isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch { /* ignore */ }
    const root = document.documentElement;
    if (mode === 'dark') root.setAttribute('data-mode', 'dark');
    else root.removeAttribute('data-mode');
  }, [mode]);

  const context: ThemeState = {
    theme,
    setTheme,
    themes: THEMES,
    activeTheme,
    mode,
    setMode,
    isDark,
  };

  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
