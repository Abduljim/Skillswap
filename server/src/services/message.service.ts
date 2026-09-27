import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors';
import { emitToExchange } from '../sockets/io';
import { isOwnMediaUrl } from './supabase.service';

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

/** Pointers + metadata for a stored photo/video (see services/supabase.service). */
export interface MessageMedia {
  mediaUrl?: string | null;
  thumbUrl?: string | null;
  mediaBytes?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaDurationMs?: number | null;
}

export async function createMessage(
  userId: string,
  exchangeId: string,
  body: string,
  type: string = 'TEXT',
  caption?: string | null,
  media?: MessageMedia | null
) {
  const exchange = await assertActiveParticipant(userId, exchangeId);

  // A bubble may only point at media this server stored. Without the check any
  // signed-in client could attach an arbitrary third-party URL to a chat
  // message — a tracking pixel, a malware link rendered as a preview, or
  // someone else's bucket billed to them.
  if (media?.mediaUrl && !isOwnMediaUrl(media.mediaUrl)) {
    throw new BadRequestError('That media link is not from SkillSwap storage.');
  }
  if (media?.thumbUrl && !isOwnMediaUrl(media.thumbUrl)) {
    throw new BadRequestError('That thumbnail link is not from SkillSwap storage.');
  }

  const message = await prisma.message.create({
    data: {
      exchangeId,
      senderId: userId,
      body,
      type: type as any,
      caption: caption ?? null,
      mediaUrl: media?.mediaUrl ?? null,
      thumbUrl: media?.thumbUrl ?? null,
      mediaBytes: media?.mediaBytes ?? null,
      mediaWidth: media?.mediaWidth ?? null,
      mediaHeight: media?.mediaHeight ?? null,
      mediaDurationMs: media?.mediaDurationMs ?? null,
    },
    include: { sender: { select: { id: true, displayName: true } } },
  });
  emitToExchange(exchangeId, 'message:new', message);
  return message;
}