import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, BadRequestError , HttpError} from '../utils/errors';
import { emitToExchange, isUserOnline } from '../sockets/io';
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
  return sanitizeViewOnce(messages, userId);
}

/**
 * Strip view-once media URLs from anything a recipient receives as a list.
 *
 * The recipient's only way to the bytes is POST .../messages/:id/view, which
 * stamps the message viewed exactly once. Handing the URL out in the thread
 * would let the bubble (or a curious devtools) fetch it without ever marking
 * it, and "view once" would be a label rather than a behaviour. The sender
 * keeps the URL: it is their file, and they also get mediaViewedAt so the
 * bubble can say whether it was opened.
 */
export function sanitizeConversations<T extends { lastMessage?: { viewOnce?: boolean; senderId: string; mediaUrl?: string | null; thumbUrl?: string | null } | null }>(
  rows: T[],
  userId: string
): T[] {
  return rows.map((row) => {
    const last = row.lastMessage;
    if (!last || !last.viewOnce || last.senderId === userId) return row;
    return { ...row, lastMessage: { ...last, mediaUrl: null, thumbUrl: null } };
  });
}

export function sanitizeViewOnce<T extends { viewOnce?: boolean; senderId: string; mediaUrl?: string | null; thumbUrl?: string | null }>(
  rows: T[],
  userId: string
): T[] {
  return rows.map((row) => {
    if (!row.viewOnce || row.senderId === userId) return row;
    return { ...row, mediaUrl: null, thumbUrl: null };
  });
}

/**
 * Hand out a view-once media URL exactly once, to the recipient, and stamp the
 * message viewed. Returns the URL; throws 410 afterwards.
 */
export async function viewOnceMedia(userId: string, exchangeId: string, messageId: string) {
  await assertActiveParticipant(userId, exchangeId);
  const message = await prisma.message.findFirst({
    where: { id: messageId, exchangeId },
  });
  if (!message) throw new HttpError(404, 'NOT_FOUND', 'That message does not exist.');
  if (!message.viewOnce) {
    // A normal media message: the list already carried the URL, but answering
    // here too keeps the client path single.
    return { url: message.mediaUrl, viewedAt: null };
  }
  if (message.senderId === userId) {
    return { url: message.mediaUrl, viewedAt: message.mediaViewedAt };
  }
  if (message.mediaViewedAt) {
    throw new HttpError(410, 'VIEW_ONCE_ALREADY_VIEWED', 'That photo or clip was view-once and has already been opened.');
  }
  const stamped = await prisma.message.update({
    where: { id: messageId },
    data: { mediaViewedAt: new Date(), mediaViewedBy: userId },
  });
  emitToExchange(exchangeId, 'message:viewed', { exchangeId, messageId });
  return { url: stamped.mediaUrl, viewedAt: stamped.mediaViewedAt };
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

  return sanitizeConversations(exchanges
    .map((ex) => {
      const partner = ex.userAId === userId ? ex.userB : ex.userA;
      return {
        exchangeId: ex.id,
        partner,
        // First-paint presence for the dot; live socket updates win over it.
        partnerOnline: isUserOnline(partner.id),
        lastMessage: ex.messages[0] ?? null,
        unreadCount: ex._count.messages,
        updatedAt: ex.messages[0]?.createdAt ?? ex.updatedAt,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), userId);
}


/** Pointers + metadata for a stored photo/video (see services/supabase.service). */
export interface MessageMedia {
  mediaUrl?: string | null;
  thumbUrl?: string | null;
  mediaBytes?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaDurationMs?: number | null;
  viewOnce?: boolean | null;
  mediaName?: string | null;
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
      viewOnce: media?.viewOnce ?? false,
      mediaName: media?.mediaName ?? null,
    },
    include: { sender: { select: { id: true, displayName: true } } },
  });
  // The room event must not carry a view-once URL either — the recipient's
  // only way to the bytes is the /view endpoint that stamps it opened. The
  // sender's bubble never renders view-once media, so it loses nothing.
  emitToExchange(
    exchangeId,
    'message:new',
    message.viewOnce ? { ...message, mediaUrl: null, thumbUrl: null } : message
  );
  return message;
}