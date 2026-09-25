import { Server as IOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { COOKIE_NAME } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { sendIncomingCallPush } from '../services/push.service';
import { createMessageSchema } from '../validators/schemas';

let io: IOServer | null = null;

// Live sockets per user (used to decide whether an incoming call needs an FCM
// push because the callee has no connected app instance).
const connectedUsers = new Set<string>();

interface ActiveCall {
  callerId: string;
  calleeId: string;
  type: 'VOICE' | 'VIDEO';
  startedAt: Date;
}

const activeCalls = new Map<string, ActiveCall>();

interface GroupCall {
  id: string;
  hostId: string;
  video: boolean;
  members: Set<string>;
  accepted: Set<string>;
}

// In-memory group calls (mesh signaling). Group calls are not persisted to the
// call log; the roster lives only while the call is live.
const groupCalls = new Map<string, GroupCall>();

async function loadUserPeer(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      profile: { select: { avatarUrl: true, avatarFrame: true } },
    },
  });
  return {
    id: u?.id ?? userId,
    displayName: u?.displayName ?? 'User',
    avatarUrl: u?.profile?.avatarUrl ?? null,
    avatarFrame: u?.profile?.avatarFrame ?? null,
  };
}

async function persistCallLog(exchangeId: string, endedByUserId: string, outcome: 'COMPLETED' | 'DECLINED') {
  const active = activeCalls.get(exchangeId);
  if (!active) return;
  activeCalls.delete(exchangeId);
  try {
    await prisma.callLog.create({
      data: {
        exchangeId,
        callerId: active.callerId,
        calleeId: active.calleeId,
        type: active.type,
        outcome,
        startedAt: active.startedAt,
        endedAt: new Date(),
      },
    });
  } catch (e) {
    // Call logging must never break signaling; schema sync happens via `prisma db push`.
    console.error('[call-log] failed to persist', e);
  }
}

/**
 * The other member of a 1:1 call — live call map first, exchange row second.
 *
 * Call events used to be relayed only to the `exchange:{id}` room, which a
 * client joins solely by opening the chat. Calling from the Calls tab, a profile
 * or the dashboard therefore left the caller deaf to accept/reject/hang-up, and
 * the call hung on "ringing" forever.
 */
async function counterpartOfCall(exchangeId: string, userId: string): Promise<string | null> {
  const active = activeCalls.get(exchangeId);
  if (active) return active.callerId === userId ? active.calleeId : active.callerId;
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    select: { userAId: true, userBId: true },
  });
  if (!exchange) return null;
  return exchange.userAId === userId ? exchange.userBId : exchange.userAId;
}

/**
 * Ends every call a user was in when their socket dropped and tells the other
 * participants, so nobody is left staring at a frozen call screen.
 */
async function cleanupCallsForUser(userId: string) {
  for (const [exchangeId, call] of Array.from(activeCalls.entries())) {
    if (call.callerId !== userId && call.calleeId !== userId) continue;
    const other = call.callerId === userId ? call.calleeId : call.callerId;
    const payload = { exchangeId, endedBy: userId, reason: 'disconnect' };
    io?.to(`exchange:${exchangeId}`).emit('call:ended', payload);
    io?.to(`user:${other}`).emit('call:ended', payload);
    await persistCallLog(exchangeId, userId, 'COMPLETED');
  }

  // Mirrors `group:call:leave` for a member who vanished instead of hanging up.
  for (const [id, call] of Array.from(groupCalls.entries())) {
    if (!call.members.has(userId)) continue;
    call.members.delete(userId);
    call.accepted.delete(userId);
    io?.to(`group:${id}`).emit('group:call:member:left', { id, userId });
    if (userId === call.hostId || call.accepted.size <= 1) {
      io?.to(`group:${id}`).emit('group:call:ended', { id });
      groupCalls.delete(id);
    }
  }
}

export function initSocket(httpServer: HTTPServer) {
  io = new IOServer(httpServer, {
    cors: {
      origin: env.CLIENT_URL === '*' ? true : env.CLIENT_URL,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      let token: string | undefined;
      const cookieHeader = socket.handshake.headers.cookie || '';
      const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
      if (match) token = decodeURIComponent(match[1]);
      if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }
      if (!token) return next(new Error('Unauthorized'));

      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string; tokenVersion?: number };
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, isActive: true, tokenVersion: true },
      });
      if (!user || !user.isActive) return next(new Error('Unauthorized'));
      // Same revocation rule as requireAuth, so a logged-out or deactivated user
      // cannot keep a socket open with an old token.
      if ((payload.tokenVersion ?? 0) !== user.tokenVersion) return next(new Error('Unauthorized'));

      (socket as any).userId = user.id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as string;
    socket.join(`user:${userId}`);
    connectedUsers.add(userId);

    socket.on('disconnect', () => {
      connectedUsers.delete(userId);
      void cleanupCallsForUser(userId);
    });

    socket.on('exchange:join', async (exchangeId: string) => {
      const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
      if (
        exchange &&
        (exchange.userAId === userId || exchange.userBId === userId) &&
        exchange.status === 'ACTIVE'
      ) {
        socket.join(`exchange:${exchangeId}`);
      }
    });

    socket.on('exchange:leave', (exchangeId: string) => {
      socket.leave(`exchange:${exchangeId}`);
    });

    socket.on('message:send', async (data: { exchangeId: string; body: string; type?: string; caption?: string | null }) => {
      try {
        const parsed = createMessageSchema.safeParse({ body: data.body, type: data.type ?? 'TEXT', caption: data.caption });
        if (!parsed.success) return;
        const exchange = await prisma.exchange.findUnique({ where: { id: data.exchangeId } });
        if (
          !exchange ||
          (exchange.userAId !== userId && exchange.userBId !== userId) ||
          exchange.status !== 'ACTIVE'
        ) return;

        const message = await prisma.message.create({
          data: {
            exchangeId: data.exchangeId,
            senderId: userId,
            body: parsed.data.body,
            type: parsed.data.type,
            caption: parsed.data.caption ?? null,
          },
          include: { sender: { select: { id: true, displayName: true } } },
        });
        io!.to(`exchange:${data.exchangeId}`).emit('message:new', message);
      } catch (e) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('message:read', async (data: { exchangeId: string }) => {
      await prisma.message.updateMany({
        where: { exchangeId: data.exchangeId, senderId: { not: userId }, status: { not: 'READ' } },
        data: { status: 'READ', readAt: new Date() },
      });
      io!.to(`exchange:${data.exchangeId}`).emit('message:read', {
        exchangeId: data.exchangeId,
        readerId: userId,
      });
    });

    socket.on('typing', (data: { exchangeId: string }) => {
      socket.to(`exchange:${data.exchangeId}`).emit('typing', {
        exchangeId: data.exchangeId,
        userId,
      });
    });

    // ── Call signaling ────────────────────────────────────────────────
    socket.on('call:request', async (data: { exchangeId: string; video?: boolean }) => {
      try {
        const exchange = await prisma.exchange.findUnique({
          where: { id: data.exchangeId },
          select: { id: true, userAId: true, userBId: true, status: true },
        });
        if (!exchange || (exchange.userAId !== userId && exchange.userBId !== userId) || exchange.status !== 'ACTIVE') {
          return socket.emit('error', { message: 'Cannot place call' });
        }
        const targetUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
        activeCalls.set(data.exchangeId, {
          callerId: userId,
          calleeId: targetUserId,
          type: data.video ? 'VIDEO' : 'VOICE',
          startedAt: new Date(),
        });
        const caller = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            profile: { select: { avatarUrl: true, avatarFrame: true } },
          },
        });
        const callerPayload = {
          id: caller?.id ?? userId,
          displayName: caller?.displayName ?? 'User',
          avatarUrl: caller?.profile?.avatarUrl ?? null,
          avatarFrame: caller?.profile?.avatarFrame ?? null,
        };
        const payload = { exchangeId: data.exchangeId, video: !!data.video, caller: callerPayload };
        io!.to(`exchange:${data.exchangeId}`).emit('call:ringing', payload);
        io!.to(`user:${targetUserId}`).emit('call:ringing', payload);
        // Callee isn't running the app — ring their phone via FCM so they still
        // get told "someone is calling" even with the app fully closed.
        if (!connectedUsers.has(targetUserId)) {
          void sendIncomingCallPush(targetUserId, {
            exchangeId: data.exchangeId,
            video: !!data.video,
            caller: callerPayload,
          });
        }
      } catch (e) {
        socket.emit('error', { message: 'Failed to initiate call' });
      }
    });

    socket.on('call:accept', async (data: { exchangeId: string }) => {
      const payload = { exchangeId: data.exchangeId, acceptorId: userId };
      socket.to(`exchange:${data.exchangeId}`).emit('call:accepted', payload);
      const caller = await counterpartOfCall(data.exchangeId, userId);
      if (caller && caller !== userId) io!.to(`user:${caller}`).emit('call:accepted', payload);
    });

    socket.on('call:reject', async (data: { exchangeId: string }) => {
      const payload = { exchangeId: data.exchangeId, rejectorId: userId };
      socket.to(`exchange:${data.exchangeId}`).emit('call:rejected', payload);
      // Resolve the counterpart before persistCallLog() clears the call map.
      const other = await counterpartOfCall(data.exchangeId, userId);
      if (other && other !== userId) io!.to(`user:${other}`).emit('call:rejected', payload);
      await persistCallLog(data.exchangeId, userId, 'DECLINED');
    });

    socket.on('call:hangup', async (data: { exchangeId: string }) => {
      const payload = { exchangeId: data.exchangeId, endedBy: userId };
      socket.to(`exchange:${data.exchangeId}`).emit('call:ended', payload);
      const other = await counterpartOfCall(data.exchangeId, userId);
      if (other && other !== userId) io!.to(`user:${other}`).emit('call:ended', payload);
      await persistCallLog(data.exchangeId, userId, 'COMPLETED');
    });

    socket.on('webrtc:signal', (data: { exchangeId: string; to: string; signal: any }) => {
      io!.to(`user:${data.to}`).emit('webrtc:signal', {
        exchangeId: data.exchangeId,
        from: userId,
        signal: data.signal,
      });
    });

    // ── Group calls (real WebRTC mesh) ────────────────────────────────────────
    socket.on('group:call:start', async (data: { memberIds?: string[]; video?: boolean }) => {
      try {
        const requested = Array.from(new Set((data.memberIds || []).filter((m) => m && m !== userId)));
        if (requested.length < 1) return;

        // Only people you have an ACTIVE exchange with can be added.
        const exchanges = await prisma.exchange.findMany({
          where: { status: 'ACTIVE', OR: [{ userAId: userId }, { userBId: userId }] },
          select: { userAId: true, userBId: true },
        });
        const partners = new Set<string>();
        for (const ex of exchanges) partners.add(ex.userAId === userId ? ex.userBId : ex.userAId);
        const valid = requested.filter((id) => partners.has(id));
        if (valid.length < 1) {
          socket.emit('error', { message: 'No valid participants for this group call' });
          return;
        }

        const id = randomUUID();
        groupCalls.set(id, {
          id,
          hostId: userId,
          video: !!data.video,
          members: new Set([userId, ...valid]),
          accepted: new Set([userId]),
        });
        socket.join(`group:${id}`);

        const hostPeer = await loadUserPeer(userId);
        socket.emit('group:call:started', { id, video: !!data.video, members: [hostPeer] });
        for (const memberId of valid) {
          io!.to(`user:${memberId}`).emit('group:call:ringing', {
            id,
            video: !!data.video,
            host: hostPeer,
            memberCount: valid.length + 1,
          });
        }
      } catch (e) {
        console.error('[group-call] start failed', e);
        socket.emit('error', { message: 'Failed to start group call' });
      }
    });

    socket.on('group:call:accept', async (data: { id: string }) => {
      try {
        const call = groupCalls.get(data.id);
        if (!call || !call.members.has(userId)) return;
        call.accepted.add(userId);
        socket.join(`group:${data.id}`);
        const peer = await loadUserPeer(userId);
        io!.to(`group:${data.id}`).emit('group:call:member:joined', {
          id: data.id,
          userId,
          peer,
          memberCount: call.accepted.size,
        });
        const members: any[] = [];
        for (const uid of call.accepted) {
          if (uid === userId) continue;
          members.push(await loadUserPeer(uid));
        }
        socket.emit('group:call:joined', {
          id: data.id,
          hostId: call.hostId,
          video: call.video,
          members,
        });
      } catch (e) {
        console.error('[group-call] accept failed', e);
      }
    });

    socket.on('group:call:reject', (data: { id: string }) => {
      if (!groupCalls.has(data.id)) return;
      io!.to(`group:${data.id}`).emit('group:call:member:rejected', { id: data.id, userId });
    });

    socket.on('group:call:leave', (data: { id: string }) => {
      const call = groupCalls.get(data.id);
      if (!call) return;
      socket.leave(`group:${data.id}`);
      call.accepted.delete(userId);
      io!.to(`group:${data.id}`).emit('group:call:member:left', { id: data.id, userId });
      // Host leaving (or one participant left) ends the room for everyone.
      if (userId === call.hostId || call.accepted.size <= 1) {
        io!.to(`group:${data.id}`).emit('group:call:ended', { id: data.id });
        groupCalls.delete(data.id);
      }
    });

    socket.on('group:signal', (data: { id: string; to: string; signal: any }) => {
      const call = groupCalls.get(data.id);
      if (!call || !call.accepted.has(userId) || !data.to) return;
      io!.to(`user:${data.to}`).emit('group:signal', {
        id: data.id,
        from: userId,
        signal: data.signal,
      });
    });

    socket.on('group:call:update', (data: { id: string; mic?: boolean; camera?: boolean }) => {
      socket.to(`group:${data.id}`).emit('group:call:peer:update', {
        id: data.id,
        userId,
        mic: data.mic,
        camera: data.camera,
      });
    });
  });
}

export function emitToExchange(exchangeId: string, event: string, payload: any) {
  if (!io) return;
  io.to(`exchange:${exchangeId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}