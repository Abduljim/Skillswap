package app.skillswap.client;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Bridges Firebase Cloud Messaging to the web layer:
 *  - getToken()            → FCM device token, sent to the server
 *  - getLaunchedCall()     → the incoming call that opened the app (from an
 *                            FCM notification tap), so JS can drop the user
 *                            into that conversation
 *  - clearLaunchedCall()   → clear it after handling
 */
@CapacitorPlugin(name = "Push")
public class PushPlugin extends Plugin {
    private static final String PREFS = "call_state";
    private static final String KEY_EXCHANGE = "exchange_id";
    private static final String KEY_CALLER = "caller_name";
    private static final String KEY_VIDEO = "video";
    private static final String KEY_TS = "ts";
    private static final long FRESH_MS = 5 * 60 * 1000L;

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful() && task.getResult() != null) {
                        JSObject ret = new JSObject();
                        ret.put("token", task.getResult());
                        call.resolve(ret);
                    } else {
                        call.reject("Unable to obtain FCM token");
                    }
                });
    }

    @PluginMethod
    public void getLaunchedCall(PluginCall call) {
        Context c = getContext();
        long ts = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_TS, 0);
        getActivity().runOnUiThread(() -> {
            if (ts == 0 || System.currentTimeMillis() - ts > FRESH_MS) {
                call.resolve(new JSObject());
                return;
            }
            JSObject ret = new JSObject();
            ret.put("exchangeId", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_EXCHANGE, ""));
            ret.put("callerName", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CALLER, ""));
            ret.put("video", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_VIDEO, false));
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void clearLaunchedCall(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().clear().apply();
        call.resolve();
    }
}