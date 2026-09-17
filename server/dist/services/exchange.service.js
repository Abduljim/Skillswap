"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCallLogs = listCallLogs;
exports.listUserExchanges = listUserExchanges;
exports.getExchange = getExchange;
exports.completeExchange = completeExchange;
exports.cancelExchange = cancelExchange;
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
async function listCallLogs(userId, exchangeId) {
    await assertParticipant(userId, exchangeId);
    const logs = await prisma_1.prisma.callLog.findMany({
        where: { exchangeId },
        orderBy: { createdAt: 'desc' },
        include: {
            exchange: {
                select: {
                    userA: { select: { id: true, displayName: true } },
                    userB: { select: { id: true, displayName: true } },
                },
            },
        },
    });
    return logs.map((l) => ({
        id: l.id,
        exchangeId: l.exchangeId,
        callerId: l.callerId,
        calleeId: l.calleeId,
        callerName: l.exchange.userA.id === l.callerId ? l.exchange.userA.displayName : l.exchange.userB.displayName,
        calleeName: l.exchange.userA.id === l.calleeId ? l.exchange.userA.displayName : l.exchange.userB.displayName,
        type: l.type,
        outcome: l.outcome,
        startedAt: l.startedAt,
        endedAt: l.endedAt,
        createdAt: l.createdAt,
    }));
}
async function listUserExchanges(userId) {
    const exchanges = await prisma_1.prisma.exchange.findMany({
        where: {
            OR: [{ userAId: userId }, { userBId: userId }],
        },
        orderBy: { updatedAt: 'desc' },
        include: {
            userA: {
                select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true } } },
            },
            userB: {
                select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true } } },
            },
            _count: { select: { messages: true, sessions: true } },
        },
    });
    // Hydrate skill names
    const skillIds = Array.from(new Set(exchanges.flatMap((e) => [e.skillAId, e.skillBId])));
    const skills = await prisma_1.prisma.skill.findMany({
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
async function getExchange(userId, exchangeId) {
    const exchange = await assertParticipant(userId, exchangeId);
    const [userA, userB, skillA, skillB, sessions, messages, confirmations] = await Promise.all([
        prisma_1.prisma.user.findUnique({
            where: { id: exchange.userAId },
            select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true, university: true } } },
        }),
        prisma_1.prisma.user.findUnique({
            where: { id: exchange.userBId },
            select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true, university: true } } },
        }),
        prisma_1.prisma.skill.findUnique({ where: { id: exchange.skillAId } }),
        prisma_1.prisma.skill.findUnique({ where: { id: exchange.skillBId } }),
        prisma_1.prisma.session.findMany({ where: { exchangeId }, orderBy: { scheduledAt: 'asc' } }),
        prisma_1.prisma.message.count({ where: { exchangeId } }),
        prisma_1.prisma.exchangeCompletionConfirmation.findMany({
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
async function completeExchange(userId, exchangeId) {
    const exchange = await assertParticipant(userId, exchangeId);
    if (exchange.status !== 'ACTIVE')
        throw new errors_1.BadRequestError('Exchange is not active');
    await prisma_1.prisma.exchangeCompletionConfirmation.upsert({
        where: { exchangeId_userId: { exchangeId, userId } },
        create: { exchangeId, userId },
        update: { confirmedAt: new Date() },
    });
    const confirmations = await prisma_1.prisma.exchangeCompletionConfirmation.findMany({
        where: { exchangeId },
    });
    if (confirmations.length === 2) {
        await prisma_1.prisma.exchange.update({
            where: { id: exchangeId },
            data: { status: 'COMPLETED', completedAt: new Date() },
        });
        // Notify both
        const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
        await (0, notification_service_1.createNotification)({
            userId,
            type: 'EXCHANGE_COMPLETED',
            title: 'Exchange completed',
            body: 'Your exchange is now complete. You can leave a review.',
            payload: { exchangeId },
        });
        await (0, notification_service_1.createNotification)({
            userId: otherUserId,
            type: 'EXCHANGE_COMPLETED',
            title: 'Exchange completed',
            body: 'Your exchange is now complete. You can leave a review.',
            payload: { exchangeId },
        });
    }
    else {
        // Notify the other party
        const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
        await (0, notification_service_1.createNotification)({
            userId: otherUserId,
            type: 'EXCHANGE_COMPLETION_REQUESTED',
            title: 'Completion requested',
            body: 'Your exchange partner has requested to complete this exchange.',
            payload: { exchangeId },
        });
    }
    return getExchange(userId, exchangeId);
}
async function cancelExchange(userId, exchangeId) {
    const exchange = await assertParticipant(userId, exchangeId);
    if (exchange.status !== 'ACTIVE')
        throw new errors_1.BadRequestError('Exchange is not active');
    await prisma_1.prisma.exchange.update({
        where: { id: exchangeId },
        data: { status: 'CANCELLED' },
    });
    const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
    await (0, notification_service_1.createNotification)({
        userId: otherUserId,
        type: 'EXCHANGE_CANCELLED',
        title: 'Exchange cancelled',
        body: 'Your exchange partner cancelled the exchange.',
        payload: { exchangeId },
    });
    return getExchange(userId, exchangeId);
}
//# sourceMappingURL=exchange.service.js.map