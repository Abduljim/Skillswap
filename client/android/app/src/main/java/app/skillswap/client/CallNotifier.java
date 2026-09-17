package app.skillswap.client;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
    private static final String PREFS = "skillswap_prefs";
    private static final String KEY_FSI_PROMPTED = "fsi_prompted";

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getActivity().getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        // Channel carries no default sound so each ring can use the user's
        // chosen ringtone/chime/alarm/silent without recreating the channel.
        channel.setDescription("Incoming call ringtone");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
    }

    private boolean notificationsAllowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || hasPermission("notifications");
    }

    // ── Permission plumbing ─────────────────────────────────────────

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            maybePromptFullScreenIntent(call);
            return;
        }
        if (hasPermission("notifications")) {
            maybePromptFullScreenIntent(call);
        } else {
            requestPermissionForAlias("notifications", call, "notificationThenFullScreenCallback");
        }
    }

    // Grants CAMERA + RECORD_AUDIO as real Android runtime permissions so the
    // WebView's getUserMedia always succeeds once the user accepts (WebView
    // getUserMedia prompts fail outside a gesture, so we prompt natively first).
    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        requestNotificationsIfNeeded(call);
    }

    private void requestNotificationsIfNeeded(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasPermission("notifications")) {
            requestPermissionForAlias("notifications", call, "mediaFirstCallback");
            return;
        }
        requestCameraIfNeeded(call);
    }

    private void requestCameraIfNeeded(PluginCall call) {
        // Request camera first; requestMediaCameraCallback then asks for the mic.
        if (!hasPermission("camera")) {
            requestPermissionForAlias("camera", call, "requestMediaCameraCallback");
        } else {
            requestMicrophoneIfNeeded(call);
        }
    }

    private void maybePromptFullScreenIntent(PluginCall call) {
        // Android 12+ hides full-screen call intents behind an opt-in. Prompt
        // once (Settings page) so an incoming call takes over the screen. Old
        // Android uses full-screen intents out of the box.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !canUseFullScreenIntent()) {
            Context ctx = getContext();
            boolean prompted = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getBoolean(KEY_FSI_PROMPTED, false);
            if (!prompted) {
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit().putBoolean(KEY_FSI_PROMPTED, true).apply();
                try {
                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    i.setData(Uri.fromParts("package", ctx.getPackageName(), null));
                    ctx.startActivity(i);
                } catch (Exception e) {
                    // Settings not accessible — fall back to app details.
                    try {
                        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.fromParts("package", ctx.getPackageName(), null));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(i);
                    } catch (Exception ignored) {
                    }
                }
            }
        }
        call.resolve();
    }

    private boolean canUseFullScreenIntent() {
        try {
            NotificationManager nm = getActivity().getSystemService(NotificationManager.class);
            return nm != null && nm.canUseFullScreenIntent();
        } catch (Throwable t) {
            return false;
        }
    }

    @PermissionCallback
    private void notificationThenFullScreenCallback(PluginCall call) {
        maybePromptFullScreenIntent(call);
    }

    @PermissionCallback
    private void mediaFirstCallback(PluginCall call) {
        requestCameraIfNeeded(call);
    }

    @PermissionCallback
    private void requestMediaCameraCallback(PluginCall call) {
        requestMicrophoneIfNeeded(call);
    }

    private void requestMicrophoneIfNeeded(PluginCall call) {
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

    // ── Ringing ─────────────────────────────────────────────────────

    private Uri soundFor(String source) {
        return CallSound.uri(getContext());
    }

    // Persist the user's Settings → Calls choice natively so incoming FCM push
    // rings use the same sound as in-app rings.
    @PluginMethod
    public void setSoundSource(PluginCall call) {
        String source = call.getString("source", "chime");
        CallSound.set(getContext(), source);
        call.resolve();
    }

    @PluginMethod
    public void ring(PluginCall call) {
        String peerName = call.getString("displayName", "Incoming call");
        String source = call.getString("soundSource", "chime");
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

    // In-call full-screen "simulated call alarm": hide the Android system bars
    // and keep the screen awake while a call is ringing/active, exactly like a
    // real incoming-call screen. Restored when the call ends.
    @PluginMethod
    public void setCallUiActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        Window window = getActivity().getWindow();
        getActivity().runOnUiThread(() -> {
            try {
                View decor = window.getDecorView();
                if (active) {
                    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    WindowInsetsControllerCompat ctrl = new WindowInsetsControllerCompat(window, decor);
                    ctrl.hide(WindowInsetsCompat.Type.systemBars());
                    ctrl.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                } else {
                    window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    new WindowInsetsControllerCompat(window, decor).show(WindowInsetsCompat.Type.systemBars());
                }
            } catch (Throwable t) {
                // Ignored — cosmetic on exotic ROMs.
            }
            call.resolve();
        });
    }
}