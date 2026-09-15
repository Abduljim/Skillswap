import { prisma } from '../lib/prisma';
import { BadRequestError, NotFoundError } from '../utils/errors';

export async function reportUser(
  reporterId: string,
  input: { reportedUserId: string; reason: string; description: string }
) {
  if (reporterId === input.reportedUserId) {
    throw new BadRequestError('Cannot report yourself');
  }
  const exists = await prisma.user.findUnique({ where: { id: input.reportedUserId } });
  if (!exists) throw new NotFoundError('User not found');

  return prisma.report.create({
    data: {
      reporterId,
      reportedUserId: input.reportedUserId,
      reason: input.reason,
      description: input.description,
    },
  });
}

export async function blockUser(blockerId: string, blockedUserId: string) {
  if (blockerId === blockedUserId) {
    throw new BadRequestError('Cannot block yourself');
  }
  const exists = await prisma.user.findUnique({ where: { id: blockedUserId } });
  if (!exists) throw new NotFoundError('User not found');

  await prisma.block.upsert({
    where: { blockerId_blockedUserId: { blockerId, blockedUserId } },
    create: { blockerId, blockedUserId },
    update: {},
  });

  return { blocked: true };
}

export async function unblockUser(blockerId: string, blockedUserId: string) {
  await prisma.block.deleteMany({
    where: { blockerId, blockedUserId },
  });
  return { unblocked: true };
}