/**
 * End-to-end call signalling over real Socket.IO.
 *
 * Boots the real Express app + Socket.IO server on an ephemeral port, creates
 * two users with an ACTIVE exchange through the public REST API, then drives
 * calls as two independent socket clients — no mocks except FCM (which would
 * otherwise try to reach Google).
 *
 * The headline regression guard is the first test: `call:accepted` used to be
 * relayed only to the `exchange:{id}` room, which a client joins solely by
 * opening the chat screen. Calling from the Calls tab / a profile / the
 * dashboard therefore left the caller deaf to the accept, `startPeer()` never
 * ran, no offer was created, and the call hung on "ringing" until it timed out.
 */
import http from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../../src/app';
import { initSocket } from '../../src/sockets/io';
import * as callsConfig from '../../src/config/calls';
import {
  sendCallCancelledPush,
  sendGroupCallCancelledPush,
  sendGroupCallPush,
  sendIncomingCallPush,
} from '../../src/services/push.service';
import { api, signup, resetDatabase, createSkill, prisma, type Session } from '../helpers/api';

jest.mock('../../src/services/push.service', () => ({
  sendIncomingCallPush: jest.fn().mockResolvedValue(undefined),
  sendCallCancelledPush: jest.fn().mockResolvedValue(undefined),
  sendGroupCallPush: jest.fn().mockResolvedValue(undefined),
  sendGroupCallCancelledPush: jest.fn().mockResolvedValue(undefined),
}));

// jest.mock above replaces these with spies; the suite must never reach Google.
const mockIncomingPush = sendIncomingCallPush as jest.Mock;
const mockCancelledPush = sendCallCancelledPush as jest.Mock;
const mockGroupPush = sendGroupCallPush as jest.Mock;
const mockGroupCancelledPush = sendGroupCallCancelledPush as jest.Mock;

const MESSAGE = 'Hi! Want to swap lessons?';

let server: http.Server;
let baseUrl: string;
const openSockets: ClientSocket[] = [];

async function startSocketServer(): Promise<void> {
  server = http.createServer(app);
  initSocket(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
}

function connect(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    openSockets.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

/** Resolves with the first payload for `event`, or fails the test on timeout. */
function once<T = any>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for "${event}"`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

/**
 * Polls for the call-log row. The server emits the socket event first and awaits
 * the insert afterwards, so reading immediately after the event races the write.
 */
async function waitForCallLog(exchangeId: string, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const log = await prisma.callLog.findFirst({ where: { exchangeId }, orderBy: { endedAt: 'desc' } });
    if (log) return log;
    if (Date.now() > deadline) throw new Error('Call log was never written');
    await new Promise((r) => setTimeout(r, 50));
  }
}

function expectCreated(res: { status: number }) {
  if (res.status !== 200 && res.status !== 201) throw new Error(`Expected 200/201, got ${res.status}`);
}

async function userWithSkills(email: string, name: string, teach: string[], want: string[]): Promise<Session> {
  const session = await signup(email, name);
  for (const skillId of teach) {
    await api()
      .post(`/api/skills/${skillId}/add`)
      .set('Cookie', session.cookie)
      .send({ skillId, type: 'TEACH', proficiency: 'ADVANCED' })
      .expect(expectCreated);
  }
  for (const skillId of want) {
    await api()
      .post(`/api/skills/${skillId}/add`)
      .set('Cookie', session.cookie)
      .send({ skillId, type: 'WANT', proficiency: 'BEGINNER' })
      .expect(expectCreated);
  }
  return session;
}

/** Two users with an ACTIVE exchange between them, exactly as the app creates one. */
async function pairWithExchange() {
  const python = await createSkill('Python (calls test)');
  const guitar = await createSkill('Guitar (calls test)');

  const caller = await userWithSkills('caller@skillswap.test', 'Ada Caller', [python], [guitar]);
  const callee = await userWithSkills('callee@skillswap.test', 'Ben Callee', [guitar], [python]);

  const request = await api()
    .post('/api/exchange-requests')
    .set('Cookie', caller.cookie)
    .send({ receiverId: callee.userId, offeredSkillId: python, requestedSkillId: guitar, message: MESSAGE })
    .expect(expectCreated);

  await api()
    .post(`/api/exchange-requests/${request.body.data.id}/accept`)
    .set('Cookie', callee.cookie)
    .expect(expectCreated);

  const exchange = await prisma.exchange.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { userAId: caller.userId, userBId: callee.userId },
        { userAId: callee.userId, userBId: caller.userId },
      ],
    },
    select: { id: true },
  });
  if (!exchange) throw new Error('Exchange was not created');
  return { caller, callee, exchangeId: exchange.id };
}

/**
 * Gives the host another ACTIVE exchange partner, which is the only way to make
 * someone eligible for a group invite. Mirrors what the app does: host offers a
 * skill they teach, partner teaches the skill being requested.
 */
async function addExchangePartner(host: Session, hostTeachesSkillId: string, email: string, name: string) {
  const theirs = await createSkill(`${name} skill (calls test)`);
  const partner = await userWithSkills(email, name, [theirs], []);
  const req = await api()
    .post('/api/exchange-requests')
    .set('Cookie', host.cookie)
    .send({
      receiverId: partner.userId,
      offeredSkillId: hostTeachesSkillId,
      requestedSkillId: theirs,
      message: MESSAGE,
    })
    .expect(expectCreated);
  await api()
    .post(`/api/exchange-requests/${req.body.data.id}/accept`)
    .set('Cookie', partner.cookie)
    .expect(expectCreated);
  return partner;
}

beforeAll(async () => {
  await startSocketServer();
});

beforeEach(async () => {
  for (const s of openSockets.splice(0)) {
    if (s.connected) s.disconnect();
  }
  // Call counts are asserted per test, so none may leak from the previous one.
  mockIncomingPush.mockClear();
  mockCancelledPush.mockClear();
  mockGroupPush.mockClear();
  mockGroupCancelledPush.mockClear();
  await resetDatabase();
});

afterAll(async () => {
  for (const s of openSockets.splice(0)) if (s.connected) s.disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('1:1 call signalling', () => {
  it('delivers each call event exactly once to a peer who has the chat open', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    const b = await connect(callee.token);

    // Both have the chat open, so each socket is in the exchange room AND its own
    // user room. Emitting to those rooms separately delivered one call as two
    // ring events, two accepts and two ends — observed against production.
    a.emit('exchange:join', exchangeId);
    b.emit('exchange:join', exchangeId);
    await new Promise((r) => setTimeout(r, 200));

    const seen: Record<string, unknown[]> = { ringing: [], accepted: [], ended: [] };
    b.on('call:ringing', (p) => seen.ringing.push(p));
    a.on('call:accepted', (p) => seen.accepted.push(p));
    a.on('call:ended', (p) => seen.ended.push(p));

    a.emit('call:request', { exchangeId, video: false });
    await new Promise((r) => setTimeout(r, 400));
    expect(seen.ringing).toHaveLength(1);
    expect((seen.ringing[0] as { exchangeId: string }).exchangeId).toBe(exchangeId);

    b.emit('call:accept', { exchangeId });
    await new Promise((r) => setTimeout(r, 400));
    expect(seen.accepted).toHaveLength(1);

    b.emit('call:hangup', { exchangeId });
    await new Promise((r) => setTimeout(r, 400));
    expect(seen.ended).toHaveLength(1);
  });

  it('connects a call when the caller does NOT have the chat open', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    const b = await connect(callee.token);
    // Neither client emits `exchange:join` — that only happens on the chat screen.

    a.emit('call:request', { exchangeId, video: true });

    const ringing = await once<{ exchangeId: string; video: boolean; caller: { id: string; displayName: string } }>(
      b,
      'call:ringing'
    );
    expect(ringing.exchangeId).toBe(exchangeId);
    expect(ringing.video).toBe(true);
    expect(ringing.caller.id).toBe(caller.userId);

    b.emit('call:accept', { exchangeId });

    // The regression: the caller must hear about the accept with the chat closed.
    const accepted = await once<{ exchangeId: string; acceptorId: string }>(a, 'call:accepted');
    expect(accepted.acceptorId).toBe(callee.userId);

    // WebRTC media payloads are opaque to the server; what matters is that they
    // are relayed to the right person in both directions.
    const offer = { type: 'offer', sdp: 'v=0 fake offer' };
    const answer = { type: 'answer', sdp: 'v=0 fake answer' };
    const ice = { type: 'candidate', candidate: 'candidate:1 1 udp 2122 1.2.3.4 5000 typ host' };

    a.emit('webrtc:signal', { exchangeId, to: callee.userId, signal: offer });
    expect((await once(b, 'webrtc:signal')).signal).toEqual(offer);

    b.emit('webrtc:signal', { exchangeId, to: caller.userId, signal: answer });
    const relayedAnswer = await once<{ from: string; signal: any }>(a, 'webrtc:signal');
    expect(relayedAnswer.signal).toEqual(answer);
    expect(relayedAnswer.from).toBe(callee.userId);

    b.emit('webrtc:signal', { exchangeId, to: caller.userId, signal: ice });
    expect((await once(a, 'webrtc:signal')).signal).toEqual(ice);

    // Callee hangs up → the caller is told, and the call is logged.
    b.emit('call:hangup', { exchangeId });
    const ended = await once<{ exchangeId: string; endedBy: string }>(a, 'call:ended');
    expect(ended.endedBy).toBe(callee.userId);

    const log = await waitForCallLog(exchangeId);
    expect(log.outcome).toBe('COMPLETED');
    expect(log.type).toBe('VIDEO');
    expect(log.callerId).toBe(caller.userId);
    expect(log.calleeId).toBe(callee.userId);
  });

  it('tells the caller when the callee declines (chat closed) and logs the decline', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    const b = await connect(callee.token);

    a.emit('call:request', { exchangeId, video: false });
    await once(b, 'call:ringing');

    b.emit('call:reject', { exchangeId });
    const rejected = await once<{ rejectorId: string }>(a, 'call:rejected');
    expect(rejected.rejectorId).toBe(callee.userId);

    const log = await waitForCallLog(exchangeId);
    expect(log.outcome).toBe('DECLINED');
    expect(log.type).toBe('VOICE');
  });

  it('tells the caller why when the callee could not open their microphone', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    const b = await connect(callee.token);

    a.emit('call:request', { exchangeId, video: false });
    await once(b, 'call:ringing');

    // What the app now sends when getUserMedia is denied. Before, the callee
    // showed an error and emitted nothing at all, so the caller rang out the
    // timeout with no explanation.
    b.emit('call:reject', { exchangeId, reason: 'media-denied' });
    const rejected = await once<{ rejectorId: string; reason?: string }>(a, 'call:rejected');
    expect(rejected.rejectorId).toBe(callee.userId);
    expect(rejected.reason).toBe('media-denied');

    const log = await waitForCallLog(exchangeId);
    expect(log.outcome).toBe('DECLINED');
  });

  it('refuses a call from someone who is not a member of the exchange', async () => {
    const { callee, exchangeId } = await pairWithExchange();
    const intruder = await signup('intruder@skillswap.test', 'Mallory');
    const m = await connect(intruder.token);

    const errorPromise = once<{ message: string }>(m, 'error');
    m.emit('call:request', { exchangeId, video: true });
    expect((await errorPromise).message).toMatch(/cannot place call/i);

    // And the real callee must not have been rung by the intruder.
    const b = await connect(callee.token);
    await expect(once(b, 'call:ringing', 700)).rejects.toThrow(/Timed out/);
  });

  it('ends the call for the peer when a participant drops offline', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    const b = await connect(callee.token);

    a.emit('call:request', { exchangeId, video: false });
    await once(b, 'call:ringing');
    b.emit('call:accept', { exchangeId });
    await once(a, 'call:accepted');

    // Caller's app is killed / loses network: the callee must not sit in a dead call.
    const endedPromise = once<{ endedBy: string; reason?: string }>(b, 'call:ended');
    a.disconnect();
    const ended = await endedPromise;
    expect(ended.endedBy).toBe(caller.userId);
    expect(ended.reason).toBe('disconnect');
  });
});

describe('Reaching a callee who cannot see the app', () => {
  /**
   * Shortens the ring timeout for one test only. callRingTimeoutMs() reads the
   * environment when the call is placed, so this needs no fake timers — and it
   * is restored afterwards, so one test cannot change the next one's timing.
   */
  async function withRingTimeout(ms: number, fn: () => Promise<void>) {
    const prev = process.env.CALL_RING_TIMEOUT_MS;
    process.env.CALL_RING_TIMEOUT_MS = String(ms);
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env.CALL_RING_TIMEOUT_MS;
      else process.env.CALL_RING_TIMEOUT_MS = prev;
    }
  }

  it('rings a backgrounded callee whose socket is still connected', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    const b = await connect(callee.token);

    // A locked phone, or the app sitting on the home screen, keeps its socket
    // alive for minutes. Pushing only when the socket was gone meant such a
    // callee saw nothing at all: no in-app sheet (nothing is visible) and no
    // notification (the server believed the app was open).
    b.emit('presence:set', { foreground: false });
    await new Promise((r) => setTimeout(r, 150));

    const ringing = once(b, 'call:ringing');
    a.emit('call:request', { exchangeId, video: false });
    await ringing;

    expect(mockIncomingPush).toHaveBeenCalledTimes(1);
    expect(mockIncomingPush.mock.calls[0][0]).toBe(callee.userId);
    expect(mockIncomingPush.mock.calls[0][1]).toMatchObject({ exchangeId, video: false });

    a.emit('call:hangup', { exchangeId });
    await once(b, 'call:ended');
  });

  it('does not push to a callee who is looking at the app', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    const b = await connect(callee.token);

    // Foreground is the default: a socket that never reports presence behaves
    // exactly as it did before, so an older client cannot end up with both the
    // in-app sheet and a notification for the same call.
    const ringing = once(b, 'call:ringing');
    a.emit('call:request', { exchangeId, video: false });
    await ringing;
    expect(mockIncomingPush).not.toHaveBeenCalled();

    // Hanging up before an answer must not push either — they can see the end.
    a.emit('call:hangup', { exchangeId });
    await once(b, 'call:ended');
    expect(mockCancelledPush).not.toHaveBeenCalled();
  });

  it('stops pushing once the app comes back to the foreground', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    const b = await connect(callee.token);

    b.emit('presence:set', { foreground: false });
    await new Promise((r) => setTimeout(r, 150));
    b.emit('presence:set', { foreground: true });
    await new Promise((r) => setTimeout(r, 150));

    const ringing = once(b, 'call:ringing');
    a.emit('call:request', { exchangeId, video: false });
    await ringing;
    expect(mockIncomingPush).not.toHaveBeenCalled();

    a.emit('call:hangup', { exchangeId });
    await once(b, 'call:ended');
  });

  it('ends an unanswered call on both phones and logs it MISSED', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    await withRingTimeout(300, async () => {
      const a = await connect(caller.token);
      const b = await connect(callee.token);

      const callerEnds: unknown[] = [];
      const calleeEnds: unknown[] = [];
      a.on('call:ended', (p) => callerEnds.push(p));
      b.on('call:ended', (p) => calleeEnds.push(p));

      a.emit('call:request', { exchangeId, video: false });
      await once(b, 'call:ringing');
      // ...and nobody answers.
      await new Promise((r) => setTimeout(r, 900));

      // Both sides are told, each exactly once.
      expect(callerEnds).toHaveLength(1);
      expect(calleeEnds).toHaveLength(1);
      expect((callerEnds[0] as { reason?: string }).reason).toBe('no-answer');
      expect((calleeEnds[0] as { endedBy: string }).endedBy).toBe(callee.userId);

      // A phone ringing from a push has no socket to hear the end on, so it has
      // to be told to stop.
      expect(mockCancelledPush).toHaveBeenCalledTimes(1);
      expect(mockCancelledPush.mock.calls[0][0]).toBe(callee.userId);

      const log = await waitForCallLog(exchangeId);
      expect(log.outcome).toBe('MISSED');
    });
  });

  it('does not end a call that was answered inside the ring window', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    await withRingTimeout(300, async () => {
      const a = await connect(caller.token);
      const b = await connect(callee.token);

      a.emit('call:request', { exchangeId, video: false });
      await once(b, 'call:ringing');
      b.emit('call:accept', { exchangeId });
      await once(a, 'call:accepted');

      let ends = 0;
      a.on('call:ended', () => {
        ends += 1;
      });
      b.on('call:ended', () => {
        ends += 1;
      });
      // Well past the 300ms ring window: an answered call must survive it.
      await new Promise((r) => setTimeout(r, 800));
      expect(ends).toBe(0);

      a.emit('call:hangup', { exchangeId });
      await new Promise((r) => setTimeout(r, 300));
      const log = await waitForCallLog(exchangeId);
      // It was answered, so a real conversation — not a missed call.
      expect(log.outcome).toBe('COMPLETED');
    });
  });

  it('silences a closed phone when the caller hangs up before an answer', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    const a = await connect(caller.token);
    // The callee never connects at all: app fully closed, so a push is the only
    // way to reach them.

    a.emit('call:request', { exchangeId, video: false });
    await new Promise((r) => setTimeout(r, 250));
    expect(mockIncomingPush).toHaveBeenCalledTimes(1);

    a.emit('call:hangup', { exchangeId });
    await new Promise((r) => setTimeout(r, 250));

    // The notification is insistent: without a cancel it keeps ringing for a
    // call that no longer exists, and no socket event will ever reach it.
    expect(mockCancelledPush).toHaveBeenCalledTimes(1);
    expect(mockCancelledPush.mock.calls[0][0]).toBe(callee.userId);

    const log = await waitForCallLog(exchangeId);
    expect(log.outcome).toBe('MISSED');
  });
});

describe('Group invites reaching a phone that cannot see the app', () => {
  /**
   * A third user with an ACTIVE exchange with the host — group invites are only
   * allowed for people you already have an exchange with.
   */
  async function groupInvitee(host: Session) {
    const python = await prisma.skill.findFirstOrThrow({ where: { name: 'Python (calls test)' } });
    const theirs = await createSkill('Yoruba (group push test)');
    const invitee = await userWithSkills('group-invitee@skillswap.test', 'Chidi Third', [theirs], []);
    const req = await api()
      .post('/api/exchange-requests')
      .set('Cookie', host.cookie)
      .send({ receiverId: invitee.userId, offeredSkillId: python.id, requestedSkillId: theirs, message: MESSAGE })
      .expect(expectCreated);
    await api()
      .post(`/api/exchange-requests/${req.body.data.id}/accept`)
      .set('Cookie', invitee.cookie)
      .expect(expectCreated);
    return invitee;
  }

  it('pushes a group invite to a backgrounded member and still rings the socket', async () => {
    const { caller } = await pairWithExchange();
    const invitee = await groupInvitee(caller);
    const host = await connect(caller.token);
    const member = await connect(invitee.token);

    member.emit('presence:set', { foreground: false });
    await new Promise((r) => setTimeout(r, 150));

    const ringing = once<{ id: string; memberCount: number }>(member, 'group:call:ringing');
    host.emit('group:call:start', { memberIds: [invitee.userId], video: false });
    const started = await once<{ id: string }>(host, 'group:call:started');
    const ring = await ringing;
    expect(ring.id).toBe(started.id);

    expect(mockGroupPush).toHaveBeenCalledTimes(1);
    expect(mockGroupPush.mock.calls[0][0]).toBe(invitee.userId);
    expect(mockGroupPush.mock.calls[0][1]).toMatchObject({
      groupId: started.id,
      video: false,
      memberCount: 2,
    });

    host.emit('group:call:leave', { id: started.id });
    await new Promise((r) => setTimeout(r, 250));
  });

  it('does not push a group invite to a member who is present', async () => {
    const { caller } = await pairWithExchange();
    const invitee = await groupInvitee(caller);
    const host = await connect(caller.token);
    const member = await connect(invitee.token);

    const ringing = once<{ id: string }>(member, 'group:call:ringing');
    host.emit('group:call:start', { memberIds: [invitee.userId], video: true });
    const started = await once<{ id: string }>(host, 'group:call:started');
    await ringing;

    expect(mockGroupPush).not.toHaveBeenCalled();

    host.emit('group:call:leave', { id: started.id });
    await new Promise((r) => setTimeout(r, 250));
  });

  it('silences an absent invitee when the host ends the group call', async () => {
    const { caller } = await pairWithExchange();
    const invitee = await groupInvitee(caller);
    const host = await connect(caller.token);
    // The invitee never connects: app fully closed, so a push is the only way in.

    host.emit('group:call:start', { memberIds: [invitee.userId], video: true });
    const started = await once<{ id: string }>(host, 'group:call:started');
    await new Promise((r) => setTimeout(r, 250));
    expect(mockGroupPush).toHaveBeenCalledTimes(1);

    // The host gives up and leaves. The invitee is not in the group room, so
    // group:call:ended cannot reach a closed app — the phone has to be told.
    host.emit('group:call:leave', { id: started.id });
    await new Promise((r) => setTimeout(r, 300));

    expect(mockGroupCancelledPush).toHaveBeenCalledTimes(1);
    expect(mockGroupCancelledPush.mock.calls[0][0]).toBe(invitee.userId);
    expect(mockGroupCancelledPush.mock.calls[0][1]).toBe(started.id);
  });
});

describe('Group call signalling', () => {
  it('rings invited members, meshes their signals and ends when the host leaves', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();

    // A third member. Group invites are only allowed for people you have an
    // ACTIVE exchange with, so build one: the host teaches Python and asks for
    // the Yoruba that Chidi teaches.
    const python = await prisma.skill.findFirstOrThrow({ where: { name: 'Python (calls test)' } });
    const yoruba = await createSkill('Yoruba (calls test)');
    const third = await userWithSkills('third@skillswap.test', 'Chidi Third', [yoruba], []);
    const thirdRequest = await api()
      .post('/api/exchange-requests')
      .set('Cookie', caller.cookie)
      .send({ receiverId: third.userId, offeredSkillId: python.id, requestedSkillId: yoruba, message: MESSAGE })
      .expect(expectCreated);
    await api()
      .post(`/api/exchange-requests/${thirdRequest.body.data.id}/accept`)
      .set('Cookie', third.cookie)
      .expect(expectCreated);

    const host = await connect(caller.token);
    const memberB = await connect(callee.token);
    const memberC = await connect(third.token);

    const ringingB = once<any>(memberB, 'group:call:ringing');
    const ringingC = once<any>(memberC, 'group:call:ringing');
    host.emit('group:call:start', { memberIds: [callee.userId, third.userId], video: true });

    const started = await once<{ id: string; video: boolean }>(host, 'group:call:started');
    expect(started.video).toBe(true);
    const bRing = await ringingB;
    expect(bRing.id).toBe(started.id);
    expect(bRing.memberCount).toBeGreaterThanOrEqual(2);
    await ringingC;

    // Both members join the mesh. Listeners are attached before emitting: the
    // server broadcasts `member:joined` to the room *before* it replies to the
    // acceptor with `group:call:joined`.
    const joinedBPromise = once<{ id: string; hostId: string; members: any[] }>(memberB, 'group:call:joined');
    const hostSawBPromise = once<{ userId: string }>(host, 'group:call:member:joined');
    memberB.emit('group:call:accept', { id: started.id });
    const joinedB = await joinedBPromise;
    expect(joinedB.hostId).toBe(caller.userId);
    expect((await hostSawBPromise).userId).toBe(callee.userId);

    const joinedCPromise = once<{ id: string }>(memberC, 'group:call:joined');
    const hostSawCPromise = once<{ userId: string }>(host, 'group:call:member:joined');
    memberC.emit('group:call:accept', { id: started.id });
    await joinedCPromise;
    expect((await hostSawCPromise).userId).toBe(third.userId);

    // Mesh signalling is relayed peer-to-peer through the server.
    memberB.emit('group:signal', { id: started.id, to: caller.userId, signal: { type: 'offer', sdp: 'b→host' } });
    const hostGot = await once<{ from: string; signal: any }>(host, 'group:signal');
    expect(hostGot.from).toBe(callee.userId);
    expect(hostGot.signal.sdp).toBe('b→host');

    host.emit('group:signal', { id: started.id, to: third.userId, signal: { type: 'answer', sdp: 'host→c' } });
    expect((await once(memberC, 'group:signal')).signal.sdp).toBe('host→c');

    // Mute/camera state is broadcast to the room.
    memberB.emit('group:call:update', { id: started.id, mic: false, camera: true });
    const update = await once<{ userId: string; mic: boolean }>(host, 'group:call:peer:update');
    expect(update.userId).toBe(callee.userId);
    expect(update.mic).toBe(false);

    // A member dropping offline is removed from the roster.
    const leftPromise = once<{ userId: string }>(host, 'group:call:member:left');
    memberC.disconnect();
    expect((await leftPromise).userId).toBe(third.userId);

    // Host leaving ends the room for everyone still in it.
    const endedPromise = once<{ id: string }>(memberB, 'group:call:ended');
    host.emit('group:call:leave', { id: started.id });
    expect((await endedPromise).id).toBe(started.id);
    expect(exchangeId).toBeTruthy();
  });

  it('refuses to invite people you have no active exchange with', async () => {
    const { caller } = await pairWithExchange();
    const stranger = await signup('stranger@skillswap.test', 'Stranger');
    const host = await connect(caller.token);

    const errorPromise = once<{ message: string }>(host, 'error');
    const typedPromise = once<{ reason: string; message: string }>(host, 'group:call:error');
    host.emit('group:call:start', { memberIds: [stranger.userId], video: false });
    expect((await errorPromise).message).toMatch(/no valid participants/i);
    // The typed event is what the host UI listens for; the generic one is only
    // kept for clients that predate it.
    const typed = await typedPromise;
    expect(typed.reason).toBe('no-eligible-invitees');
    expect(typed.message).toMatch(/accepted exchange/i);
  });
});

describe('Group call cap (mesh)', () => {
  // The cap is read from config/calls at call time, so a test can lower it to
  // exercise the enforcement paths without restarting the server.
  let originalCap: number;

  beforeEach(() => {
    originalCap = callsConfig.MAX_GROUP_CALL_PARTICIPANTS;
  });

  afterEach(() => {
    (callsConfig as any).MAX_GROUP_CALL_PARTICIPANTS = originalCap;
  });

  /** Host plus two ACTIVE exchange partners — three eligible invitees. */
  async function hostWithPartners() {
    const { caller, callee } = await pairWithExchange();
    const python = await prisma.skill.findFirstOrThrow({ where: { name: 'Python (calls test)' } });
    const third = await addExchangePartner(caller, python.id, 'third-cap@skillswap.test', 'Chidi Third');
    const fourth = await addExchangePartner(caller, python.id, 'fourth-cap@skillswap.test', 'Dele Fourth');
    return { caller, callee, third, fourth };
  }

  it('rings everyone when the invite fits the cap, and says it was not capped', async () => {
    (callsConfig as any).MAX_GROUP_CALL_PARTICIPANTS = 4;
    const { caller, callee, third } = await hostWithPartners();

    const host = await connect(caller.token);
    const b = await connect(callee.token);
    const c = await connect(third.token);

    const ringB = once<any>(b, 'group:call:ringing');
    const ringC = once<any>(c, 'group:call:ringing');
    // Audio-first: the client no longer asks for video on a group call.
    host.emit('group:call:start', { memberIds: [callee.userId, third.userId], video: false });

    const started = await once<{ id: string; video: boolean; capped?: boolean; maxParticipants?: number }>(
      host,
      'group:call:started'
    );
    expect(started.video).toBe(false);
    expect(started.capped).toBe(false);
    expect(started.maxParticipants).toBe(4);
    expect((await ringB).memberCount).toBe(3);
    await ringC;
  });

  it('drops invitees beyond the cap instead of ringing them, and tells the host why', async () => {
    (callsConfig as any).MAX_GROUP_CALL_PARTICIPANTS = 2; // host + one other
    const { caller, callee, third } = await hostWithPartners();

    const host = await connect(caller.token);
    const b = await connect(callee.token);
    const c = await connect(third.token);

    const ringB = once<any>(b, 'group:call:ringing');
    host.emit('group:call:start', { memberIds: [callee.userId, third.userId], video: false });

    const started = await once<{ id: string; members: any[]; capped: boolean; maxParticipants: number }>(
      host,
      'group:call:started'
    );
    expect(started.capped).toBe(true);
    expect(started.maxParticipants).toBe(2);
    // The roster is host-only at start; members join as they accept.
    expect(started.members.map((m) => m.id)).toEqual([caller.userId]);

    // The first invitee rings and can join.
    const rung = await ringB;
    expect(rung.memberCount).toBe(2);
    b.emit('group:call:accept', { id: started.id });
    await once<{ id: string }>(b, 'group:call:joined');

    // The dropped invitee was never rung at all — that is the whole point of
    // `capped`: the host learns two people were not called instead of watching
    // them sit on "ringing" forever.
    await expect(once(c, 'group:call:ringing', 700)).rejects.toThrow(/Timed out/);
    await expect(once(c, 'group:call:joined', 700)).rejects.toThrow(/Timed out/);
  });

  it('refuses a joiner once the room is at the cap', async () => {
    (callsConfig as any).MAX_GROUP_CALL_PARTICIPANTS = 4;
    const { caller, callee, third, fourth } = await hostWithPartners();

    const host = await connect(caller.token);
    const b = await connect(callee.token);
    const c = await connect(third.token);
    const d = await connect(fourth.token);

    host.emit('group:call:start', {
      memberIds: [callee.userId, third.userId, fourth.userId],
      video: false,
    });
    const started = await once<{ id: string; capped: boolean }>(host, 'group:call:started');
    expect(started.capped).toBe(false);

    // Fill the mesh to the cap.
    for (const member of [b, c]) {
      const joined = once<{ id: string }>(member, 'group:call:joined');
      member.emit('group:call:accept', { id: started.id });
      await joined;
    }
    (callsConfig as any).MAX_GROUP_CALL_PARTICIPANTS = 3; // room is now over the cap

    // The last invitee is told the call is full rather than being added to a mesh
    // that is already at its limit (or left ringing with nothing to show for it).
    const full = once<{ id: string; maxParticipants: number }>(d, 'group:call:full');
    d.emit('group:call:accept', { id: started.id });
    const refused = await full;
    expect(refused.id).toBe(started.id);
    expect(refused.maxParticipants).toBe(3);
    await expect(once(d, 'group:call:joined', 700)).rejects.toThrow(/Timed out/);
  });

  it('still refuses strangers when the cap is generous', async () => {
    (callsConfig as any).MAX_GROUP_CALL_PARTICIPANTS = 8;
    const { caller } = await pairWithExchange();
    const stranger = await signup('stranger-cap@skillswap.test', 'Stranger');
    const host = await connect(caller.token);

    const errorPromise = once<{ message: string }>(host, 'error');
    host.emit('group:call:start', { memberIds: [stranger.userId], video: false });
    expect((await errorPromise).message).toMatch(/no valid participants/i);
  });
});

describe('A call the server refuses', () => {
  // The refusal used to be emitted only on the generic `error` event, which no
  // client listened for: the caller sat on "Ringing…" forever (the return happens
  // before the ring timer is armed) and then could not place another call,
  // because startCall() only fires from status 'none'.
  it('names the reason when the exchange is no longer active, and rings nobody', async () => {
    const { caller, callee, exchangeId } = await pairWithExchange();
    await prisma.exchange.update({ where: { id: exchangeId }, data: { status: 'COMPLETED' } });

    const a = await connect(caller.token);
    const b = await connect(callee.token);
    const refused = once<{ exchangeId: string; reason: string; message: string }>(a, 'call:error');

    a.emit('call:request', { exchangeId, video: false });

    const err = await refused;
    expect(err.exchangeId).toBe(exchangeId);
    expect(err.reason).toBe('exchange-not-active');
    expect(err.message).toMatch(/accepted/i);
    // The callee must not be rung for a call that was never placed.
    await expect(once(b, 'call:ringing', 700)).rejects.toThrow(/Timed out/);
  });

  it('names the reason when the exchange does not exist', async () => {
    const { caller } = await pairWithExchange();
    const a = await connect(caller.token);
    const refused = once<{ reason: string; message: string }>(a, 'call:error');

    a.emit('call:request', { exchangeId: 'a3f1c2d4-0000-4000-8000-000000000000', video: false });

    const err = await refused;
    expect(err.reason).toBe('unknown-exchange');
    expect(err.message.length).toBeGreaterThan(10);
  });

  it('names the reason when the caller is not in that exchange', async () => {
    const { callee, exchangeId } = await pairWithExchange();
    const outsider = await signup('outsider@skillswap.test', 'Outsider');
    const s = await connect(outsider.token);
    const refused = once<{ reason: string }>(s, 'call:error');

    // Someone else's conversation id: a valid exchange, wrong socket.
    s.emit('call:request', { exchangeId, video: false });

    expect((await refused).reason).toBe('not-a-participant');
    expect(callee.userId).toBeTruthy();
  });
});
