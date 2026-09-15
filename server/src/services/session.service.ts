import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors';
import { createNotification } from './notification.service';

async function assertParticipant(userId: string, exchangeId: string) {
  const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new NotFoundError('Exchange not found');
  if (exchange.userAId !== userId && exchange.userBId !== userId) {
    throw new ForbiddenError('Not a participant in this exchange');
  }
  return exchange;
}

export async function listSessions(userId: string, exchangeId: string) {
  await assertParticipant(userId, exchangeId);
  return prisma.session.findMany({
    where: { exchangeId },
    orderBy: { scheduledAt: 'asc' },
  });
}

export async function createSession(
  userId: string,
  exchangeId: string,
  input: {
    title: string;
    scheduledAt: Date;
    durationMinutes: number;
    format: 'ONLINE' | 'IN_PERSON';
    meetingLink?: string | null;
    location?: string | null;
    notes?: string | null;
  }
) {
  const exchange = await assertParticipant(userId, exchangeId);
  if (exchange.status !== 'ACTIVE') throw new BadRequestError('Exchange is not active');

  const session = await prisma.session.create({
    data: {
      exchangeId,
      title: input.title,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      format: input.format,
      meetingLink: input.meetingLink,
      location: input.location,
      notes: input.notes,
      status: 'SCHEDULED',
    },
  });

  const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
  await createNotification({
    userId: otherUserId,
    type: 'SESSION_SCHEDULED',
    title: 'New session scheduled',
    body: `${input.title} on ${input.scheduledAt.toLocaleString()}`,
    payload: { exchangeId, sessionId: session.id },
  });

  return session;
}

export async function updateSession(
  userId: string,
  sessionId: string,
  input: Partial<{
    title: string;
    scheduledAt: string;
    durationMinutes: number;
    format: 'ONLINE' | 'IN_PERSON';
    meetingLink: string | null;
    location: string | null;
    notes: string | null;
  }>
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { exchange: true },
  });
  if (!session) throw new NotFoundError('Session not found');
  if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
    throw new ForbiddenError('Not a participant');
  }

  const data: any = { ...input };
  if (input.scheduledAt) data.scheduledAt = new Date(input.scheduledAt);

  const updated = await prisma.session.update({ where: { id: sessionId }, data });

  const otherUserId =
    session.exchange.userAId === userId ? session.exchange.userBId : session.exchange.userAId;
  await createNotification({
    userId: otherUserId,
    type: 'SESSION_UPDATED',
    title: 'Session updated',
    body: `${updated.title} — ${updated.scheduledAt.toLocaleString()}`,
    payload: { exchangeId: session.exchangeId, sessionId },
  });

  return updated;
}

export async function deleteSession(userId: string, sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { exchange: true },
  });
  if (!session) throw new NotFoundError('Session not found');
  if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
    throw new ForbiddenError('Not a participant');
  }
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'CANCELLED' },
  });

  const otherUserId =
    session.exchange.userAId === userId ? session.exchange.userBId : session.exchange.userAId;
  await createNotification({
    userId: otherUserId,
    type: 'SESSION_CANCELLED',
    title: 'Session cancelled',
    body: `${session.title} was cancelled.`,
    payload: { exchangeId: session.exchangeId, sessionId },
  });

  return { cancelled: true };
}

export async function completeSession(userId: string, sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { exchange: true },
  });
  if (!session) throw new NotFoundError('Session not found');
  if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
    throw new ForbiddenError('Not a participant');
  }

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'COMPLETED' },
  });
  return updated;
}