import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { createNotification } from './notification.service';
import { checkCanSendRequest } from './entitlements.service';

export async function createExchangeRequest(input: {
  senderId: string;
  receiverId: string;
  offeredSkillId: string;
  requestedSkillId: string;
  message: string;
}) {
  if (input.senderId === input.receiverId) {
    throw new BadRequestError('Cannot send a request to yourself');
  }

  // Freemium enforcement
  const limitCheck = await checkCanSendRequest(input.senderId);
  if (!limitCheck.allowed) {
    throw new ForbiddenError(limitCheck.reason || 'Limit reached');
  }

  const [receiver, sender] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.receiverId }, select: { id: true, isActive: true } }),
    prisma.user.findUnique({ where: { id: input.senderId }, select: { id: true, isActive: true } }),
  ]);

  if (!receiver || !receiver.isActive) throw new NotFoundError('Recipient not found');
  if (!sender || !sender.isActive) throw new BadRequestError('Your account is inactive');

  // Block check (either direction)
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: input.senderId, blockedUserId: input.receiverId },
        { blockerId: input.receiverId, blockedUserId: input.senderId },
      ],
    },
  });
  if (blocked) throw new ForbiddenError('You cannot send a request to this user');

  // Skill ownership checks
  const [senderTeaches, receiverTeaches] = await Promise.all([
    prisma.userSkill.findUnique({
      where: {
        userId_skillId_type: {
          userId: input.senderId,
          skillId: input.offeredSkillId,
          type: 'TEACH',
        },
      },
    }),
    prisma.userSkill.findUnique({
      where: {
        userId_skillId_type: {
          userId: input.receiverId,
          skillId: input.requestedSkillId,
          type: 'TEACH',
        },
      },
    }),
  ]);

  if (!senderTeaches) throw new BadRequestError('You do not teach the offered skill');
  if (!receiverTeaches) throw new BadRequestError('Recipient does not teach the requested skill');

  // Duplicate pending request?
  const dup = await prisma.exchangeRequest.findFirst({
    where: {
      senderId: input.senderId,
      receiverId: input.receiverId,
      offeredSkillId: input.offeredSkillId,
      requestedSkillId: input.requestedSkillId,
      status: 'PENDING',
    },
  });
  if (dup) throw new ConflictError('A pending request already exists');

  const created = await prisma.exchangeRequest.create({
    data: {
      senderId: input.senderId,
      receiverId: input.receiverId,
      offeredSkillId: input.offeredSkillId,
      requestedSkillId: input.requestedSkillId,
      message: input.message,
      status: 'PENDING',
    },
    include: {
      sender: { select: { id: true, displayName: true } },
      receiver: { select: { id: true, displayName: true } },
    },
  });

  await createNotification({
    userId: input.receiverId,
    type: 'EXCHANGE_REQUEST_RECEIVED',
    title: 'New exchange request',
    body: `${created.sender.displayName} wants to learn from you.`,
    payload: { requestId: created.id, senderId: input.senderId },
  });

  return created;
}

export async function listRequests(userId: string, type: 'sent' | 'received') {
  const where =
    type === 'sent'
      ? { senderId: userId }
      : { receiverId: userId };

  const requests = await prisma.exchangeRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { id: true, displayName: true, profile: { select: { avatarUrl: true, university: true } } } },
      receiver: { select: { id: true, displayName: true, profile: { select: { avatarUrl: true, university: true } } } },
      offeredSkill: { select: { id: true, name: true, category: true } },
      requestedSkill: { select: { id: true, name: true, category: true } },
    },
  });
  return requests;
}

export async function acceptRequest(userId: string, requestId: string) {
  const request = await prisma.exchangeRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Request not found');
  if (request.receiverId !== userId) throw new ForbiddenError('You cannot accept this request');
  if (request.status !== 'PENDING') throw new BadRequestError('Request is no longer pending');

  // Create exchange + accept request in one transaction
  const result = await prisma.$transaction(async (tx) => {
    // Avoid duplicate active exchange
    const existing = await tx.exchange.findFirst({
      where: {
        OR: [
          { userAId: request.senderId, userBId: request.receiverId, skillAId: request.offeredSkillId, skillBId: request.requestedSkillId, status: 'ACTIVE' },
          { userAId: request.receiverId, userBId: request.senderId, skillAId: request.requestedSkillId, skillBId: request.offeredSkillId, status: 'ACTIVE' },
        ],
      },
    });
    if (existing) throw new ConflictError('An active exchange already exists for this pair');

    const exchange = await tx.exchange.create({
      data: {
        requestId: request.id,
        userAId: request.senderId,
        userBId: request.receiverId,
        skillAId: request.offeredSkillId,
        skillBId: request.requestedSkillId,
        status: 'ACTIVE',
      },
    });
    await tx.exchangeRequest.update({
      where: { id: request.id },
      data: { status: 'ACCEPTED' },
    });
    return exchange;
  });

  await createNotification({
    userId: request.senderId,
    type: 'EXCHANGE_REQUEST_ACCEPTED',
    title: 'Request accepted',
    body: 'Your exchange request was accepted. You can now chat and schedule sessions.',
    payload: { exchangeId: result.id },
  });

  return result;
}

export async function rejectRequest(userId: string, requestId: string) {
  const request = await prisma.exchangeRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Request not found');
  if (request.receiverId !== userId) throw new ForbiddenError('You cannot reject this request');
  if (request.status !== 'PENDING') throw new BadRequestError('Request is no longer pending');

  const updated = await prisma.exchangeRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED' },
  });

  await createNotification({
    userId: request.senderId,
    type: 'EXCHANGE_REQUEST_REJECTED',
    title: 'Request declined',
    body: 'Your exchange request was declined.',
    payload: { requestId: request.id },
  });

  return updated;
}

export async function cancelRequest(userId: string, requestId: string) {
  const request = await prisma.exchangeRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Request not found');
  if (request.senderId !== userId) throw new ForbiddenError('You cannot cancel this request');
  if (request.status !== 'PENDING') throw new BadRequestError('Request is no longer pending');

  return prisma.exchangeRequest.update({
    where: { id: request.id },
    data: { status: 'CANCELLED' },
  });
}