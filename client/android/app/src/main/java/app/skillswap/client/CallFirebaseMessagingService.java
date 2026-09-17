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
 * Receives FCM data messages from the SkillSwap server. When another user calls
 * and this device has the app closed, the server sends a data message with
 * type=call_incoming; we show a full-screen "X is calling you" notification
 * with the user's chosen sound (ringtone/alarm/silent from Settings → Calls).
 * Tapping it opens the app, which picks up the stored call via PushPlugin.
 */
public class CallFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "calls";
    private static final int CALL_NOTIFICATION_ID = 9002;
    private static final String PREFS = "call_state";
    private static final String KEY_EXCHANGE = "exchange_id";
    private static final String KEY_CALLER = "caller_name";
    private static final String KEY_VIDEO = "video";
    private static final String KEY_TS = "ts";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data == null || !"call_incoming".equals(data.get("type"))) {
            super.onMessageReceived(remoteMessage);
            return;
        }
        String exchangeId = data.get("exchangeId") != null ? data.get("exchangeId") : "";
        String callerName = data.get("callerName") != null ? data.get("callerName") : "Someone";
        boolean video = "1".equals(data.get("video"));

        if (!exchangeId.isEmpty()) {
            getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_EXCHANGE, exchangeId)
                    .putString(KEY_CALLER, callerName)
                    .putBoolean(KEY_VIDEO, video)
                    .putLong(KEY_TS, System.currentTimeMillis())
                    .apply();
        }
        showIncomingCallNotification(exchangeId, callerName);
    }

    private void showIncomingCallNotification(String exchangeId, String callerName) {
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

            Intent intent = new Intent(this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent openApp = PendingIntent.getActivity(this, 1, intent, flags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(callerName)
                    .setContentText("Incoming call…")
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setOngoing(true)
                    .setFullScreenIntent(openApp, true)
                    .setContentIntent(openApp)
                    .setAutoCancel(false)
                    .setVibrate(new long[] { 0, 700, 400, 700 });

            Uri sound = CallSound.uri(this);
            if (sound != null) builder.setSound(sound);

            Notification notification = builder.build();
            notification.flags |= Notification.FLAG_INSISTENT;
            NotificationManagerCompat.from(this).notify(CALL_NOTIFICATION_ID, notification);
        } catch (Exception e) {
            // Ignored — e.g. permission revoked or device policy.
        }
    }

    @Override
    public void onNewToken(String token) {
        // Nothing needed here: the app re-registers its token on the next open,
        // and the server drops dead tokens automatically (404 → deleted).
        super.onNewToken(token);
    }
}