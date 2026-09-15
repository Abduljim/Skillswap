import { prisma } from '../lib/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { createNotification } from './notification.service';

export async function createReview(
  reviewerId: string,
  exchangeId: string,
  input: { rating: number; comment?: string | null }
) {
  const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new NotFoundError('Exchange not found');
  if (exchange.userAId !== reviewerId && exchange.userBId !== reviewerId) {
    throw new ForbiddenError('You did not participate in this exchange');
  }
  if (exchange.status !== 'COMPLETED') {
    throw new BadRequestError('Reviews are only allowed on completed exchanges');
  }
  if (input.rating < 1 || input.rating > 5) {
    throw new BadRequestError('Rating must be between 1 and 5');
  }

  const reviewedUserId =
    exchange.userAId === reviewerId ? exchange.userBId : exchange.userAId;

  const existing = await prisma.review.findUnique({
    where: { exchangeId_reviewerId: { exchangeId, reviewerId } },
  });
  if (existing) throw new ConflictError('You have already reviewed this exchange');

  const review = await prisma.review.create({
    data: {
      exchangeId,
      reviewerId,
      reviewedUserId,
      rating: input.rating,
      comment: input.comment,
    },
  });

  await createNotification({
    userId: reviewedUserId,
    type: 'NEW_REVIEW',
    title: 'New review',
    body: `You received a ${input.rating}-star review.`,
    payload: { exchangeId, reviewId: review.id, rating: input.rating },
  });

  return review;
}