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
            webView.setMediaPlaybackRequiresUserGesture(false);
        }
    }
}