package app.skillswap.client;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the Play Billing bridge plugin
        registerPlugin(app.skillswap.client.billing.PlayBillingBridge.class);
        super.onCreate(savedInstanceState);
    }
}