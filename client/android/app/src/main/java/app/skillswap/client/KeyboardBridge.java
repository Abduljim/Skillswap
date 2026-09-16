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
            if (!webView.requestFocus()) {
                call.reject("WebView could not receive focus");
                return;
            }
            keyboard.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
            call.resolve();
        });
    }
}
