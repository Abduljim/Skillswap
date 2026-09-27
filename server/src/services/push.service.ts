import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { sendFcmV1, fcmV1Configured } from './fcm.service';

interface IncomingCallPush {
  exchangeId: string;
  video: boolean;
  caller: { id: string; displayName: string; avatarUrl?: string | null };
}

/**
 * Deliver an FCM data payload to every device registered to a user.
 *
 * Prefers the Firebase HTTP v1 API (service account); falls back to the legacy
 * server-key API if only FCM_SERVER_KEY is configured. Dead tokens are dropped
 * on the way so we stop pushing to a device that uninstalled or re-registered.
 */
async function pushToUser(
  targetUserId: string,
  fcmData: Record<string, string>
): Promise<{ sent: number; skipped: boolean }> {
  const useV1 = fcmV1Configured();
  if (!useV1 && !env.FCM_SERVER_KEY) return { sent: 0, skipped: true };

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

  let sent = 0;
  for (const token of tokens) {
    if (useV1) {
      const result = await sendFcmV1(token, fcmData);
      if (result === 'ok') sent += 1;
      else if (result === 'invalid') {
        // Dead device token — drop it so we stop pushing to it.
        await prisma.pushToken.deleteMany({ where: { token } });
      }
      continue;
    }
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
        // Device token expired — drop it so we stop pushing to a dead device.
        await prisma.pushToken.deleteMany({ where: { token } });
      }
    } catch (e) {
      console.error('[push] send failed', e);
    }
  }
  return { sent, skipped: false };
}

/**
 * Push an incoming-call alert to the callee's Android device(s) via Firebase
 * Cloud Messaging. This is what rings when the app cannot show the call itself —
 * fully closed, or alive in the background. The socket layer calls it whenever
 * the callee is not present (see calleeIsPresent in sockets/io.ts), not only
 * when they have no socket at all.
 */
export async function sendIncomingCallPush(
  targetUserId: string,
  data: IncomingCallPush
): Promise<{ sent: number; skipped: boolean }> {
  return pushToUser(targetUserId, {
    type: 'call_incoming',
    exchangeId: String(data.exchangeId),
    video: data.video ? '1' : '0',
    callerId: data.caller.id,
    callerName: data.caller.displayName,
    avatarUrl: data.caller.avatarUrl ?? '',
  });
}

/**
 * Tell a device to stop ringing: the caller hung up, or nobody answered within
 * the ring timeout, before this callee picked up.
 *
 * The incoming-call notification is insistent — it repeats its sound until it is
 * dismissed — and a closed app has no socket to receive `call:ended` on, so
 * without this the phone keeps ringing for a call that no longer exists.
 */
export async function sendCallCancelledPush(
  targetUserId: string,
  exchangeId: string
): Promise<{ sent: number; skipped: boolean }> {
  return pushToUser(targetUserId, {
    type: 'call_cancelled',
    exchangeId: String(exchangeId),
  });
}
