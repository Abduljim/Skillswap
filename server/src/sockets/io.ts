import { Server as IOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { COOKIE_NAME } from '../middleware/auth';
import { prisma } from '../lib/prisma';

let io: IOServer | null = null;

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

      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, isActive: true },
      });
      if (!user || !user.isActive) return next(new Error('Unauthorized'));

      (socket as any).userId = user.id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as string;
    socket.join(`user:${userId}`);

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

    socket.on('message:send', async (data: { exchangeId: string; body: string }) => {
      try {
        const exchange = await prisma.exchange.findUnique({ where: { id: data.exchangeId } });
        if (
          !exchange ||
          (exchange.userAId !== userId && exchange.userBId !== userId) ||
          exchange.status !== 'ACTIVE'
        ) return;

        const message = await prisma.message.create({
          data: { exchangeId: data.exchangeId, senderId: userId, body: data.body },
          include: { sender: { select: { id: true, displayName: true } } },
        });
        io!.to(`exchange:${data.exchangeId}`).emit('message:new', message);
      } catch (e) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('message:read', async (data: { exchangeId: string }) => {
      await prisma.message.updateMany({
        where: { exchangeId: data.exchangeId, senderId: { not: userId }, readAt: null },
        data: { readAt: new Date() },
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