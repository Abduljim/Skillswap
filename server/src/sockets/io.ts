import { Server as IOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { COOKIE_NAME } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  sendCallCancelledPush,
  sendGroupCallCancelledPush,
  sendGroupCallPush,
  sendIncomingCallPush,
} from '../services/push.service';
import { createMessageSchema } from '../validators/schemas';
import { callRingTimeoutMs, MAX_GROUP_CALL_PARTICIPANTS } from '../config/calls';

let io: IOServer | null = null;

/**
 * Live sockets per user, keyed by socket id.
 *
 * A user can hold several sockets at once — two browser tabs, or a phone and a
 * laptop. Tracking only "this user is connected" meant one of them dropping
 * looked like the whole user had gone, which hid them from call routing and
 * pushed to a phone that was still sitting on the chat screen.
 */
const connectedSockets = new Map<string, Set<string>>();

/**
 * Sockets whose app has reported itself NOT visible: Android backgrounded, or a
 * hidden browser tab.
 *
 * A socket counts as foreground until it says otherwise, so an older client
 * that never reports presence behaves exactly as it did before instead of
 * getting both the in-app call sheet and a push notification.
 */
const backgroundSockets = new Map<string, Set<string>>();

function addSocket(map: Map<string, Set<string>>, userId: string, socketId: string) {
  const set = map.get(userId);
  if (set) set.add(socketId);
  else map.set(userId, new Set([socketId]));
}

function dropSocket(map: Map<string, Set<string>>, userId: string, socketId: string) {
  const set = map.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (!set.size) map.delete(userId);
}

/**
 * Can this user actually see an incoming call right now?
 *
 * False when no socket is connected (app closed) and also when every socket
 * they hold has reported the app as backgrounded. A backgrounded Android app
 * keeps its socket alive for minutes, and in that window it can neither show
 * the call sheet nor be reached by a socket event — which is how calls got
 * missed with the app apparently "open".
 */
function calleeIsPresent(userId: string): boolean {
  if (!connectedSockets.has(userId)) return false;
  return !backgroundSockets.has(userId);
}

/**
 * Public face of calleeIsPresent for REST handlers: "online" means the app is
 * live in the foreground somewhere (same rule calls use). Locked/backgrounded
 * or closed ⇒ offline — which is also what a push-rung phone looks like, and
 * the message-list dot should honestly say red there.
 */
export function isUserOnline(userId: string): boolean {
  return calleeIsPresent(userId);
}

/**
 * Presence fan-out. Every authenticated socket joins `presence:all`; when a
 * user's online/offline value flips, everyone is told so the green/red dots in
 * the message list stay live without polling. Emits only on change — connects
 * and foreground/background flips that don't change the value are silent.
 */
const lastBroadcastPresence = new Map<string, boolean>();
function broadcastPresence(userId: string) {
  const online = calleeIsPresent(userId);
  if (lastBroadcastPresence.get(userId) === online) return;
  // Track only online users so the map can't grow without bound; a duplicate
  // "offline" for an already-offline user is harmless (clients are idempotent).
  if (online) lastBroadcastPresence.set(userId, true);
  else lastBroadcastPresence.delete(userId);
  io?.to('presence:all').emit('presence:update', { userId, online });
}

interface ActiveCall {
  callerId: string;
  calleeId: string;
  type: 'VOICE' | 'VIDEO';
  startedAt: Date;
  /** Set once the callee accepts; until then the call is still ringing. */
  acceptedAt: Date | null;
  /** Ends a ring nobody answered — see callRingTimeoutMs(). */
  ringTimer: ReturnType<typeof setTimeout> | null;
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

async function persistCallLog(
  exchangeId: string,
  endedByUserId: string,
  outcome: 'COMPLETED' | 'DECLINED' | 'MISSED'
) {
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
 * The rooms that reach the other participant exactly once.
 *
 * A call event has to arrive whether or not the peer has the chat open: the
 * exchange room only exists while that screen is mounted, whereas every socket
 * is always in its own `user:<id>` room. Emitting to the two rooms separately
 * delivered every event twice to anyone on the chat screen, because they are in
 * both. Socket.IO dedupes sockets across a room array, so a single emit to both
 * keeps the reach and drops the duplicate.
 */
function peerRooms(exchangeId: string, other: string | null, self: string): string[] {
  const rooms = [`exchange:${exchangeId}`];
  if (other && other !== self) rooms.push(`user:${other}`);
  return rooms;
}

/** Rooms that reach BOTH participants, still exactly once per socket. */
function bothPeerRooms(exchangeId: string, a: string, b: string): string[] {
  return [...peerRooms(exchangeId, a, b), ...peerRooms(exchangeId, b, a)];
}

function clearRingTimer(call: ActiveCall) {
  if (call.ringTimer) {
    clearTimeout(call.ringTimer);
    call.ringTimer = null;
  }
}

/**
 * Silence a phone that is ringing from a push notification.
 *
 * Only needed while the call is unanswered and the callee cannot see the app:
 * the notification is insistent, and a closed app has no socket to receive
 * `call:ended` on, so the caller hanging up would otherwise leave the other
 * phone ringing for a call that no longer exists.
 */
function cancelCalleeRing(exchangeId: string, call: ActiveCall) {
  if (call.acceptedAt) return;
  if (calleeIsPresent(call.calleeId)) return;
  void sendCallCancelledPush(call.calleeId, exchangeId);
}

/**
 * Silence phones still ringing for a group call that has just ended.
 *
 * Invitees who never accepted are not in the `group:{id}` room, so the
 * `group:call:ended` emit cannot reach them — and if their app is closed the
 * insistent notification would keep ringing for a call that no longer exists.
 */
function cancelAbsentGroupRings(call: GroupCall) {
  for (const memberId of call.members) {
    if (call.accepted.has(memberId)) continue;
    if (calleeIsPresent(memberId)) continue;
    void sendGroupCallCancelledPush(memberId, call.id);
  }
}

/**
 * Ends a call nobody answered: tells both sides, silences the callee's phone,
 * and logs it as MISSED rather than leaving the caller ringing forever.
 */
async function endUnansweredCall(exchangeId: string) {
  const call = activeCalls.get(exchangeId);
  if (!call || call.acceptedAt) return;
  clearRingTimer(call);
  io?.to(bothPeerRooms(exchangeId, call.callerId, call.calleeId)).emit('call:ended', {
    exchangeId,
    endedBy: call.calleeId,
    reason: 'no-answer',
  });
  void sendCallCancelledPush(call.calleeId, exchangeId);
  // persistCallLog also drops the call from activeCalls.
  await persistCallLog(exchangeId, call.calleeId, 'MISSED');
}

/**
 * Ends every call a user was in when their socket dropped and tells the other
 * participants, so nobody is left staring at a frozen call screen.
 */
async function cleanupCallsForUser(userId: string) {
  for (const [exchangeId, call] of Array.from(activeCalls.entries())) {
    if (call.callerId !== userId && call.calleeId !== userId) continue;
    const other = call.callerId === userId ? call.calleeId : call.callerId;
    clearRingTimer(call);
    const payload = { exchangeId, endedBy: userId, reason: 'disconnect' };
    io?.to(peerRooms(exchangeId, other, userId)).emit('call:ended', payload);
    // The peer who vanished may have been ringing this phone from a push.
    cancelCalleeRing(exchangeId, call);
    // A call that dropped before anyone answered is a missed call, not a
    // completed one — that is what the CallOutcome.MISSED value is for.
    await persistCallLog(exchangeId, userId, call.acceptedAt ? 'COMPLETED' : 'MISSED');
  }

  // Mirrors `group:call:leave` for a member who vanished instead of hanging up.
  for (const [id, call] of Array.from(groupCalls.entries())) {
    if (!call.members.has(userId)) continue;
    call.members.delete(userId);
    call.accepted.delete(userId);
    io?.to(`group:${id}`).emit('group:call:member:left', { id, userId });
    if (userId === call.hostId || call.accepted.size <= 1) {
      io?.to(`group:${id}`).emit('group:call:ended', { id });
      cancelAbsentGroupRings(call);
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
    addSocket(connectedSockets, userId, socket.id);
    // Live presence room + announce (first connect flips false→true ⇒ emitted).
    socket.join('presence:all');
    broadcastPresence(userId);

    socket.on('disconnect', () => {
      dropSocket(connectedSockets, userId, socket.id);
      dropSocket(backgroundSockets, userId, socket.id);
      broadcastPresence(userId);
      void cleanupCallsForUser(userId);
    });

    /**
     * Foreground reporting from the client: `false` when the app is backgrounded
     * or the tab is hidden, `true` when it comes back.
     *
     * This is what lets an incoming call ring a phone that is merely locked or
     * on the home screen — its socket is still alive, so presence, not
     * connectivity, is the only way to know the user cannot see the call.
     */
    socket.on('presence:set', (data: { foreground?: unknown }) => {
      if (data?.foreground === false) addSocket(backgroundSockets, userId, socket.id);
      else dropSocket(backgroundSockets, userId, socket.id);
      broadcastPresence(userId);
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
          // Name the reason. This returns before the ring timer is armed, so a
          // silent refusal left the caller on "Ringing…" forever with no
          // `call:ended` to follow — and their client then refused every later
          // attempt, because startCall() only fires from status 'none'.
          const reason = !exchange
            ? 'unknown-exchange'
            : exchange.userAId !== userId && exchange.userBId !== userId
              ? 'not-a-participant'
              : 'exchange-not-active';
          const message =
            reason === 'unknown-exchange'
              ? 'That conversation no longer exists.'
              : reason === 'not-a-participant'
                ? 'You are not part of that conversation.'
                : 'You can only call someone once your exchange has been accepted.';
          socket.emit('call:error', { exchangeId: data.exchangeId, reason, message });
          return socket.emit('error', { message: 'Cannot place call' });
        }
        const targetUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
        // A re-dial replaces any stale entry; clear its timer so it cannot fire
        // and end the new call.
        const stale = activeCalls.get(data.exchangeId);
        if (stale) clearRingTimer(stale);
        activeCalls.set(data.exchangeId, {
          callerId: userId,
          calleeId: targetUserId,
          type: data.video ? 'VIDEO' : 'VOICE',
          startedAt: new Date(),
          acceptedAt: null,
          ringTimer: null,
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
        io!.to(peerRooms(data.exchangeId, targetUserId, userId)).emit('call:ringing', payload);
        // Ring their phone when they cannot see the app: no socket at all (app
        // closed), or every socket they hold has reported the app backgrounded
        // (locked screen, home screen). The socket stays alive for minutes in
        // that state, so connectivity alone used to mean the call was missed.
        const present = calleeIsPresent(targetUserId);
        let pushed = 0;
        let pushSkipped = false;
        if (!present) {
          const result = await sendIncomingCallPush(targetUserId, {
            exchangeId: data.exchangeId,
            video: !!data.video,
            caller: callerPayload,
          });
          pushed = result.sent;
          pushSkipped = result.skipped;
        }
        // "Ringing…" must never mean "nobody can hear this". No socket and zero
        // pushes means the callee has no device registered for push (never
        // opened the app since FCM was wired up, or no Play services); skipped
        // means the server has no FCM key. The caller shows each case plainly.
        socket.emit('call:callee-reachability', {
          exchangeId: data.exchangeId,
          present,
          pushed,
          pushSkipped,
        });
        console.log(
          `📞 [call] ${data.exchangeId.slice(0, 8)} request: callee present=${present} push sent=${pushed} skipped=${pushSkipped}`
        );

        // Nobody answers → end it. Otherwise the caller stays on "Ringing…"
        // forever and a callee ringing from a push keeps an insistent
        // notification going until they notice it.
        const ringTimer = setTimeout(() => {
          void endUnansweredCall(data.exchangeId);
        }, callRingTimeoutMs());
        ringTimer.unref?.();
        const ringing = activeCalls.get(data.exchangeId);
        if (ringing) ringing.ringTimer = ringTimer;
      } catch (e) {
        socket.emit('call:error', {
          exchangeId: data.exchangeId,
          reason: 'server-error',
          message: 'That call could not be placed. Check your connection and try again.',
        });
        socket.emit('error', { message: 'Failed to initiate call' });
      }
    });

    socket.on('call:accept', async (data: { exchangeId: string }) => {
      const payload = { exchangeId: data.exchangeId, acceptorId: userId };
      const accepted = activeCalls.get(data.exchangeId);
      if (accepted) {
        accepted.acceptedAt = new Date();
        clearRingTimer(accepted);
      }
      const caller = await counterpartOfCall(data.exchangeId, userId);
      socket.to(peerRooms(data.exchangeId, caller, userId)).emit('call:accepted', payload);
    });

    socket.on('call:reject', async (data: { exchangeId: string; reason?: string }) => {
      // 'media-denied' means their phone could not open the microphone. Passed
      // on so the caller is told instead of ringing out the timeout.
      const payload = {
        exchangeId: data.exchangeId,
        rejectorId: userId,
        ...(data.reason ? { reason: data.reason } : {}),
      };
      // Resolve the counterpart before persistCallLog() clears the call map.
      const other = await counterpartOfCall(data.exchangeId, userId);
      const rejected = activeCalls.get(data.exchangeId);
      if (rejected) clearRingTimer(rejected);
      socket.to(peerRooms(data.exchangeId, other, userId)).emit('call:rejected', payload);
      await persistCallLog(data.exchangeId, userId, 'DECLINED');
    });

    socket.on('call:hangup', async (data: { exchangeId: string }) => {
      const payload = { exchangeId: data.exchangeId, endedBy: userId };
      const call = activeCalls.get(data.exchangeId);
      // Both lookups must happen before persistCallLog() clears the call map.
      const other = await counterpartOfCall(data.exchangeId, userId);
      if (call) {
        clearRingTimer(call);
        // Hanging up before the other side answered: their phone may still be
        // ringing from a push, and no socket event will ever reach it.
        cancelCalleeRing(data.exchangeId, call);
      }
      socket.to(peerRooms(data.exchangeId, other, userId)).emit('call:ended', payload);
      await persistCallLog(data.exchangeId, userId, call?.acceptedAt ? 'COMPLETED' : 'MISSED');
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
        const eligible = requested.filter((id) => partners.has(id));
        if (eligible.length < 1) {
          socket.emit('group:call:error', {
            reason: 'no-eligible-invitees',
            message: 'You can only group-call people you have an accepted exchange with.',
          });
          socket.emit('error', { message: 'No valid participants for this group call' });
          return;
        }

        // Mesh cap. Extra invitees are dropped here rather than rung, and the
        // host is told via `capped` so the UI can say why instead of the invite
        // silently vanishing for two people.
        const maxOthers = Math.max(1, MAX_GROUP_CALL_PARTICIPANTS - 1);
        const valid = eligible.slice(0, maxOthers);
        const capped = eligible.length > valid.length;

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
        socket.emit('group:call:started', {
          id,
          video: !!data.video,
          members: [hostPeer],
          capped,
          maxParticipants: MAX_GROUP_CALL_PARTICIPANTS,
        });
        for (const memberId of valid) {
          io!.to(`user:${memberId}`).emit('group:call:ringing', {
            id,
            video: !!data.video,
            host: hostPeer,
            memberCount: valid.length + 1,
          });
          // Same reachability rule as a 1:1 call: an invitee whose app is closed
          // or backgrounded cannot see the sheet, so ring the phone instead.
          // Without this the invite vanished for them and the host just waited.
          if (!calleeIsPresent(memberId)) {
            void sendGroupCallPush(memberId, {
              groupId: id,
              video: !!data.video,
              host: hostPeer,
              memberCount: valid.length + 1,
            });
          }
        }
      } catch (e) {
        console.error('[group-call] start failed', e);
        socket.emit('group:call:error', {
          reason: 'server-error',
          message: 'That group call could not be started. Check your connection and try again.',
        });
        socket.emit('error', { message: 'Failed to start group call' });
      }
    });

    socket.on('group:call:accept', async (data: { id: string }) => {
      try {
        const call = groupCalls.get(data.id);
        if (!call || !call.members.has(userId)) return;
        // Enforced again on join: the roster is fixed at start, but several
        // people can accept at once and race past the cap.
        if (!call.accepted.has(userId) && call.accepted.size >= MAX_GROUP_CALL_PARTICIPANTS) {
          socket.emit('group:call:full', {
            id: data.id,
            maxParticipants: MAX_GROUP_CALL_PARTICIPANTS,
          });
          return;
        }
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
        cancelAbsentGroupRings(call);
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