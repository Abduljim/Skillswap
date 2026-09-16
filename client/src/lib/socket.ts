import { io, Socket } from 'socket.io-client';
import { getToken } from './session';

declare const window: any;

let resolvedOrigin = '';
let resolved = false;

async function resolveOrigin(): Promise<string> {
  if (resolved && resolvedOrigin) return resolvedOrigin;
  resolved = true;

  const inline = (typeof window !== 'undefined' && window.__SKILLSWAP_API_URL__) || '';
  if (inline) {
    resolvedOrigin = inline.replace(/\/api$/, '').replace(/\/$/, '');
    return resolvedOrigin;
  }

  try {
    const r = await fetch('/config.json', { credentials: 'omit' });
    if (r.ok) {
      const cfg = await r.json();
      if (cfg && typeof cfg.apiUrl === 'string' && cfg.apiUrl.length > 0) {
        resolvedOrigin = cfg.apiUrl.replace(/\/api$/, '').replace(/\/$/, '');
        return resolvedOrigin;
      }
    }
  } catch {
    // ignore — fall through
  }

  resolvedOrigin = window.location.origin;
  return resolvedOrigin;
}

export async function createSocket(): Promise<Socket> {
  const origin = await resolveOrigin();
  return io(origin, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    auth: { token: getToken() || undefined },
  });
}