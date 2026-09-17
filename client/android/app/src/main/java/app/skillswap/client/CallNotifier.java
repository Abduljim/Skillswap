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
            @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
            @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
            @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
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
        // Channel carries no default sound so each ring can use the user's
        // chosen ringtone/alarm/silent without recreating the channel.
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

    // Grants CAMERA + RECORD_AUDIO as real Android runtime permissions so the
    // WebView's getUserMedia always succeeds once the user accepts (WebView
    // getUserMedia prompts fail outside a gesture, so we prompt natively first).
    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        boolean prepared = hasPermission("camera") && hasPermission("microphone");
        if (prepared) {
            call.resolve();
            return;
        }
        // Request camera first; requestMediaCameraCallback then asks for the mic.
        if (!hasPermission("camera")) {
            requestPermissionForAlias("camera", call, "requestMediaCameraCallback");
        } else {
            requestPermissionForAlias("microphone", call, "requestMediaCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve();
    }

    @PermissionCallback
    private void requestMediaCameraCallback(PluginCall call) {
        if (hasPermission("microphone")) {
            call.resolve();
        } else {
            requestPermissionForAlias("microphone", call, "requestMediaCallback");
        }
    }

    @PermissionCallback
    private void requestMediaCallback(PluginCall call) {
        call.resolve();
    }

    private Uri soundFor(String source) {
        return CallSound.uri(getContext());
    }

    // Persist the user's Settings → Calls choice natively so incoming FCM push
    // rings use the same sound as in-app rings.
    @PluginMethod
    public void setSoundSource(PluginCall call) {
        String source = call.getString("source", "ringtone");
        CallSound.set(getContext(), source);
        call.resolve();
    }

    @PluginMethod
    public void ring(PluginCall call) {
        String peerName = call.getString("displayName", "Incoming call");
        String source = call.getString("soundSource", "ringtone");
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

                Uri sound = soundFor(source);
                if (sound != null) builder.setSound(sound);

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