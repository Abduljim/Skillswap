import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors';
import { emitToExchange } from '../sockets/io';

async function assertActiveParticipant(userId: string, exchangeId: string) {
  const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new NotFoundError('Exchange not found');
  if (exchange.userAId !== userId && exchange.userBId !== userId) {
    throw new ForbiddenError('Not a participant in this exchange');
  }
  if (exchange.status !== 'ACTIVE') {
    throw new BadRequestError('Exchange is not active');
  }
  return exchange;
}

export async function listMessages(userId: string, exchangeId: string) {
  await assertActiveParticipant(userId, exchangeId);
  const messages = await prisma.message.findMany({
    where: { exchangeId },
    orderBy: { createdAt: 'asc' },
    include: { sender: { select: { id: true, displayName: true } } },
  });
  // Mark unread as read for this user
  await prisma.message.updateMany({
    where: { exchangeId, readAt: null, senderId: { not: userId } },
    data: { readAt: new Date() },
  });
  return messages;
}

export async function createMessage(userId: string, exchangeId: string, body: string, type: string = 'TEXT') {
  const exchange = await assertActiveParticipant(userId, exchangeId);
  const message = await prisma.message.create({
    data: { exchangeId, senderId: userId, body, type: type as any },
    include: { sender: { select: { id: true, displayName: true } } },
  });
  emitToExchange(exchangeId, 'message:new', message);

  // Notify other user (truncate notification body for images)
  const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
  const notifBody = type === 'IMAGE' ? '📷 Image' : type === 'STICKER' ? '🎨 Sticker' : body.slice(0, 100);
  await prisma.notification.create({
    data: {
      userId: otherUserId,
      type: 'NEW_MESSAGE',
      title: `New message from ${message.sender.displayName}`,
      body: notifBody,
      payload: { exchangeId, messageId: message.id },
    },
  });

  return message;
}