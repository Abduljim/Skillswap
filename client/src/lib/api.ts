// API client with runtime-resolved base URL.
//
// Resolution order:
//   1. window.__SKILLSWAP_API_URL__  (set by main.tsx from build-time VITE_API_URL)
//   2. /config.json                 (shipped inside the APK, easy to edit and repackage)
//   3. /api                          (same-origin, used in browser dev)
//
// To repoint an already-built APK at a new backend without recompiling TypeScript:
//   - Edit client/dist/config.json (and re-run `npx cap sync android`)
//     OR
//   - Edit android/app/src/main/assets/public/config.json directly, then rebuild the APK.

declare const window: any;

let baseUrl = '/api';
let resolved = false;

async function resolveBaseUrl(): Promise<string> {
  if (resolved) return baseUrl;
  resolved = true;

  const inline = (typeof window !== 'undefined' && window.__SKILLSWAP_API_URL__) || '';
  if (inline) {
    baseUrl = `${inline.replace(/\/$/, '')}/api`;
    return baseUrl;
  }

  // Try runtime config file
  try {
    const r = await fetch('/config.json', { credentials: 'omit' });
    if (r.ok) {
      const cfg = await r.json();
      if (cfg && typeof cfg.apiUrl === 'string' && cfg.apiUrl.length > 0) {
        baseUrl = `${cfg.apiUrl.replace(/\/$/, '')}/api`;
        return baseUrl;
      }
    }
  } catch {
    // ignore — fall through to /api
  }

  return baseUrl;
}

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status: number;
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await resolveBaseUrl();
  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });
  const data = await res.json().catch(() => ({ success: false, error: { message: 'Network error' } }));
  if (!res.ok || !data.success) {
    const error = data.error || { code: 'UNKNOWN', message: 'Request failed' };
    throw new ApiError(error.code, error.message, res.status, error.details);
  }
  return data.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: any) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Eagerly kick off resolution so first user action is faster
resolveBaseUrl();