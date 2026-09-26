package app.skillswap.client;

import android.content.Context;
import android.net.Uri;

/**
 * Where the user's call-sound choice lives on the device. Exactly two sounds
 * ship with the app, both synthesised by client/scripts/gen-call-sounds.mjs:
 *
 *   'high'    Beacon — bright rising marimba figure (res/raw/ring_high.wav),
 *             the default; meant to cut across a street or a lecture hall.
 *   'soothe'  Drift — slow warm pad (res/raw/ring_soothe.wav); no percussive
 *             attack, so it does not startle.
 *   'silent'  no sound at all, vibrate only.
 *
 * The JS Settings → Calls picker writes it via CallNotifier.setSoundSource, and
 * both the in-app ring and the FCM push ring read it so they always use what
 * the user picked. Values written by older builds ('chime', 'ringtone',
 * 'alarm') are mapped to 'high' rather than rejected, so an existing install
 * keeps ringing after the update instead of falling through to a missing raw
 * resource.
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
        return normalize(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "high"));
    }

    private static String normalize(String value) {
        if (value == null) return "high";
        if ("soothe".equals(value) || "silent".equals(value)) return value;
        // 'high', and every value an older build could have stored.
        return "high";
    }

    public static Uri uri(Context context) {
        switch (get(context)) {
            case "silent":
                return null;
            case "soothe":
                return Uri.parse("android.resource://" + context.getPackageName() + "/raw/ring_soothe");
            default:
                return Uri.parse("android.resource://" + context.getPackageName() + "/raw/ring_high");
        }
    }
}