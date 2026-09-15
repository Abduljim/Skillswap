import { prisma } from '../lib/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';
import { createNotification } from './notification.service';

async function assertParticipant(userId: string, exchangeId: string) {
  const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new NotFoundError('Exchange not found');
  if (exchange.userAId !== userId && exchange.userBId !== userId) {
    throw new ForbiddenError('Not a participant in this exchange');
  }
  return exchange;
}

export async function listUserExchanges(userId: string) {
  const exchanges = await prisma.exchange.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      userA: {
        select: { id: true, displayName: true, profile: { select: { avatarUrl: true } } },
      },
      userB: {
        select: { id: true, displayName: true, profile: { select: { avatarUrl: true } } },
      },
      _count: { select: { messages: true, sessions: true } },
    },
  });
  // Hydrate skill names
  const skillIds = Array.from(new Set(exchanges.flatMap((e) => [e.skillAId, e.skillBId])));
  const skills = await prisma.skill.findMany({
    where: { id: { in: skillIds } },
    select: { id: true, name: true, category: true },
  });
  const skillMap = new Map(skills.map((s) => [s.id, s]));

  return exchanges.map((e) => ({
    id: e.id,
    userA: e.userA,
    userB: e.userB,
    skillA: skillMap.get(e.skillAId),
    skillB: skillMap.get(e.skillBId),
    status: e.status,
    createdAt: e.createdAt,
    completedAt: e.completedAt,
    messageCount: e._count.messages,
    sessionCount: e._count.sessions,
  }));
}

export async function getExchange(userId: string, exchangeId: string) {
  const exchange = await assertParticipant(userId, exchangeId);

  const [userA, userB, skillA, skillB, sessions, messages, confirmations] = await Promise.all([
    prisma.user.findUnique({
      where: { id: exchange.userAId },
      select: { id: true, displayName: true, profile: { select: { avatarUrl: true, university: true } } },
    }),
    prisma.user.findUnique({
      where: { id: exchange.userBId },
      select: { id: true, displayName: true, profile: { select: { avatarUrl: true, university: true } } },
    }),
    prisma.skill.findUnique({ where: { id: exchange.skillAId } }),
    prisma.skill.findUnique({ where: { id: exchange.skillBId } }),
    prisma.session.findMany({ where: { exchangeId }, orderBy: { scheduledAt: 'asc' } }),
    prisma.message.count({ where: { exchangeId } }),
    prisma.exchangeCompletionConfirmation.findMany({
      where: { exchangeId },
      select: { userId: true },
    }),
  ]);

  return {
    ...exchange,
    userA,
    userB,
    skillA,
    skillB,
    sessions,
    messageCount: messages,
    completions: confirmations.map((c) => c.userId),
  };
}

export async function completeExchange(userId: string, exchangeId: string) {
  const exchange = await assertParticipant(userId, exchangeId);
  if (exchange.status !== 'ACTIVE') throw new BadRequestError('Exchange is not active');

  await prisma.exchangeCompletionConfirmation.upsert({
    where: { exchangeId_userId: { exchangeId, userId } },
    create: { exchangeId, userId },
    update: { confirmedAt: new Date() },
  });

  const confirmations = await prisma.exchangeCompletionConfirmation.findMany({
    where: { exchangeId },
  });

  if (confirmations.length === 2) {
    await prisma.exchange.update({
      where: { id: exchangeId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    // Notify both
    const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
    await createNotification({
      userId,
      type: 'EXCHANGE_COMPLETED',
      title: 'Exchange completed',
      body: 'Your exchange is now complete. You can leave a review.',
      payload: { exchangeId },
    });
    await createNotification({
      userId: otherUserId,
      type: 'EXCHANGE_COMPLETED',
      title: 'Exchange completed',
      body: 'Your exchange is now complete. You can leave a review.',
      payload: { exchangeId },
    });
  } else {
    // Notify the other party
    const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
    await createNotification({
      userId: otherUserId,
      type: 'EXCHANGE_COMPLETION_REQUESTED',
      title: 'Completion requested',
      body: 'Your exchange partner has requested to complete this exchange.',
      payload: { exchangeId },
    });
  }

  return getExchange(userId, exchangeId);
}

export async function cancelExchange(userId: string, exchangeId: string) {
  const exchange = await assertParticipant(userId, exchangeId);
  if (exchange.status !== 'ACTIVE') throw new BadRequestError('Exchange is not active');

  await prisma.exchange.update({
    where: { id: exchangeId },
    data: { status: 'CANCELLED' },
  });

  const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
  await createNotification({
    userId: otherUserId,
    type: 'EXCHANGE_CANCELLED',
    title: 'Exchange cancelled',
    body: 'Your exchange partner cancelled the exchange.',
    payload: { exchangeId },
  });

  return getExchange(userId, exchangeId);
}