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
 *                            into that conversation. kind="group" carries
 *                            groupId instead of exchangeId
 *  - clearLaunchedCall()   → clear it after handling
 *  - getLaunchAction()     → "answer"/"decline" if the user pressed that button
 *                            on a closed-app call notification (consumed on read)
 */
@CapacitorPlugin(name = "Push")
public class PushPlugin extends Plugin {
    private static final String PREFS = "call_state";
    private static final String KEY_EXCHANGE = "exchange_id";
    private static final String KEY_CALLER = "caller_name";
    private static final String KEY_CALLER_ID = "caller_id";
    private static final String KEY_VIDEO = "video";
    private static final String KEY_TS = "ts";
    private static final String KEY_ACTION = "action";
    private static final String KEY_KIND = "kind";
    private static final String KEY_GROUP = "group_id";
    private static final String KEY_MEMBER_COUNT = "member_count";
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
            // "direct" or "group": a group invite has no exchange to open, and
            // answering it joins a mesh room instead of a 1:1 peer connection.
            ret.put("kind", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_KIND, "direct"));
            ret.put("groupId", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_GROUP, ""));
            ret.put("memberCount", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_MEMBER_COUNT, 0));
            ret.put("exchangeId", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_EXCHANGE, ""));
            ret.put("callerName", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CALLER, ""));
            ret.put("callerId", c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CALLER_ID, ""));
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

    /**
     * Which button the user pressed on an incoming-call notification that was
     * posted while the app was closed (CallActionReceiver writes this). Read
     * once and cleared, so a single tap cannot accept two calls.
     */
    @PluginMethod
    public void getLaunchAction(PluginCall call) {
        Context c = getContext();
        String action = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_ACTION, "");
        if (action != null && !action.isEmpty()) {
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().remove(KEY_ACTION).apply();
        }
        JSObject ret = new JSObject();
        ret.put("action", action == null ? "" : action);
        call.resolve(ret);
    }
}