package app.skillswap.client;

import android.content.Context;
import android.media.RingtoneManager;
import android.net.Uri;

/**
 * Where the user's call-sound choice lives on the device: 'chime' (default —
 * the bundled marimba-style call chime), 'ringtone', 'alarm', or 'silent'.
 * The JS Settings → Calls picker writes it via CallNotifier.setSoundSource, and
 * both the in-app ring and the FCM push ring read it so they always use what
 * the user picked.
 */
public final class CallSound {
    private static final String PREFS = "skillswap_prefs";
    private static final String KEY = "call_sound";

    private CallSound() {
    }

    public static void set(Context context, String value) {
        String v = normalize(value);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY, v).apply();
    }

    public static String get(Context context) {
        return normalize(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "chime"));
    }

    private static String normalize(String value) {
        if (value == null) return "chime";
        if ("ringtone".equals(value) || "alarm".equals(value) || "silent".equals(value)) return value;
        return "chime";
    }

    public static Uri uri(Context context) {
        switch (get(context)) {
            case "alarm":
                return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            case "silent":
                return null;
            case "ringtone":
                return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            default:
                // Bundled crisp marimba-style chime (res/raw/call_chime.wav) —
                // cut through room noise without being jarring.
                return Uri.parse("android.resource://" + context.getPackageName() + "/raw/call_chime");
        }
    }
}