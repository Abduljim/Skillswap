"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.listNotifications = listNotifications;
exports.markRead = markRead;
exports.markAllRead = markAllRead;
const prisma_1 = require("../lib/prisma");
async function createNotification(input) {
    return prisma_1.prisma.notification.create({
        data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body,
            payload: input.payload,
        },
    });
}
async function listNotifications(userId) {
    return prisma_1.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
}
async function markRead(userId, notificationId) {
    const notif = await prisma_1.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif || notif.userId !== userId)
        throw new Error('Notification not found');
    return prisma_1.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
    });
}
async function markAllRead(userId) {
    return prisma_1.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
    });
}
//# sourceMappingURL=notification.service.js.map