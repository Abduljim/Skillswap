package app.skillswap.client;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Native incoming-call notification + ringtone. The WebView JS asks us to ring
 * when a socket "call:ringing" arrives and to stop the ring the moment the call
 * is accepted, declined, or ended. Ringing keeps playing (FLAG_INSISTENT) until
 * the JS side stops it, like a WhatsApp call.
 */
@CapacitorPlugin(
        name = "CallNotifier",
        permissions = {
            @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
        })
public class CallNotifier extends Plugin {
    private static final String CHANNEL_ID = "calls";
    private static final int CALL_NOTIFICATION_ID = 9001;

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getActivity().getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ringtone != null) channel.setSound(ringtone, null);
        channel.setDescription("Incoming call ringtone");
        channel.enableVibration(true);
        nm.createNotificationChannel(channel);
    }

    private boolean notificationsAllowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || hasPermission("notifications");
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve();
            return;
        }
        if (hasPermission("notifications")) {
            call.resolve();
        } else {
            requestPermissionForAlias("notifications", call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void ring(PluginCall call) {
        String peerName = call.getString("displayName", "Incoming call");
        if (!notificationsAllowed()) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                ensureChannel();
                Intent intent = new Intent(getContext(), MainActivity.class);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
                PendingIntent showFullScreen = PendingIntent.getActivity(getContext(), 0, intent, flags);

                NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(peerName)
                        .setContentText("Incoming call…")
                        .setCategory(NotificationCompat.CATEGORY_CALL)
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setOngoing(true)
                        .setFullScreenIntent(showFullScreen, true)
                        .setContentIntent(showFullScreen)
                        .setAutoCancel(false)
                        .setOnlyAlertOnce(false)
                        .setVibrate(new long[] { 0, 700, 400, 700 });

                Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                if (ringtone != null) builder.setSound(ringtone);

                Notification notification = builder.build();
                notification.flags |= Notification.FLAG_INSISTENT;

                NotificationManagerCompat.from(getContext()).notify(CALL_NOTIFICATION_ID, notification);
            } catch (Exception e) {
                // Permission revoked mid-call or device policy; Web Audio tone still rings.
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            NotificationManagerCompat.from(getContext()).cancel(CALL_NOTIFICATION_ID);
        } catch (Exception e) {
            // Ignored
        }
        call.resolve();
    }
}