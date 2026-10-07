/**
 * Hangup propagation — the contract that ending a call ends it EVERYWHERE.
 *
 * User report (v1.15): "when I cut it on my side it keeps running [for the
 * other]". These pin both directions and both phases:
 *   1. Callee accepts, callee hangs up  ⇒ caller gets call:ended.
 *   2. Caller hangs up while ringing    ⇒ callee gets call:ended.
 *   3. Caller hangs up after accept     ⇒ callee gets call:ended.
 */
import http from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../../src/app';
import { initSocket } from '../../src/sockets/io';
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

function once<T = any>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, h);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const h = (d: T) => {
      clearTimeout(t);
      socket.off(event, h);
      resolve(d);
    };
    socket.on(event, h);
  });
}

async function pairWithExchange() {
  const python = await createSkill('Python (hangup test)');
  const guitar = await createSkill('Guitar (hangup test)');
  const a = await signup('hangup-a@skillswap.test', 'Ada');
  const b = await signup('hangup-b@skillswap.test', 'Ben');
  await api()
    .post(`/api/skills/${python}/add`)
    .set('Cookie', a.cookie)
    .send({ skillId: python, type: 'TEACH', proficiency: 'ADVANCED' });
  await api()
    .post(`/api/skills/${guitar}/add`)
    .set('Cookie', a.cookie)
    .send({ skillId: guitar, type: 'WANT', proficiency: 'BEGINNER' });
  await api()
    .post(`/api/skills/${guitar}/add`)
    .set('Cookie', b.cookie)
    .send({ skillId: guitar, type: 'TEACH', proficiency: 'ADVANCED' });
  await api()
    .post(`/api/skills/${python}/add`)
    .set('Cookie', b.cookie)
    .send({ skillId: python, type: 'WANT', proficiency: 'BEGINNER' });
  const req = await api()
    .post('/api/exchange-requests')
    .set('Cookie', a.cookie)
    .send({ receiverId: b.userId, offeredSkillId: python, requestedSkillId: guitar, message: 'Hi! Want to swap lessons?' });
  await api()
    .post(`/api/exchange-requests/${req.body.data.id}/accept`)
    .set('Cookie', b.cookie);
  const exchange = await prisma.exchange.findFirst({
    where: { status: 'ACTIVE', OR: [{ userAId: a.userId, userBId: b.userId }, { userAId: b.userId, userBId: a.userId }] },
    select: { id: true },
  });
  if (!exchange) throw new Error('Exchange was never activated');
  return { a, b, exchangeId: exchange.id };
}

beforeAll(async () => {
  await startSocketServer();
});

beforeEach(async () => {
  for (const s of openSockets.splice(0)) if (s.connected) s.disconnect();
  await resetDatabase();
});

afterAll(async () => {
  for (const s of openSockets.splice(0)) if (s.connected) s.disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('hangup propagation', () => {
  it('callee hangs up after accepting ⇒ caller receives call:ended', async () => {
    const { a, b, exchangeId } = await pairWithExchange();
    const sa = await connect(a.token);
    const sb = await connect(b.token);

    const ringing = once(sb, 'call:ringing');
    sa.emit('call:request', { exchangeId, video: false });
    await ringing;

    const accepted = once(sa, 'call:accepted');
    sb.emit('call:accept', { exchangeId });
    await accepted;

    const endedAtCaller = once(sa, 'call:ended');
    sb.emit('call:hangup', { exchangeId });
    await endedAtCaller; // throws on timeout ⇒ regression caught
  });

  it('caller hangs up while ringing ⇒ callee receives call:ended', async () => {
    const { a, b, exchangeId } = await pairWithExchange();
    const sa = await connect(a.token);
    const sb = await connect(b.token);

    const ringing = once(sb, 'call:ringing');
    sa.emit('call:request', { exchangeId, video: true });
    await ringing;

    const endedAtCallee = once(sb, 'call:ended');
    sa.emit('call:hangup', { exchangeId });
    await endedAtCallee;
  });

  it('caller hangs up after accepting ⇒ callee receives call:ended', async () => {
    const { a, b, exchangeId } = await pairWithExchange();
    const sa = await connect(a.token);
    const sb = await connect(b.token);

    const ringing = once(sb, 'call:ringing');
    sa.emit('call:request', { exchangeId, video: true });
    await ringing;

    const accepted = once(sa, 'call:accepted');
    sb.emit('call:accept', { exchangeId });
    await accepted;

    const endedAtCallee = once(sb, 'call:ended');
    sa.emit('call:hangup', { exchangeId });
    await endedAtCallee;
  });
});
