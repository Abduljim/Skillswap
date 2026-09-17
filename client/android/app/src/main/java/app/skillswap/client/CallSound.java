package app.skillswap.client;

import android.content.Context;
import android.media.RingtoneManager;
import android.net.Uri;

/**
 * Where the user's call-sound choice lives on the device: 'ringtone' (default),
 * 'alarm', or 'silent'. The JS Settings → Calls picker writes it via
 * CallNotifier.setSoundSource, and both the in-app ring and the FCM push ring
 * read it so they always use what the user picked.
 */
public final class CallSound {
    private static final String PREFS = "skillswap_prefs";
    private static final String KEY = "call_sound";

    private CallSound() {
    }

    public static void set(Context context, String value) {
        String v = value == null ? "ringtone" : value;
        if (!"alarm".equals(v) && !"silent".equals(v)) v = "ringtone";
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY, v).apply();
    }

    public static String get(Context context) {
        String v = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "ringtone");
        if (!"alarm".equals(v) && !"silent".equals(v)) return "ringtone";
        return v;
    }

    public static Uri uri(Context context) {
        switch (get(context)) {
            case "alarm":
                return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            case "silent":
                return null;
            default:
                return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        }
    }
}