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

import { getToken } from './session';

declare const window: any;

let baseUrlPromise: Promise<string> | undefined;

async function loadBaseUrl(): Promise<string> {
  const inline = import.meta.env.VITE_API_URL ||
    (typeof window !== 'undefined' && window.__SKILLSWAP_API_URL__) || '';
  if (inline) return `${inline.replace(/\/$/, '')}/api`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch('/config.json', {
      credentials: 'omit',
      signal: controller.signal,
    });
    if (response.ok) {
      const config = await response.json();
      if (typeof config?.apiUrl === 'string' && config.apiUrl.length > 0) {
        return `${config.apiUrl.replace(/\/$/, '')}/api`;
      }
    }
    return '/api';
  } finally {
    clearTimeout(timer);
  }
}

function resolveBaseUrl(): Promise<string> {
  if (!baseUrlPromise) {
    baseUrlPromise = loadBaseUrl().catch((error) => {
      baseUrlPromise = undefined;
      throw error;
    });
  }
  return baseUrlPromise;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const base = await resolveBaseUrl();
    const token = getToken();
    const res = await fetch(`${base}${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const error = data.error || { code: 'UNKNOWN', message: 'Request failed' };
      throw new ApiError(error.code, error.message, res.status, error.details);
    }
    return data.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new ApiError('TIMEOUT', 'The request took too long. Check your connection and try again.', 0);
    }
    throw new ApiError('NETWORK', navigator.onLine
      ? 'Unable to reach the server. Please try again.'
      : 'You are offline. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: any) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};