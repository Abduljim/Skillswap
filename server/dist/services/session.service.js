"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSessions = listSessions;
exports.createSession = createSession;
exports.updateSession = updateSession;
exports.deleteSession = deleteSession;
exports.completeSession = completeSession;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
const notification_service_1 = require("./notification.service");
async function assertParticipant(userId, exchangeId) {
    const exchange = await prisma_1.prisma.exchange.findUnique({ where: { id: exchangeId } });
    if (!exchange)
        throw new errors_1.NotFoundError('Exchange not found');
    if (exchange.userAId !== userId && exchange.userBId !== userId) {
        throw new errors_1.ForbiddenError('Not a participant in this exchange');
    }
    return exchange;
}
async function listSessions(userId, exchangeId) {
    await assertParticipant(userId, exchangeId);
    return prisma_1.prisma.session.findMany({
        where: { exchangeId },
        orderBy: { scheduledAt: 'asc' },
    });
}
async function createSession(userId, exchangeId, input) {
    const exchange = await assertParticipant(userId, exchangeId);
    if (exchange.status !== 'ACTIVE')
        throw new errors_1.BadRequestError('Exchange is not active');
    const session = await prisma_1.prisma.session.create({
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
    await (0, notification_service_1.createNotification)({
        userId: otherUserId,
        type: 'SESSION_SCHEDULED',
        title: 'New session scheduled',
        body: `${input.title} on ${input.scheduledAt.toLocaleString()}`,
        payload: { exchangeId, sessionId: session.id },
    });
    return session;
}
async function updateSession(userId, sessionId, input) {
    const session = await prisma_1.prisma.session.findUnique({
        where: { id: sessionId },
        include: { exchange: true },
    });
    if (!session)
        throw new errors_1.NotFoundError('Session not found');
    if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
        throw new errors_1.ForbiddenError('Not a participant');
    }
    const data = { ...input };
    if (input.scheduledAt)
        data.scheduledAt = new Date(input.scheduledAt);
    const updated = await prisma_1.prisma.session.update({ where: { id: sessionId }, data });
    const otherUserId = session.exchange.userAId === userId ? session.exchange.userBId : session.exchange.userAId;
    await (0, notification_service_1.createNotification)({
        userId: otherUserId,
        type: 'SESSION_UPDATED',
        title: 'Session updated',
        body: `${updated.title} — ${updated.scheduledAt.toLocaleString()}`,
        payload: { exchangeId: session.exchangeId, sessionId },
    });
    return updated;
}
async function deleteSession(userId, sessionId) {
    const session = await prisma_1.prisma.session.findUnique({
        where: { id: sessionId },
        include: { exchange: true },
    });
    if (!session)
        throw new errors_1.NotFoundError('Session not found');
    if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
        throw new errors_1.ForbiddenError('Not a participant');
    }
    await prisma_1.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'CANCELLED' },
    });
    const otherUserId = session.exchange.userAId === userId ? session.exchange.userBId : session.exchange.userAId;
    await (0, notification_service_1.createNotification)({
        userId: otherUserId,
        type: 'SESSION_CANCELLED',
        title: 'Session cancelled',
        body: `${session.title} was cancelled.`,
        payload: { exchangeId: session.exchangeId, sessionId },
    });
    return { cancelled: true };
}
async function completeSession(userId, sessionId) {
    const session = await prisma_1.prisma.session.findUnique({
        where: { id: sessionId },
        include: { exchange: true },
    });
    if (!session)
        throw new errors_1.NotFoundError('Session not found');
    if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
        throw new errors_1.ForbiddenError('Not a participant');
    }
    const updated = await prisma_1.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED' },
    });
    return updated;
}
//# sourceMappingURL=session.service.js.map