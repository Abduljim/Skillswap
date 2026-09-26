/**
 * ICE configuration for calls.
 *
 * TURN credentials are minted by the API per request (see
 * server/src/services/turn.service.ts) instead of being compiled into the app.
 * A static VITE_TURN_CREDENTIAL is readable by anyone who unpacks the APK, and
 * they could then relay their own traffic on our bandwidth. Fetching them also
 * means credentials can be rotated without shipping a new build.
 *
 * Fallback order, because a call must still be attempted when the API is slow or
 * the relay is not configured:
 *   1. GET /api/calls/ice-servers  — minted, short-lived (the normal path)
 *   2. VITE_TURN_* env values      — static credentials, opt-in escape hatch for
 *                                    providers without HMAC support, and for a
 *                                    build pointed at an API that predates the
 *                                    endpoint
 *   3. public STUN only            — works when a direct route exists
 *
 * In case 3 the call usually fails if both peers are behind carrier-grade NAT,
 * which is the normal case on mobile data. `turnConfigured: false` is surfaced so
 * the UI can say that out loud instead of showing an endless "connecting…".
 */
import { api } from './api';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  /** False when no relay is configured: a call only connects on a direct route. */
  turnConfigured: boolean;
  /** Mirrors the server: how the credentials were produced. */
  mode: 'ephemeral' | 'static' | 'none';
  /** Lifetime of a minted credential in seconds; 0 for static/none. */
  ttlSeconds: number;
}

export interface CallLimits {
  /** Group-call mesh cap, including the caller. Enforced by the socket layer. */
  maxGroupCallParticipants: number;
  /** Groups start audio-only; the camera is opt-in per participant. */
  groupCallsAudioFirst: boolean;
}

/** Public STUN: free, no credentials, and enough when a direct route exists. */
export const STUN_ONLY: IceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export const STUN_ONLY_CONFIG: IceConfig = {
  iceServers: STUN_ONLY,
  turnConfigured: false,
  mode: 'none',
  ttlSeconds: 0,
};

/** Used when GET /api/calls/limits is unreachable; mirrors the server default. */
export const DEFAULT_CALL_LIMITS: CallLimits = {
  maxGroupCallParticipants: 4,
  groupCallsAudioFirst: true,
};

/** How long call setup will wait for the API before falling back. */
const FETCH_TIMEOUT_MS = 1500;

function envConfig(): IceConfig | null {
  const raw = String(import.meta.env.VITE_TURN_URLS || '');
  const urls = raw
    .split(',')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  const username = String(import.meta.env.VITE_TURN_USERNAME || '');
  const credential = String(import.meta.env.VITE_TURN_CREDENTIAL || '');
  if (urls.length === 0 || !username || !credential) return null;
  return {
    iceServers: [...STUN_ONLY, { urls, username, credential }],
    turnConfigured: true,
    mode: 'static',
    ttlSeconds: 0,
  };
}

let iceCache: { at: number; cfg: IceConfig } | null = null;
let inflight: Promise<IceConfig> | null = null;
let limitsCache: CallLimits | null = null;

/**
 * A minted credential is refreshed at 80% of its lifetime. coturn re-validates
 * the expiry on every allocation refresh, so a credential that lapses mid-call
 * would tear the relay down underneath an active conversation.
 */
function isFresh(entry: { at: number; cfg: IceConfig }, now = Date.now()): boolean {
  const ttlMs = entry.cfg.ttlSeconds > 0 ? entry.cfg.ttlSeconds * 1000 : 5 * 60 * 1000;
  return now - entry.at < ttlMs * 0.8;
}

async function fetchIce(): Promise<IceConfig> {
  const cfg = await api.get<IceConfig>('/calls/ice-servers');
  if (!cfg || !Array.isArray(cfg.iceServers)) throw new Error('malformed ice-servers response');
  return cfg;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * ICE config for a call. Safe to await inside call setup: it never throws and
 * never takes longer than `timeoutMs`, degrading to the env config or STUN.
 */
export async function getIceConfig(options?: { force?: boolean; timeoutMs?: number }): Promise<IceConfig> {
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;

  if (!options?.force && iceCache && isFresh(iceCache)) return iceCache.cfg;
  if (!options?.force && inflight) return inflight;

  inflight = withTimeout(fetchIce(), timeoutMs)
    .then((cfg) => {
      iceCache = { at: Date.now(), cfg };
      return cfg;
    })
    .catch(() => {
      // Keep a stale-but-valid config over falling back to STUN: an expired
      // credential can still work for the allocation already in progress, and a
      // momentary API blip should not silently downgrade every call.
      if (iceCache && iceCache.cfg.turnConfigured) return iceCache.cfg;
      return envConfig() ?? STUN_ONLY_CONFIG;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/**
 * Synchronous accessor for code paths that cannot await (a peer connection being
 * constructed inside a callback). Returns the cache if it is still fresh,
 * otherwise the env config or STUN — and kicks off a refresh for next time.
 */
export function getIceConfigSync(): IceConfig {
  if (iceCache && isFresh(iceCache)) return iceCache.cfg;
  void getIceConfig().catch(() => {});
  return iceCache?.cfg ?? envConfig() ?? STUN_ONLY_CONFIG;
}

/** Drop the cache on sign-out, so the next user does not reuse a credential. */
export function invalidateIceConfig(): void {
  iceCache = null;
  limitsCache = null;
}

/** Group-call limits, so the picker stops at the server's cap. */
export async function getCallLimits(): Promise<CallLimits> {
  if (limitsCache) return limitsCache;
  try {
    const limits = await withTimeout(api.get<CallLimits>('/calls/limits'), FETCH_TIMEOUT_MS);
    if (limits && typeof limits.maxGroupCallParticipants === 'number') {
      limitsCache = limits;
      return limits;
    }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_CALL_LIMITS;
}

export function getCallLimitsSync(): CallLimits {
  return limitsCache ?? DEFAULT_CALL_LIMITS;
}
