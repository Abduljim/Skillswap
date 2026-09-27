package app.skillswap.client;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationManagerCompat;

/**
 * Handles the Answer / Decline buttons on an incoming-call notification that was
 * posted while the app was closed (see CallFirebaseMessagingService).
 *
 * A BroadcastReceiver cannot answer the call itself: call signalling runs over
 * the web layer's socket, which only exists once the app is up. So this does the
 * two things it CAN do instantly — silence the insistent ring, and record the
 * user's choice — then brings the app to the front. The web layer reads the
 * choice with Push.getLaunchAction() and accepts or declines over its socket,
 * which is what tells the caller "Declined" instead of leaving them ringing.
 *
 * Not exported: only our own PendingIntents send these actions.
 */
public class CallActionReceiver extends BroadcastReceiver {
    public static final String ACTION_ANSWER = "app.skillswap.client.action.ANSWER_CALL";
    public static final String ACTION_DECLINE = "app.skillswap.client.action.DECLINE_CALL";

    /** Must match the keys PushPlugin reads. */
    private static final String PREFS = "call_state";
    private static final String KEY_ACTION = "action";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        final boolean answer = ACTION_ANSWER.equals(action);
        if (!answer && !ACTION_DECLINE.equals(action)) return;

        // Stop the ringing immediately — the user has responded, and the
        // notification is FLAG_INSISTENT, so it would otherwise keep going.
        try {
            NotificationManagerCompat.from(context).cancel(CallNotifier.CALL_NOTIFICATION_ID);
            NotificationManagerCompat.from(context)
                    .cancel(CallFirebaseMessagingService.LEGACY_NOTIFICATION_ID);
        } catch (Exception ignored) {
            // Notification already gone.
        }

        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_ACTION, answer ? "answer" : "decline")
                    .apply();
        } catch (Exception ignored) {
            // If this fails the app simply opens without auto-responding.
        }

        try {
            Intent open = new Intent(context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            context.startActivity(open);
        } catch (Exception ignored) {
            // Background activity start blocked; the notification is at least silent.
        }
    }
}
