package app.skillswap.client;

import android.content.Context;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KeyboardBridge")
public class KeyboardBridge extends Plugin {
    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            InputMethodManager keyboard = (InputMethodManager) getContext()
                    .getSystemService(Context.INPUT_METHOD_SERVICE);
            if (webView == null || keyboard == null) {
                call.reject("System keyboard unavailable");
                return;
            }
            // Don't steal DOM focus from the text input — the WebView already has it.
            if (!webView.hasFocus()) {
                webView.requestFocus();
            }
            keyboard.showSoftInput(webView, InputMethodManager.SHOW_FORCED);
            call.resolve();
            // Focus races (button tap → input focus) can dismiss the keyboard right
            // after it opens; retry once shortly after so the emoji tab stays reachable.
            webView.postDelayed(() -> {
                if (getActivity().isFinishing() || getActivity().isDestroyed()) return;
                if (!keyboard.isActive() && webView.hasFocus()) {
                    keyboard.showSoftInput(webView, InputMethodManager.SHOW_FORCED);
                }
            }, 250);
        });
    }
}
