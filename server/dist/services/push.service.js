"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendIncomingCallPush = sendIncomingCallPush;
const prisma_1 = require("../lib/prisma");
const env_1 = require("../config/env");
const fcm_service_1 = require("./fcm.service");
/**
 * Push an incoming-call alert to the callee's Android device(s) via Firebase
 * Cloud Messaging. This is what rings even when the app is fully closed. The
 * socket layer calls this when the callee has no live socket connection.
 * Prefers the Firebase HTTP v1 API (service account); falls back to the legacy
 * server-key API if only FCM_SERVER_KEY is configured.
 */
async function sendIncomingCallPush(targetUserId, data) {
    const useV1 = (0, fcm_service_1.fcmV1Configured)();
    if (!useV1 && !env_1.env.FCM_SERVER_KEY)
        return { sent: 0, skipped: true };
    let tokens = [];
    try {
        const rows = await prisma_1.prisma.pushToken.findMany({
            where: { userId: targetUserId },
            select: { token: true },
        });
        tokens = rows.map((r) => r.token).filter(Boolean);
    }
    catch (e) {
        console.error('[push] token lookup failed', e);
        return { sent: 0, skipped: false };
    }
    if (!tokens.length)
        return { sent: 0, skipped: false };
    const fcmData = {
        type: 'call_incoming',
        exchangeId: String(data.exchangeId),
        video: data.video ? '1' : '0',
        callerId: data.caller.id,
        callerName: data.caller.displayName,
        avatarUrl: data.caller.avatarUrl ?? '',
    };
    let sent = 0;
    for (const token of tokens) {
        if (useV1) {
            const result = await (0, fcm_service_1.sendFcmV1)(token, fcmData);
            if (result === 'ok')
                sent += 1;
            else if (result === 'invalid') {
                // Dead device token — drop it so we stop pushing to it.
                await prisma_1.prisma.pushToken.deleteMany({ where: { token } });
            }
            continue;
        }
        try {
            const res = await fetch('https://fcm.googleapis.com/fcm/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `key=${env_1.env.FCM_SERVER_KEY}`,
                },
                body: JSON.stringify({
                    to: token,
                    priority: 'high',
                    data: fcmData,
                }),
            });
            if (res.ok)
                sent += 1;
            else if (res.status === 404) {
                // Device token expired — drop it so we stop pushing to a dead device.
                await prisma_1.prisma.pushToken.deleteMany({ where: { token } });
            }
        }
        catch (e) {
            console.error('[push] send failed', e);
        }
    }
    return { sent, skipped: false };
}
//# sourceMappingURL=push.service.js.map