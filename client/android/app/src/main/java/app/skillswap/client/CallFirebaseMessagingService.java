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
 * type=call_cancelled — the caller hung up, or the ring timed out, before this
 * device answered. The notification is FLAG_INSISTENT, so without this the phone
 * would keep ringing for a call that no longer exists; we cancel it and drop the
 * stored call.
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
            cancelRinging(data.get("exchangeId"));
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
            getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_EXCHANGE, exchangeId)
                    .putString(KEY_CALLER, callerName)
                    .putString(KEY_CALLER_ID, callerId)
                    .putBoolean(KEY_VIDEO, video)
                    .putLong(KEY_TS, System.currentTimeMillis())
                    // A new call must not inherit the previous tap's answer/decline.
                    .remove(KEY_ACTION)
                    .apply();
        }
        showIncomingCallNotification(exchangeId, callerName, video);
    }

    /** The call this notification is ringing for was cancelled — stop ringing. */
    private void cancelRinging(String exchangeId) {
        try {
            String stored = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(KEY_EXCHANGE, "");
            // An empty id means "cancel whatever is ringing"; otherwise only
            // cancel if it is still the same call, so a late cancel for an old
            // call cannot silence a new one.
            if (exchangeId == null || exchangeId.isEmpty() || exchangeId.equals(stored)) {
                NotificationManagerCompat.from(this).cancel(CallNotifier.CALL_NOTIFICATION_ID);
                NotificationManagerCompat.from(this).cancel(LEGACY_NOTIFICATION_ID);
                getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
            }
        } catch (Exception ignored) {
            // Nothing to cancel.
        }
    }

    private void showIncomingCallNotification(String exchangeId, String callerName, boolean video) {
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
                    .setContentText(video ? "Incoming video call…" : "Incoming call…")
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
