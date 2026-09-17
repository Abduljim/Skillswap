import { prisma } from '../lib/prisma';
import { env } from '../config/env';

interface IncomingCallPush {
  exchangeId: string;
  video: boolean;
  caller: { id: string; displayName: string; avatarUrl?: string | null };
}

/**
 * Push an incoming-call alert to the callee's Android device(s) via Firebase
 * Cloud Messaging. This is what rings even when the app is fully closed. The
 * socket layer calls this when the callee has no live socket connection.
 */
export async function sendIncomingCallPush(targetUserId: string, data: IncomingCallPush): Promise<{ sent: number; skipped: boolean }> {
  if (!env.FCM_SERVER_KEY) return { sent: 0, skipped: true };

  let tokens: string[] = [];
  try {
    const rows = await prisma.pushToken.findMany({
      where: { userId: targetUserId },
      select: { token: true },
    });
    tokens = rows.map((r) => r.token).filter(Boolean);
  } catch (e) {
    console.error('[push] token lookup failed', e);
    return { sent: 0, skipped: false };
  }
  if (!tokens.length) return { sent: 0, skipped: false };

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
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${env.FCM_SERVER_KEY}`,
        },
        body: JSON.stringify({
          to: token,
          priority: 'high',
          data: fcmData,
        }),
      });
      if (res.ok) sent += 1;
      else if (res.status === 404) {
        // Devicetoken expired — drop it so we stop pushing to a dead device.
        await prisma.pushToken.deleteMany({ where: { token } });
      }
    } catch (e) {
      console.error('[push] send failed', e);
    }
  }
  return { sent, skipped: false };
}