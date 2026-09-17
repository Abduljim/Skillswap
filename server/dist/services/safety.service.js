"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportUser = reportUser;
exports.blockUser = blockUser;
exports.unblockUser = unblockUser;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
async function reportUser(reporterId, input) {
    if (reporterId === input.reportedUserId) {
        throw new errors_1.BadRequestError('Cannot report yourself');
    }
    const exists = await prisma_1.prisma.user.findUnique({ where: { id: input.reportedUserId } });
    if (!exists)
        throw new errors_1.NotFoundError('User not found');
    return prisma_1.prisma.report.create({
        data: {
            reporterId,
            reportedUserId: input.reportedUserId,
            reason: input.reason,
            description: input.description,
        },
    });
}
async function blockUser(blockerId, blockedUserId) {
    if (blockerId === blockedUserId) {
        throw new errors_1.BadRequestError('Cannot block yourself');
    }
    const exists = await prisma_1.prisma.user.findUnique({ where: { id: blockedUserId } });
    if (!exists)
        throw new errors_1.NotFoundError('User not found');
    await prisma_1.prisma.block.upsert({
        where: { blockerId_blockedUserId: { blockerId, blockedUserId } },
        create: { blockerId, blockedUserId },
        update: {},
    });
    return { blocked: true };
}
async function unblockUser(blockerId, blockedUserId) {
    await prisma_1.prisma.block.deleteMany({
        where: { blockerId, blockedUserId },
    });
    return { unblocked: true };
}
//# sourceMappingURL=safety.service.js.map