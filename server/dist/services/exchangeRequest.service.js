"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExchangeRequest = createExchangeRequest;
exports.listRequests = listRequests;
exports.acceptRequest = acceptRequest;
exports.rejectRequest = rejectRequest;
exports.cancelRequest = cancelRequest;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
const notification_service_1 = require("./notification.service");
const entitlements_service_1 = require("./entitlements.service");
async function createExchangeRequest(input) {
    if (input.senderId === input.receiverId) {
        throw new errors_1.BadRequestError('Cannot send a request to yourself');
    }
    // Freemium enforcement
    const limitCheck = await (0, entitlements_service_1.checkCanSendRequest)(input.senderId);
    if (!limitCheck.allowed) {
        throw new errors_1.ForbiddenError(limitCheck.reason || 'Limit reached');
    }
    const [receiver, sender] = await Promise.all([
        prisma_1.prisma.user.findUnique({ where: { id: input.receiverId }, select: { id: true, isActive: true } }),
        prisma_1.prisma.user.findUnique({ where: { id: input.senderId }, select: { id: true, isActive: true } }),
    ]);
    if (!receiver || !receiver.isActive)
        throw new errors_1.NotFoundError('Recipient not found');
    if (!sender || !sender.isActive)
        throw new errors_1.BadRequestError('Your account is inactive');
    // Block check (either direction)
    const blocked = await prisma_1.prisma.block.findFirst({
        where: {
            OR: [
                { blockerId: input.senderId, blockedUserId: input.receiverId },
                { blockerId: input.receiverId, blockedUserId: input.senderId },
            ],
        },
    });
    if (blocked)
        throw new errors_1.ForbiddenError('You cannot send a request to this user');
    // Skill ownership checks
    const [senderTeaches, receiverTeaches] = await Promise.all([
        prisma_1.prisma.userSkill.findUnique({
            where: {
                userId_skillId_type: {
                    userId: input.senderId,
                    skillId: input.offeredSkillId,
                    type: 'TEACH',
                },
            },
        }),
        prisma_1.prisma.userSkill.findUnique({
            where: {
                userId_skillId_type: {
                    userId: input.receiverId,
                    skillId: input.requestedSkillId,
                    type: 'TEACH',
                },
            },
        }),
    ]);
    if (!senderTeaches)
        throw new errors_1.BadRequestError('You do not teach the offered skill');
    if (!receiverTeaches)
        throw new errors_1.BadRequestError('Recipient does not teach the requested skill');
    // Duplicate pending request?
    const dup = await prisma_1.prisma.exchangeRequest.findFirst({
        where: {
            senderId: input.senderId,
            receiverId: input.receiverId,
            offeredSkillId: input.offeredSkillId,
            requestedSkillId: input.requestedSkillId,
            status: 'PENDING',
        },
    });
    if (dup)
        throw new errors_1.ConflictError('A pending request already exists');
    const created = await prisma_1.prisma.exchangeRequest.create({
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
    await (0, notification_service_1.createNotification)({
        userId: input.receiverId,
        type: 'EXCHANGE_REQUEST_RECEIVED',
        title: 'New exchange request',
        body: `${created.sender.displayName} wants to learn from you.`,
        payload: { requestId: created.id, senderId: input.senderId },
    });
    return created;
}
async function listRequests(userId, type) {
    const where = type === 'sent'
        ? { senderId: userId }
        : { receiverId: userId };
    const requests = await prisma_1.prisma.exchangeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            sender: { select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true, university: true } } } },
            receiver: { select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true, university: true } } } },
            offeredSkill: { select: { id: true, name: true, category: true } },
            requestedSkill: { select: { id: true, name: true, category: true } },
        },
    });
    return requests;
}
async function acceptRequest(userId, requestId) {
    const request = await prisma_1.prisma.exchangeRequest.findUnique({ where: { id: requestId } });
    if (!request)
        throw new errors_1.NotFoundError('Request not found');
    if (request.receiverId !== userId)
        throw new errors_1.ForbiddenError('You cannot accept this request');
    if (request.status !== 'PENDING')
        throw new errors_1.BadRequestError('Request is no longer pending');
    // Create exchange + accept request in one transaction
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        // Avoid duplicate active exchange
        const existing = await tx.exchange.findFirst({
            where: {
                OR: [
                    { userAId: request.senderId, userBId: request.receiverId, skillAId: request.offeredSkillId, skillBId: request.requestedSkillId, status: 'ACTIVE' },
                    { userAId: request.receiverId, userBId: request.senderId, skillAId: request.requestedSkillId, skillBId: request.offeredSkillId, status: 'ACTIVE' },
                ],
            },
        });
        if (existing)
            throw new errors_1.ConflictError('An active exchange already exists for this pair');
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
    await (0, notification_service_1.createNotification)({
        userId: request.senderId,
        type: 'EXCHANGE_REQUEST_ACCEPTED',
        title: 'Request accepted',
        body: 'Your exchange request was accepted. You can now chat and schedule sessions.',
        payload: { exchangeId: result.id },
    });
    return result;
}
async function rejectRequest(userId, requestId) {
    const request = await prisma_1.prisma.exchangeRequest.findUnique({ where: { id: requestId } });
    if (!request)
        throw new errors_1.NotFoundError('Request not found');
    if (request.receiverId !== userId)
        throw new errors_1.ForbiddenError('You cannot reject this request');
    if (request.status !== 'PENDING')
        throw new errors_1.BadRequestError('Request is no longer pending');
    const updated = await prisma_1.prisma.exchangeRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED' },
    });
    await (0, notification_service_1.createNotification)({
        userId: request.senderId,
        type: 'EXCHANGE_REQUEST_REJECTED',
        title: 'Request declined',
        body: 'Your exchange request was declined.',
        payload: { requestId: request.id },
    });
    return updated;
}
async function cancelRequest(userId, requestId) {
    const request = await prisma_1.prisma.exchangeRequest.findUnique({ where: { id: requestId } });
    if (!request)
        throw new errors_1.NotFoundError('Request not found');
    if (request.senderId !== userId)
        throw new errors_1.ForbiddenError('You cannot cancel this request');
    if (request.status !== 'PENDING')
        throw new errors_1.BadRequestError('Request is no longer pending');
    return prisma_1.prisma.exchangeRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED' },
    });
}
//# sourceMappingURL=exchangeRequest.service.js.map