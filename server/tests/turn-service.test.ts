/**
 * TURN credential minting — the part of "calls actually work" that is easy to
 * get subtly wrong.
 *
 * These are pure unit tests (no database, no HTTP): buildIceConfig reads `env` at
 * call time, so each case sets the fields it needs and restores them afterwards.
 *
 * The important assertion is not "a credential came back" but that it is the
 * credential coturn will accept: `username = "<expiry>:<realm>"` and
 * `credential = base64(HMAC-SHA1(secret, username))`. If either half drifts, the
 * relay rejects every allocation and calls fail only in production, where they are
 * impossible to distinguish from a firewall problem.
 */
import crypto from 'node:crypto';
import { env } from '../src/config/env';
import {
  STUN_URLS,
  buildIceConfig,
  describeTurnConfig,
  mintTurnCredential,
  parseTurnUrls,
} from '../src/services/turn.service';

const TURN_FIELDS = [
  'TURN_URLS',
  'TURN_SECRET',
  'TURN_REALM',
  'TURN_TTL_SECONDS',
  'TURN_USERNAME',
  'TURN_CREDENTIAL',
] as const;

let saved: Record<string, unknown>;

beforeEach(() => {
  saved = {};
  for (const key of TURN_FIELDS) saved[key] = (env as any)[key];
});

afterEach(() => {
  for (const key of TURN_FIELDS) (env as any)[key] = saved[key];
});

/** STUN is free and always offered, so it is the floor under every mode. */
function stunOnly(cfg: ReturnType<typeof buildIceConfig>) {
  return cfg.iceServers.filter((s) => !s.username && !s.credential);
}

describe('parseTurnUrls', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseTurnUrls('turn:a.example.com:3478, turns:a.example.com:5349?transport=tcp')).toEqual([
      'turn:a.example.com:3478',
      'turns:a.example.com:5349?transport=tcp',
    ]);
  });

  it('drops blanks and anything that is not a TURN url', () => {
    // A stray stun: entry in TURN_URLS must not be handed back with credentials —
    // browsers reject a STUN server that carries a username.
    expect(parseTurnUrls('stun:stun.l.google.com:19302,,  ,turn:relay.example.com:3478,https://x')).toEqual([
      'turn:relay.example.com:3478',
    ]);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(parseTurnUrls('')).toEqual([]);
  });
});

describe('mintTurnCredential', () => {
  it('produces the username/credential pair coturn recomputes', () => {
    const secret = 'test-static-auth-secret';
    const now = Date.UTC(2026, 0, 1, 12, 0, 0); // fixed clock
    const minted = mintTurnCredential(secret, 'skillswap', 3600, now);

    expect(minted.expires).toBe(Math.floor(now / 1000) + 3600);
    expect(minted.username).toBe(`${minted.expires}:skillswap`);
    expect(minted.credential).toBe(
      crypto.createHmac('sha1', secret).update(minted.username).digest('base64')
    );
  });

  it('changes the credential when the expiry rolls over', () => {
    const first = mintTurnCredential('s', 'skillswap', 60, 1_000_000_000_000);
    const second = mintTurnCredential('s', 'skillswap', 60, 1_000_000_061_000);
    expect(second.expires).toBeGreaterThan(first.expires);
    expect(second.credential).not.toBe(first.credential);
  });

  it('is bound to the secret and the realm', () => {
    const now = 1_700_000_000_000;
    const a = mintTurnCredential('secret-a', 'skillswap', 60, now);
    const b = mintTurnCredential('secret-b', 'skillswap', 60, now);
    const c = mintTurnCredential('secret-a', 'other-realm', 60, now);
    expect(a.username).not.toBe(c.username);
    expect(a.credential).not.toBe(b.credential);
    expect(a.credential).not.toBe(c.credential);
  });
});

describe('buildIceConfig', () => {
  it('mints an ephemeral credential when TURN_SECRET is set', () => {
    (env as any).TURN_URLS = 'turn:relay.example.com:3478,turns:relay.example.com:5349?transport=tcp';
    (env as any).TURN_SECRET = 'unit-test-secret';
    (env as any).TURN_REALM = 'skillswap';
    (env as any).TURN_TTL_SECONDS = 1800;
    (env as any).TURN_USERNAME = 'ignored-static-user';
    (env as any).TURN_CREDENTIAL = 'ignored-static-pass';

    const before = Math.floor(Date.now() / 1000);
    const cfg = buildIceConfig();
    const after = Math.floor(Date.now() / 1000);

    expect(cfg.mode).toBe('ephemeral');
    expect(cfg.turnConfigured).toBe(true);
    expect(cfg.ttlSeconds).toBe(1800);

    // STUN first, credentials never attached to it.
    expect(stunOnly(cfg)).toEqual([{ urls: STUN_URLS }]);

    const turn = cfg.iceServers.find((s) => s.username);
    expect(turn?.urls).toEqual([
      'turn:relay.example.com:3478',
      'turns:relay.example.com:5349?transport=tcp',
    ]);

    const [expires, realm] = String(turn?.username).split(':');
    expect(realm).toBe('skillswap');
    expect(Number(expires)).toBeGreaterThanOrEqual(before + 1800);
    expect(Number(expires)).toBeLessThanOrEqual(after + 1800);
    expect(turn?.credential).toBe(
      crypto.createHmac('sha1', 'unit-test-secret').update(turn!.username!).digest('base64')
    );

    // The ephemeral path wins over static credentials — minted ones are strictly
    // safer, so a leftover TURN_USERNAME must not shadow them.
    expect(turn?.username).not.toBe('ignored-static-user');
  });

  it('falls back to static credentials for providers without HMAC support', () => {
    (env as any).TURN_URLS = 'turn:us-turn.metered.io:80';
    (env as any).TURN_SECRET = '';
    (env as any).TURN_USERNAME = 'static-user';
    (env as any).TURN_CREDENTIAL = 'static-pass';

    const cfg = buildIceConfig();
    expect(cfg.mode).toBe('static');
    expect(cfg.turnConfigured).toBe(true);
    expect(cfg.ttlSeconds).toBe(0);
    expect(cfg.iceServers).toEqual([
      { urls: STUN_URLS },
      { urls: ['turn:us-turn.metered.io:80'], username: 'static-user', credential: 'static-pass' },
    ]);
  });

  it('is STUN-only when no relay is configured', () => {
    (env as any).TURN_URLS = '';
    (env as any).TURN_SECRET = '';
    (env as any).TURN_USERNAME = '';
    (env as any).TURN_CREDENTIAL = '';

    const cfg = buildIceConfig();
    expect(cfg).toEqual({
      iceServers: [{ urls: STUN_URLS }],
      turnConfigured: false,
      mode: 'none',
      ttlSeconds: 0,
    });
  });

  it('does not advertise a relay it cannot authenticate to', () => {
    // URLs but no credentials: every allocation would be rejected, so reporting
    // turnConfigured: true would make the UI claim calls can relay when they
    // cannot. Saying "none" is what makes the failure diagnosable.
    (env as any).TURN_URLS = 'turn:relay.example.com:3478';
    (env as any).TURN_SECRET = '';
    (env as any).TURN_USERNAME = 'only-half-configured';
    (env as any).TURN_CREDENTIAL = '';

    const cfg = buildIceConfig();
    expect(cfg.mode).toBe('none');
    expect(cfg.turnConfigured).toBe(false);
    expect(cfg.iceServers).toEqual([{ urls: STUN_URLS }]);
  });

  it('defaults a nonsensical TTL to one hour', () => {
    (env as any).TURN_URLS = 'turn:relay.example.com:3478';
    (env as any).TURN_SECRET = 'unit-test-secret';
    (env as any).TURN_REALM = 'skillswap';
    (env as any).TURN_TTL_SECONDS = 0; // coturn would reject this instantly

    const cfg = buildIceConfig();
    expect(cfg.ttlSeconds).toBe(3600);
  });
});

describe('describeTurnConfig', () => {
  it('says so when the relay is missing entirely', () => {
    (env as any).TURN_URLS = '';
    (env as any).TURN_SECRET = '';
    (env as any).TURN_USERNAME = '';
    (env as any).TURN_CREDENTIAL = '';
    expect(describeTurnConfig()).toMatch(/TURN not configured/i);
  });

  it('distinguishes half-configured from unconfigured', () => {
    (env as any).TURN_URLS = 'turn:relay.example.com:3478';
    (env as any).TURN_SECRET = '';
    (env as any).TURN_USERNAME = '';
    (env as any).TURN_CREDENTIAL = '';
    expect(describeTurnConfig()).toMatch(/no credentials/i);
  });

  it('never prints the secret or a credential', () => {
    (env as any).TURN_URLS = 'turn:relay.example.com:3478';
    (env as any).TURN_SECRET = 'super-secret-value-that-must-not-leak';
    (env as any).TURN_REALM = 'skillswap';
    (env as any).TURN_TTL_SECONDS = 3600;

    const summary = describeTurnConfig();
    expect(summary).toMatch(/ephemeral/);
    expect(summary).not.toContain('super-secret-value-that-must-not-leak');
    const cfg = buildIceConfig();
    expect(summary).not.toContain(String(cfg.iceServers[1].credential));
  });
});
