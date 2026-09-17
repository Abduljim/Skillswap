"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReview = createReview;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
const notification_service_1 = require("./notification.service");
async function createReview(reviewerId, exchangeId, input) {
    const exchange = await prisma_1.prisma.exchange.findUnique({ where: { id: exchangeId } });
    if (!exchange)
        throw new errors_1.NotFoundError('Exchange not found');
    if (exchange.userAId !== reviewerId && exchange.userBId !== reviewerId) {
        throw new errors_1.ForbiddenError('You did not participate in this exchange');
    }
    if (exchange.status !== 'COMPLETED') {
        throw new errors_1.BadRequestError('Reviews are only allowed on completed exchanges');
    }
    if (input.rating < 1 || input.rating > 5) {
        throw new errors_1.BadRequestError('Rating must be between 1 and 5');
    }
    const reviewedUserId = exchange.userAId === reviewerId ? exchange.userBId : exchange.userAId;
    const existing = await prisma_1.prisma.review.findUnique({
        where: { exchangeId_reviewerId: { exchangeId, reviewerId } },
    });
    if (existing)
        throw new errors_1.ConflictError('You have already reviewed this exchange');
    const review = await prisma_1.prisma.review.create({
        data: {
            exchangeId,
            reviewerId,
            reviewedUserId,
            rating: input.rating,
            comment: input.comment,
        },
    });
    await (0, notification_service_1.createNotification)({
        userId: reviewedUserId,
        type: 'NEW_REVIEW',
        title: 'New review',
        body: `You received a ${input.rating}-star review.`,
        payload: { exchangeId, reviewId: review.id, rating: input.rating },
    });
    return review;
}
//# sourceMappingURL=review.service.js.map