"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
exports.emitToExchange = emitToExchange;
exports.emitToUser = emitToUser;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../lib/prisma");
const push_service_1 = require("../services/push.service");
const schemas_1 = require("../validators/schemas");
let io = null;
// Live sockets per user (used to decide whether an incoming call needs an FCM
// push because the callee has no connected app instance).
const connectedUsers = new Set();
const activeCalls = new Map();
async function persistCallLog(exchangeId, endedByUserId, outcome) {
    const active = activeCalls.get(exchangeId);
    if (!active)
        return;
    activeCalls.delete(exchangeId);
    try {
        await prisma_1.prisma.callLog.create({
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
    }
    catch (e) {
        // Call logging must never break signaling; schema sync happens via `prisma db push`.
        console.error('[call-log] failed to persist', e);
    }
}
function initSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: env_1.env.CLIENT_URL === '*' ? true : env_1.env.CLIENT_URL,
            credentials: true,
        },
    });
    io.use(async (socket, next) => {
        try {
            let token;
            const cookieHeader = socket.handshake.headers.cookie || '';
            const match = cookieHeader.match(new RegExp(`${auth_1.COOKIE_NAME}=([^;]+)`));
            if (match)
                token = decodeURIComponent(match[1]);
            if (!token && socket.handshake.auth?.token) {
                token = socket.handshake.auth.token;
            }
            if (!token)
                return next(new Error('Unauthorized'));
            const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: payload.userId },
                select: { id: true, isActive: true },
            });
            if (!user || !user.isActive)
                return next(new Error('Unauthorized'));
            socket.userId = user.id;
            next();
        }
        catch {
            next(new Error('Unauthorized'));
        }
    });
    io.on('connection', (socket) => {
        const userId = socket.userId;
        socket.join(`user:${userId}`);
        connectedUsers.add(userId);
        socket.on('disconnect', () => {
            connectedUsers.delete(userId);
        });
        socket.on('exchange:join', async (exchangeId) => {
            const exchange = await prisma_1.prisma.exchange.findUnique({ where: { id: exchangeId } });
            if (exchange &&
                (exchange.userAId === userId || exchange.userBId === userId) &&
                exchange.status === 'ACTIVE') {
                socket.join(`exchange:${exchangeId}`);
            }
        });
        socket.on('exchange:leave', (exchangeId) => {
            socket.leave(`exchange:${exchangeId}`);
        });
        socket.on('message:send', async (data) => {
            try {
                const parsed = schemas_1.createMessageSchema.safeParse({ body: data.body, type: data.type ?? 'TEXT', caption: data.caption });
                if (!parsed.success)
                    return;
                const exchange = await prisma_1.prisma.exchange.findUnique({ where: { id: data.exchangeId } });
                if (!exchange ||
                    (exchange.userAId !== userId && exchange.userBId !== userId) ||
                    exchange.status !== 'ACTIVE')
                    return;
                const message = await prisma_1.prisma.message.create({
                    data: {
                        exchangeId: data.exchangeId,
                        senderId: userId,
                        body: parsed.data.body,
                        type: parsed.data.type,
                        caption: parsed.data.caption ?? null,
                    },
                    include: { sender: { select: { id: true, displayName: true } } },
                });
                io.to(`exchange:${data.exchangeId}`).emit('message:new', message);
            }
            catch (e) {
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
        socket.on('message:read', async (data) => {
            await prisma_1.prisma.message.updateMany({
                where: { exchangeId: data.exchangeId, senderId: { not: userId }, status: { not: 'READ' } },
                data: { status: 'READ', readAt: new Date() },
            });
            io.to(`exchange:${data.exchangeId}`).emit('message:read', {
                exchangeId: data.exchangeId,
                readerId: userId,
            });
        });
        socket.on('typing', (data) => {
            socket.to(`exchange:${data.exchangeId}`).emit('typing', {
                exchangeId: data.exchangeId,
                userId,
            });
        });
        // ── Call signaling ────────────────────────────────────────────────
        socket.on('call:request', async (data) => {
            try {
                const exchange = await prisma_1.prisma.exchange.findUnique({
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
                const caller = await prisma_1.prisma.user.findUnique({
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
                io.to(`exchange:${data.exchangeId}`).emit('call:ringing', payload);
                io.to(`user:${targetUserId}`).emit('call:ringing', payload);
                // Callee isn't running the app — ring their phone via FCM so they still
                // get told "someone is calling" even with the app fully closed.
                if (!connectedUsers.has(targetUserId)) {
                    void (0, push_service_1.sendIncomingCallPush)(targetUserId, {
                        exchangeId: data.exchangeId,
                        video: !!data.video,
                        caller: callerPayload,
                    });
                }
            }
            catch (e) {
                socket.emit('error', { message: 'Failed to initiate call' });
            }
        });
        socket.on('call:accept', (data) => {
            socket.to(`exchange:${data.exchangeId}`).emit('call:accepted', {
                exchangeId: data.exchangeId,
                acceptorId: userId,
            });
        });
        socket.on('call:reject', async (data) => {
            socket.to(`exchange:${data.exchangeId}`).emit('call:rejected', {
                exchangeId: data.exchangeId,
                rejectorId: userId,
            });
            await persistCallLog(data.exchangeId, userId, 'DECLINED');
        });
        socket.on('call:hangup', async (data) => {
            socket.to(`exchange:${data.exchangeId}`).emit('call:ended', {
                exchangeId: data.exchangeId,
                endedBy: userId,
            });
            await persistCallLog(data.exchangeId, userId, 'COMPLETED');
        });
        socket.on('webrtc:signal', (data) => {
            io.to(`user:${data.to}`).emit('webrtc:signal', {
                exchangeId: data.exchangeId,
                from: userId,
                signal: data.signal,
            });
        });
    });
}
function emitToExchange(exchangeId, event, payload) {
    if (!io)
        return;
    io.to(`exchange:${exchangeId}`).emit(event, payload);
}
function emitToUser(userId, event, payload) {
    if (!io)
        return;
    io.to(`user:${userId}`).emit(event, payload);
}
//# sourceMappingURL=io.js.map