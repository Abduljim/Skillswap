package app.skillswap.client;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps a live SkillSwap call alive while the app is in the background.
 *
 * A WebRTC call running inside a WebView gets frozen (and then killed) once
 * Android backgrounds the app, which is why calls used to drop as soon as the
 * user switched away. This service holds a low-priority "call in progress"
 * notification so the process stays in the foreground-service tier.
 *
 * It is started and stopped from {@link CallNotifier#setCallUiActive}, which the
 * web layer already calls at every point in the call lifecycle (ring, connect,
 * hang up, leave group call) — so no extra JavaScript wiring is needed.
 *
 * Safety notes:
 *  - Android 14 (targetSdk 34) requires a foreground-service *type* whose
 *    matching runtime permission is already granted, so the type mask is
 *    computed from the permissions the user actually gave us. If neither camera
 *    nor microphone is granted yet (e.g. still ringing before the first prompt)
 *    we simply do not start — the call still works, it is just not protected in
 *    background.
 *  - Every entry point is wrapped: a failure here must never take down a call.
 */
public class CallForegroundService extends Service {

    static final String CHANNEL_ID = "call-ongoing";
    private static final int NOTIF_ID = 9002;

    /** Start protecting the current call. No-op if we hold no media permission. */
    public static void start(Context ctx, String text) {
        try {
            int types = availableTypes(ctx);
            if (types == 0) return;
            Intent i = new Intent(ctx, CallForegroundService.class);
            i.putExtra("text", text);
            i.putExtra("types", types);
            ContextCompat.startForegroundService(ctx, i);
        } catch (Throwable ignored) {
            // Background-start restrictions, exotic ROMs, etc. — never fatal.
        }
    }

    public static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, CallForegroundService.class));
        } catch (Throwable ignored) {
            // Not running — nothing to do.
        }
    }

    /** Only claim foreground-service types whose runtime permission is granted. */
    private static int availableTypes(Context ctx) {
        int types = 0;
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        }
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
        }
        return types;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = intent != null ? intent.getStringExtra("text") : null;
        int types = intent != null ? intent.getIntExtra("types", 0) : 0;
        if (types == 0) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            ensureChannel();

            Intent open = new Intent(this, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent contentIntent = PendingIntent.getActivity(this, 0, open, piFlags);

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("SkillSwap call")
                    .setContentText(text != null ? text : "Tap to return to your call")
                    .setSmallIcon(android.R.drawable.stat_sys_phone_call)
                    .setContentIntent(contentIntent)
                    .setOngoing(true)
                    .setSilent(true)
                    .setShowWhen(false)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, types);
            } else {
                startForeground(NOTIF_ID, notification);
            }
        } catch (Throwable t) {
            // If the OS refuses the service (missing permission, background-start
            // restriction) the call continues without it.
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void ensureChannel() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Ongoing calls", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Keeps your call alive while SkillSwap is in the background");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
