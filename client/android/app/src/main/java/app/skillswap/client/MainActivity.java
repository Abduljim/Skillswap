package app.skillswap.client;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the Play Billing bridge plugin
        registerPlugin(app.skillswap.client.billing.PlayBillingBridge.class);
        registerPlugin(KeyboardBridge.class);
        registerPlugin(CallNotifier.class);
        registerPushPluginIfPresent();
        super.onCreate(savedInstanceState);

        // Disable pinch-zoom system-wide on the WebView so the app feels native.
        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setSupportZoom(false);
            // Force-enable wide viewport so layouts stay responsive, but no zoom.
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            // Let WebRTC audio/video play without an extra tap after a call is live.
            settings.setMediaPlaybackRequiresUserGesture(false);
        }
    }

    /**
     * PushPlugin (and CallFirebaseMessagingService) are compiled only when
     * app/google-services.json is present — see the `fcmEnabled` source-set
     * excludes in app/build.gradle. Registering the class directly therefore
     * broke the build for anyone without Firebase config, so it is resolved by
     * name instead: with the file, push works; without it the app still builds
     * and runs, and the JS side (lib/push.ts) already swallows the missing
     * plugin.
     */
    @SuppressWarnings("unchecked")
    private void registerPushPluginIfPresent() {
        try {
            Class<?> plugin = Class.forName("app.skillswap.client.PushPlugin");
            registerPlugin((Class<? extends com.getcapacitor.Plugin>) plugin);
        } catch (ClassNotFoundException e) {
            android.util.Log.i("SkillSwap", "Push plugin not compiled (no google-services.json) — FCM disabled");
        }
    }
}