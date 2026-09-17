"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMessages = listMessages;
exports.listConversations = listConversations;
exports.createMessage = createMessage;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
const io_1 = require("../sockets/io");
async function assertActiveParticipant(userId, exchangeId) {
    const exchange = await prisma_1.prisma.exchange.findUnique({ where: { id: exchangeId } });
    if (!exchange)
        throw new errors_1.NotFoundError('Exchange not found');
    if (exchange.userAId !== userId && exchange.userBId !== userId) {
        throw new errors_1.ForbiddenError('Not a participant in this exchange');
    }
    if (exchange.status !== 'ACTIVE') {
        throw new errors_1.BadRequestError('Exchange is not active');
    }
    return exchange;
}
async function listMessages(userId, exchangeId) {
    await assertActiveParticipant(userId, exchangeId);
    const messages = await prisma_1.prisma.message.findMany({
        where: { exchangeId },
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { id: true, displayName: true } } },
    });
    // Their messages become "delivered" once the other side pulls the thread.
    // "Read" is set by the reader via the socket a moment later.
    const delivered = await prisma_1.prisma.message.updateMany({
        where: { exchangeId, senderId: { not: userId }, status: 'SENT' },
        data: { status: 'DELIVERED' },
    });
    if (delivered.count > 0)
        (0, io_1.emitToExchange)(exchangeId, 'message:delivered', { exchangeId });
    return messages;
}
async function listConversations(userId) {
    const exchanges = await prisma_1.prisma.exchange.findMany({
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
async function createMessage(userId, exchangeId, body, type = 'TEXT', caption) {
    const exchange = await assertActiveParticipant(userId, exchangeId);
    const message = await prisma_1.prisma.message.create({
        data: { exchangeId, senderId: userId, body, type: type, caption: caption ?? null },
        include: { sender: { select: { id: true, displayName: true } } },
    });
    (0, io_1.emitToExchange)(exchangeId, 'message:new', message);
    return message;
}
//# sourceMappingURL=message.service.js.map