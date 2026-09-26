/**
 * TURN configuration for WebRTC calls.
 *
 * Why this lives on the server
 * ----------------------------
 * Two peers behind carrier-grade NAT — the normal case on mobile data — cannot
 * reach each other with STUN alone; they need a relay. A relay needs
 * credentials, and credentials baked into a client bundle are public: anyone can
 * unpack the APK and relay their own traffic through your server.
 *
 * So the secret stays here and each authenticated client is handed a credential
 * that expires (default: one hour). That is coturn's REST API scheme
 * (`use-auth-secret`):
 *
 *   username   = "<unix expiry>:<realm>"
 *   credential = base64(HMAC-SHA1(static-auth-secret, username))
 *
 * coturn recomputes the HMAC and rejects the allocation once the expiry passes.
 * Nothing is stored, so there is no session state to clean up.
 *
 * Providers without HMAC support (Xirsys, Metered static keys) are handled by
 * falling back to TURN_USERNAME / TURN_CREDENTIAL — less safe, because those do
 * reach the client, but it keeps the option open without a code change.
 */
import crypto from 'node:crypto';
import { env } from '../config/env';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  /** False when no relay is configured: calls will only work if a direct route exists. */
  turnConfigured: boolean;
  /** 'ephemeral' = minted per request, 'static' = shared credentials, 'none' = STUN only. */
  mode: 'ephemeral' | 'static' | 'none';
  /** Seconds until a minted credential expires; 0 for static/none. */
  ttlSeconds: number;
}

/** Public STUN, always offered — it is free and covers the easy cases. */
export const STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

/** Accepts a comma-separated list and drops blanks. */
export function parseTurnUrls(raw: string): string[] {
  return raw
    .split(',')
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && /^(turn|turns)s?:/.test(u));
}

export interface MintedCredential {
  username: string;
  credential: string;
  /** Unix seconds at which coturn stops accepting this credential. */
  expires: number;
}

/**
 * Mint one coturn REST-API credential.
 * Exported for tests: the value is recomputed there to prove the server and
 * coturn agree on the format, rather than just asserting it is non-empty.
 */
export function mintTurnCredential(
  secret: string,
  realm: string,
  ttlSeconds: number,
  nowMs: number = Date.now()
): MintedCredential {
  const expires = Math.floor(nowMs / 1000) + ttlSeconds;
  const username = `${expires}:${realm}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential, expires };
}

/**
 * Build the iceServers list for one client request.
 * @param nowMs injectable for tests.
 */
export function buildIceConfig(nowMs: number = Date.now()): IceConfig {
  const urls = parseTurnUrls(env.TURN_URLS);
  const base: IceServer[] = [{ urls: STUN_URLS }];

  if (urls.length === 0) {
    return { iceServers: base, turnConfigured: false, mode: 'none', ttlSeconds: 0 };
  }

  if (env.TURN_SECRET) {
    const ttl = Number.isFinite(env.TURN_TTL_SECONDS) && env.TURN_TTL_SECONDS > 0
      ? env.TURN_TTL_SECONDS
      : 3600;
    const { username, credential } = mintTurnCredential(env.TURN_SECRET, env.TURN_REALM, ttl, nowMs);
    return {
      iceServers: [...base, { urls, username, credential }],
      turnConfigured: true,
      mode: 'ephemeral',
      ttlSeconds: ttl,
    };
  }

  if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    return {
      iceServers: [...base, { urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }],
      turnConfigured: true,
      mode: 'static',
      ttlSeconds: 0,
    };
  }

  // URLs but no credentials: the relay would reject every allocation, so say so
  // rather than advertising a relay that cannot be used.
  return { iceServers: base, turnConfigured: false, mode: 'none', ttlSeconds: 0 };
}

/**
 * Human-readable summary for the startup log, so a misconfigured relay is
 * visible in the deploy log instead of surfacing as "calls never connect".
 * Never prints the secret or a credential.
 */
export function describeTurnConfig(): string {
  const cfg = buildIceConfig();
  const urls = parseTurnUrls(env.TURN_URLS);
  if (cfg.mode === 'none') {
    return urls.length
      ? `TURN urls set but no credentials — calls will fall back to direct/STUN only`
      : `TURN not configured — calls need a direct route (both peers behind CGNAT will fail). See docs/TURN.md`;
  }
  return `TURN ${cfg.mode} (${urls.length} url${urls.length === 1 ? '' : 's'}, ttl ${cfg.ttlSeconds}s)`;
}
