package app.skillswap.client;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Receives FCM data messages from the SkillSwap server.
 *
 * type=call_incoming — another user is calling and this device is not showing
 * the app (closed, or alive in the background: the server pushes whenever the
 * callee is not in the foreground, not only when the socket is gone). We show a
 * full-screen "X is calling you" notification with Answer / Decline actions and
 * the ringtone chosen in Settings → Calls (high / soothe / silent).
 *
 * type=group_call_incoming — the same, for a group call the user was invited
 * to. Group invites used to travel over sockets only, so an invitee with the
 * app closed never heard anything while the host waited on them.
 *
 * type=call_cancelled / group_call_cancelled — the call ended before this device
 * answered (caller hung up, ring timed out, or the group host left). The
 * notification is FLAG_INSISTENT, so without this the phone would keep ringing
 * for a call that no longer exists; we cancel it and drop the stored call.
 *
 * Tapping the notification — or Answer — opens the app, which picks the call up
 * through Push.getLaunchedCall(). Answer and Decline also record the choice,
 * read back with Push.getLaunchAction(), so the web layer can accept or decline
 * over its socket; see CallActionReceiver for why the receiver cannot do that
 * itself.
 *
 * The notification id is shared with CallNotifier on purpose. Whichever path
 * posts — this service with the app closed, CallNotifier.ring() with it open —
 * replaces the other instead of stacking a second ringing notification, and
 * CallNotifier.stop() silences both.
 */
public class CallFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "calls";

    /**
     * Id this service used before it shared CallNotifier's. Still cancelled so a
     * device upgrading from that build does not keep an old ring alive.
     */
    static final int LEGACY_NOTIFICATION_ID = 9002;

    /** Must match the keys PushPlugin reads. */
    private static final String PREFS = "call_state";
    private static final String KEY_EXCHANGE = "exchange_id";
    private static final String KEY_CALLER = "caller_name";
    private static final String KEY_CALLER_ID = "caller_id";
    private static final String KEY_VIDEO = "video";
    private static final String KEY_TS = "ts";
    private static final String KEY_ACTION = "action";
    /** "direct" (1:1) or "group": a cancel must not silence the other kind. */
    private static final String KEY_KIND = "kind";
    private static final String KEY_GROUP = "group_id";
    private static final String KEY_MEMBER_COUNT = "member_count";

    /**
     * Backstop in case a cancel push never arrives (offline, token rotated).
     * Deliberately longer than the server's ring timeout so the server's
     * call_cancelled normally wins and the notification dies with the call.
     */
    private static final long RING_TIMEOUT_MS = 60_000L;

    private static final int REQ_OPEN = 1;
    private static final int REQ_ANSWER = 2;
    private static final int REQ_DECLINE = 3;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data == null ? null : data.get("type");
        if (data == null || type == null) {
            super.onMessageReceived(remoteMessage);
            return;
        }

        if ("call_cancelled".equals(type)) {
            cancelRinging("direct", data.get("exchangeId"), KEY_EXCHANGE);
            return;
        }
        if ("group_call_cancelled".equals(type)) {
            cancelRinging("group", data.get("groupId"), KEY_GROUP);
            return;
        }
        if ("group_call_incoming".equals(type)) {
            String groupId = data.get("groupId") != null ? data.get("groupId") : "";
            String hostName = data.get("hostName") != null ? data.get("hostName") : "Someone";
            String hostId = data.get("hostId") != null ? data.get("hostId") : "";
            int memberCount = parseInt(data.get("memberCount"), 0);
            if (groupId.isEmpty()) return;
            // The host plays the part the caller plays in a 1:1 call, so the
            // launch state reuses those keys and the web layer reads one shape.
            storeCall("group", KEY_GROUP, groupId, hostName, hostId,
                    "1".equals(data.get("video")), memberCount);
            showIncomingCallNotification(hostName,
                    groupText(memberCount, "1".equals(data.get("video"))), groupId);
            return;
        }
        if (!"call_incoming".equals(type)) {
            super.onMessageReceived(remoteMessage);
            return;
        }

        String exchangeId = data.get("exchangeId") != null ? data.get("exchangeId") : "";
        String callerName = data.get("callerName") != null ? data.get("callerName") : "Someone";
        String callerId = data.get("callerId") != null ? data.get("callerId") : "";
        boolean video = "1".equals(data.get("video"));

        if (!exchangeId.isEmpty()) {
            storeCall("direct", KEY_EXCHANGE, exchangeId, callerName, callerId, video, 2);
        }
        showIncomingCallNotification(callerName,
                video ? "Incoming video call…" : "Incoming call…", exchangeId);
    }

    /**
     * The call this notification is ringing for was cancelled — stop ringing.
     *
     * Matched on kind as well as id, so a late cancel for an old group call
     * cannot silence a 1:1 ring that arrived after it (or the other way round).
     * An empty id means "cancel whatever of this kind is ringing".
     */
    private void cancelRinging(String kind, String id, String idKey) {
        try {
            android.content.SharedPreferences prefs =
                    getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (!kind.equals(prefs.getString(KEY_KIND, "direct"))) return;
            String stored = prefs.getString(idKey, "");
            if (id != null && !id.isEmpty() && !id.equals(stored)) return;
            NotificationManagerCompat.from(this).cancel(CallNotifier.CALL_NOTIFICATION_ID);
            NotificationManagerCompat.from(this).cancel(LEGACY_NOTIFICATION_ID);
            prefs.edit().clear().apply();
        } catch (Exception ignored) {
            // Nothing to cancel.
        }
    }

    /** Records what the app should join when the user opens it. */
    private void storeCall(String kind, String idKey, String id, String name, String nameId,
                           boolean video, int memberCount) {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_KIND, kind)
                .putString(idKey, id)
                .putString(KEY_CALLER, name)
                .putString(KEY_CALLER_ID, nameId)
                .putBoolean(KEY_VIDEO, video)
                .putInt(KEY_MEMBER_COUNT, memberCount)
                .putLong(KEY_TS, System.currentTimeMillis())
                // A new call must not inherit the previous tap's answer/decline.
                .remove(KEY_ACTION)
                .apply();
    }

    private static String groupText(int memberCount, boolean video) {
        String people = memberCount + (memberCount == 1 ? " person" : " people");
        return (video ? "Group video call · " : "Group call · ") + people;
    }

    private static int parseInt(String raw, int fallback) {
        if (raw == null) return fallback;
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private void showIncomingCallNotification(String callerName, String text, String exchangeId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getApplicationContext().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) {
                    NotificationChannel channel = new NotificationChannel(
                            CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
                    channel.setDescription("Incoming call ringtone");
                    channel.enableVibration(true);
                    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    nm.createNotificationChannel(channel);
                }
            }

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;

            Intent open = new Intent(this, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent openApp = PendingIntent.getActivity(this, REQ_OPEN, open, flags);

            PendingIntent answer = PendingIntent.getBroadcast(this, REQ_ANSWER,
                    actionIntent(CallActionReceiver.ACTION_ANSWER, exchangeId), flags);
            PendingIntent decline = PendingIntent.getBroadcast(this, REQ_DECLINE,
                    actionIntent(CallActionReceiver.ACTION_DECLINE, exchangeId), flags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(callerName)
                    .setContentText(text)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setOngoing(true)
                    .setFullScreenIntent(openApp, true)
                    .setContentIntent(openApp)
                    .setAutoCancel(false)
                    .setTimeoutAfter(RING_TIMEOUT_MS)
                    .addAction(0, "Answer", answer)
                    .addAction(0, "Decline", decline)
                    .setVibrate(new long[] { 0, 700, 400, 700 });

            Uri sound = CallSound.uri(this);
            if (sound != null) builder.setSound(sound);

            Notification notification = builder.build();
            // Ring until answered, declined, cancelled or timed out.
            notification.flags |= Notification.FLAG_INSISTENT;
            NotificationManagerCompat.from(this)
                    .notify(CallNotifier.CALL_NOTIFICATION_ID, notification);
            NotificationManagerCompat.from(this).cancel(LEGACY_NOTIFICATION_ID);
        } catch (Exception e) {
            // Ignored — e.g. permission revoked or device policy.
        }
    }

    private Intent actionIntent(String action, String exchangeId) {
        Intent intent = new Intent(this, CallActionReceiver.class);
        intent.setAction(action);
        intent.putExtra("exchangeId", exchangeId == null ? "" : exchangeId);
        return intent;
    }

    @Override
    public void onNewToken(String token) {
        // Nothing needed here: the app re-registers its token on the next open,
        // and the server drops dead tokens automatically (404 → deleted).
        super.onNewToken(token);
    }
}
