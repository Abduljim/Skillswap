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
  // Their messages become "delivered" once the other side pulls the thread.
  // "Read" is set by the reader via the socket a moment later.
  const delivered = await prisma.message.updateMany({
    where: { exchangeId, senderId: { not: userId }, status: 'SENT' },
    data: { status: 'DELIVERED' },
  });
  if (delivered.count > 0) emitToExchange(exchangeId, 'message:delivered', { exchangeId });
  return messages;
}

export async function listConversations(userId: string) {
  const exchanges = await prisma.exchange.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ userAId: userId }, { userBId: userId }],
      messages: { some: {} },
    },
    select: {
      id: true,
      userAId: true,
      updatedAt: true,
      userA: {
        select: {
          id: true,
          displayName: true,
          profile: { select: { avatarUrl: true, avatarFrame: true } },
        },
      },
      userB: {
        select: {
          id: true,
          displayName: true,
          profile: { select: { avatarUrl: true, avatarFrame: true } },
        },
      },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: {
        select: { messages: { where: { readAt: null, senderId: { not: userId } } } },
      },
    },
  });

  return exchanges
    .map((ex) => {
      const partner = ex.userAId === userId ? ex.userB : ex.userA;
      return {
        exchangeId: ex.id,
        partner,
        lastMessage: ex.messages[0] ?? null,
        unreadCount: ex._count.messages,
        updatedAt: ex.messages[0]?.createdAt ?? ex.updatedAt,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function createMessage(userId: string, exchangeId: string, body: string, type: string = 'TEXT', caption?: string | null) {
  const exchange = await assertActiveParticipant(userId, exchangeId);
  const message = await prisma.message.create({
    data: { exchangeId, senderId: userId, body, type: type as any, caption: caption ?? null },
    include: { sender: { select: { id: true, displayName: true } } },
  });
  emitToExchange(exchangeId, 'message:new', message);
  return message;
}