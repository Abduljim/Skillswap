/**
 * GET /api/calls/ice-servers and GET /api/calls/limits over the real app.
 *
 * Two things are worth guarding here that the unit tests cannot:
 *
 *  1. Both endpoints require authentication. A relay credential handed to an
 *     anonymous caller is bandwidth we pay for on someone else's behalf.
 *  2. The cap the client is told about is the same constant the socket layer
 *     enforces. If they ever disagree, the picker invites people the server
 *     silently drops — which reads to a user as "the call just didn't ring".
 */
import crypto from 'node:crypto';
import { api, signup, resetDatabase, prisma, type Session } from '../helpers/api';
import { env } from '../../src/config/env';
import { MAX_GROUP_CALL_PARTICIPANTS, GROUP_CALLS_AUDIO_FIRST } from '../../src/config/calls';
import { STUN_URLS } from '../../src/services/turn.service';

const TURN_FIELDS = [
  'TURN_URLS',
  'TURN_SECRET',
  'TURN_REALM',
  'TURN_TTL_SECONDS',
  'TURN_USERNAME',
  'TURN_CREDENTIAL',
] as const;

let saved: Record<string, unknown>;
let session: Session;

beforeAll(async () => {
  await resetDatabase();
  session = await signup('caller@ice.test', 'Ada Caller');
});

beforeEach(() => {
  saved = {};
  for (const key of TURN_FIELDS) saved[key] = (env as any)[key];
});

afterEach(() => {
  for (const key of TURN_FIELDS) (env as any)[key] = saved[key];
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/calls/ice-servers', () => {
  it('refuses anonymous callers', async () => {
    const res = await api().get('/api/calls/ice-servers').expect(401);
    expect(res.body.success).toBe(false);
    // And it must not leak a credential on the way out.
    expect(JSON.stringify(res.body)).not.toMatch(/credential/);
  });

  it('mints a per-request credential the relay can verify', async () => {
    (env as any).TURN_URLS = 'turn:relay.skillswap.test:3478,turns:relay.skillswap.test:5349?transport=tcp';
    (env as any).TURN_SECRET = 'integration-test-secret';
    (env as any).TURN_REALM = 'skillswap';
    (env as any).TURN_TTL_SECONDS = 900;

    const res = await api().get('/api/calls/ice-servers').set('Cookie', session.cookie).expect(200);
    const cfg = res.body.data;

    expect(cfg.mode).toBe('ephemeral');
    expect(cfg.turnConfigured).toBe(true);
    expect(cfg.ttlSeconds).toBe(900);
    expect(cfg.iceServers[0]).toEqual({ urls: STUN_URLS });

    const turn = cfg.iceServers[1];
    expect(turn.urls).toHaveLength(2);

    const [expires, realm] = String(turn.username).split(':');
    expect(realm).toBe('skillswap');
    const now = Math.floor(Date.now() / 1000);
    expect(Number(expires)).toBeGreaterThan(now);
    expect(Number(expires)).toBeLessThanOrEqual(now + 900);

    // Recompute exactly as coturn does. This is the assertion that catches a
    // format drift, which otherwise only shows up as failed calls in production.
    expect(turn.credential).toBe(
      crypto.createHmac('sha1', 'integration-test-secret').update(turn.username).digest('base64')
    );
  });

  it('hands out a fresh credential on each request and never the secret', async () => {
    (env as any).TURN_URLS = 'turn:relay.skillswap.test:3478';
    (env as any).TURN_SECRET = 'integration-test-secret';
    (env as any).TURN_REALM = 'skillswap';
    (env as any).TURN_TTL_SECONDS = 1; // expires in a second, so two calls differ

    const first = await api().get('/api/calls/ice-servers').set('Cookie', session.cookie).expect(200);
    await new Promise((r) => setTimeout(r, 1100));
    const second = await api().get('/api/calls/ice-servers').set('Cookie', session.cookie).expect(200);

    expect(second.body.data.iceServers[1].username).not.toBe(first.body.data.iceServers[1].username);
    expect(JSON.stringify(second.body)).not.toContain('integration-test-secret');
  });

  it('falls back to static credentials when no secret is configured', async () => {
    (env as any).TURN_URLS = 'turn:us-turn.provider.test:80';
    (env as any).TURN_SECRET = '';
    (env as any).TURN_USERNAME = 'static-user';
    (env as any).TURN_CREDENTIAL = 'static-pass';

    const res = await api().get('/api/calls/ice-servers').set('Cookie', session.cookie).expect(200);
    expect(res.body.data).toEqual({
      iceServers: [
        { urls: STUN_URLS },
        { urls: ['turn:us-turn.provider.test:80'], username: 'static-user', credential: 'static-pass' },
      ],
      turnConfigured: true,
      mode: 'static',
      ttlSeconds: 0,
    });
  });

  it('reports STUN-only honestly when no relay exists', async () => {
    (env as any).TURN_URLS = '';
    (env as any).TURN_SECRET = '';
    (env as any).TURN_USERNAME = '';
    (env as any).TURN_CREDENTIAL = '';

    const res = await api().get('/api/calls/ice-servers').set('Cookie', session.cookie).expect(200);
    expect(res.body.data.turnConfigured).toBe(false);
    expect(res.body.data.mode).toBe('none');
    expect(res.body.data.iceServers).toEqual([{ urls: STUN_URLS }]);
  });
});

describe('GET /api/calls/limits', () => {
  it('refuses anonymous callers', async () => {
    await api().get('/api/calls/limits').expect(401);
  });

  it('publishes the same cap the socket layer enforces', async () => {
    const res = await api().get('/api/calls/limits').set('Cookie', session.cookie).expect(200);
    expect(res.body.data).toEqual({
      maxGroupCallParticipants: MAX_GROUP_CALL_PARTICIPANTS,
      groupCallsAudioFirst: GROUP_CALLS_AUDIO_FIRST,
    });
    expect(res.body.data.maxGroupCallParticipants).toBeGreaterThanOrEqual(2);
    expect(res.body.data.groupCallsAudioFirst).toBe(true);
  });
});
