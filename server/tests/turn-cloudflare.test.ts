/**
 * Cloudflare Realtime TURN provider.
 *
 * The relay this project shipped against (Metered's free Open Relay) stopped
 * answering entirely, which produced calls that rang, showed "connected", and
 * carried no audio or video in either direction. These tests cover the
 * replacement: that credentials are fetched from the right endpoint, that the
 * port-53 entries Cloudflare returns are dropped because browsers block them,
 * that one credential is reused instead of hammering the API, and that a
 * Cloudflare outage degrades to whatever else is configured rather than to no
 * relay at all.
 */
import { env } from '../src/config/env';
import {
  buildIceConfig,
  clearTurnCache,
  cloudflareTurnConfigured,
  describeTurnConfig,
  fetchCloudflareIceServers,
  resolveIceConfig,
} from '../src/services/turn.service';

/** Shaped like Cloudflare's real response, including the :53 entries. */
const CF_RESPONSE = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turn:turn.cloudflare.com:3478?transport=tcp',
        'turn:turn.cloudflare.com:80?transport=tcp',
        'turns:turn.cloudflare.com:5349?transport=tcp',
      ],
      username: 'cf-username',
      credential: 'cf-credential',
    },
  ],
};

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

const okJson = (body: any) => ({
  ok: true,
  status: 201,
  json: async () => body,
  text: async () => '',
});

const configureCloudflare = () => {
  env.CLOUDFLARE_TURN_KEY_ID = 'key-id-123';
  env.CLOUDFLARE_TURN_API_TOKEN = 'super-secret-token';
};

const urlsOf = (cfg: any, i = 1): string[] =>
  Array.isArray(cfg.iceServers[i].urls) ? cfg.iceServers[i].urls : [cfg.iceServers[i].urls];

beforeEach(() => {
  clearTurnCache();
  fetchMock.mockReset();
  env.CLOUDFLARE_TURN_KEY_ID = '';
  env.CLOUDFLARE_TURN_API_TOKEN = '';
  env.CLOUDFLARE_TURN_TTL_SECONDS = 3600;
  env.TURN_URLS = '';
  env.TURN_SECRET = '';
  env.TURN_REALM = 'skillswap';
  env.TURN_USERNAME = '';
  env.TURN_CREDENTIAL = '';
});

describe('cloudflareTurnConfigured', () => {
  it('needs both the key id and the api token', () => {
    expect(cloudflareTurnConfigured()).toBe(false);
    env.CLOUDFLARE_TURN_KEY_ID = 'key-id-123';
    expect(cloudflareTurnConfigured()).toBe(false);
    configureCloudflare();
    expect(cloudflareTurnConfigured()).toBe(true);
  });
});

describe('fetchCloudflareIceServers', () => {
  it('does nothing and calls nobody when not configured', async () => {
    await expect(fetchCloudflareIceServers()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the generate-ice-servers endpoint for this key, with the bearer token', async () => {
    configureCloudflare();
    fetchMock.mockResolvedValue(okJson(CF_RESPONSE));
    await fetchCloudflareIceServers();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key-id-123/credentials/generate-ice-servers'
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer super-secret-token');
    expect(JSON.parse(init.body)).toEqual({ ttl: 3600 });
  });

  it('returns a configured ephemeral iceServers list', async () => {
    configureCloudflare();
    fetchMock.mockResolvedValue(okJson(CF_RESPONSE));
    const cfg = await fetchCloudflareIceServers();
    expect(cfg).toMatchObject({ turnConfigured: true, mode: 'ephemeral', ttlSeconds: 3600 });
    expect(cfg!.iceServers[1]).toMatchObject({ username: 'cf-username', credential: 'cf-credential' });
  });

  it('drops the port-53 entries browsers refuse', async () => {
    configureCloudflare();
    fetchMock.mockResolvedValue(okJson(CF_RESPONSE));
    const cfg = await fetchCloudflareIceServers();
    const all = cfg!.iceServers.flatMap((s: any) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    expect(all.some((u: string) => /:53(?:\?|$)/.test(u))).toBe(false);
    // …without throwing away the ports that do work.
    expect(all).toContain('turn:turn.cloudflare.com:3478?transport=udp');
    expect(all).toContain('turns:turn.cloudflare.com:5349?transport=tcp');
    expect(all).toContain('stun:stun.cloudflare.com:3478');
  });

  it('reuses one credential instead of calling Cloudflare on every request', async () => {
    configureCloudflare();
    fetchMock.mockResolvedValue(okJson(CF_RESPONSE));
    const t0 = 1_800_000_000_000;
    await fetchCloudflareIceServers(t0);
    await fetchCloudflareIceServers(t0 + 60_000);
    await fetchCloudflareIceServers(t0 + 3_000_000); // 50 min in: still inside 90% of an hour
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchCloudflareIceServers(t0 + 3_300_000); // past 90% of the ttl
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null on an HTTP error rather than throwing', async () => {
    configureCloudflare();
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'cannot find specified key', json: async () => ({}) });
    await expect(fetchCloudflareIceServers()).resolves.toBeNull();
  });

  it('returns null when the network fails', async () => {
    configureCloudflare();
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    await expect(fetchCloudflareIceServers()).resolves.toBeNull();
  });

  it('refuses a response that contains no TURN urls', async () => {
    configureCloudflare();
    fetchMock.mockResolvedValue(okJson({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] }));
    await expect(fetchCloudflareIceServers()).resolves.toBeNull();
  });
});

describe('resolveIceConfig', () => {
  it('prefers Cloudflare over a configured coturn relay', async () => {
    configureCloudflare();
    env.TURN_URLS = 'turn:turn.example.com:3478';
    env.TURN_SECRET = 'coturn-secret';
    fetchMock.mockResolvedValue(okJson(CF_RESPONSE));

    const cfg = await resolveIceConfig();
    expect(urlsOf(cfg)).toContain('turn:turn.cloudflare.com:3478?transport=udp');
    expect(urlsOf(cfg)).not.toContain('turn:turn.example.com:3478');
  });

  it('falls back to coturn HMAC credentials when Cloudflare fails', async () => {
    configureCloudflare();
    env.TURN_URLS = 'turn:turn.example.com:3478';
    env.TURN_SECRET = 'coturn-secret';
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) });

    const cfg = await resolveIceConfig();
    expect(cfg.turnConfigured).toBe(true);
    expect(urlsOf(cfg)).toContain('turn:turn.example.com:3478');
    // Still an HMAC credential, so the fallback kept its security properties.
    expect(cfg.iceServers[1].username).toMatch(/^\d+:skillswap$/);
  });

  it('matches buildIceConfig exactly when Cloudflare is not configured', async () => {
    env.TURN_URLS = 'turn:turn.example.com:3478';
    env.TURN_SECRET = 'coturn-secret';
    const now = 1_800_000_000_000;
    await expect(resolveIceConfig(now)).resolves.toEqual(buildIceConfig(now));
  });

  it('degrades to STUN only, and says so, when nothing is configured', async () => {
    const cfg = await resolveIceConfig();
    expect(cfg).toMatchObject({ turnConfigured: false, mode: 'none' });
    expect(describeTurnConfig()).toMatch(/not configured/);
  });
});

describe('describeTurnConfig', () => {
  it('names Cloudflare without leaking the api token', () => {
    configureCloudflare();
    const line = describeTurnConfig();
    expect(line).toMatch(/Cloudflare/);
    expect(line).toContain('key-id-1');
    expect(line).not.toContain('super-secret-token');
  });
});
