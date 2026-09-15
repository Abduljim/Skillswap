package app.skillswap.client.billing;

import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.ProductDetailsResponseListener;
import com.android.billingclient.api.PurchasesResponseListener;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Play Billing bridge for SkillSwap.
 *
 * Exposes a Capacitor plugin to the React web layer so it can:
 *   - query subscription product details
 *   - launch the Google Play purchase flow
 *   - acknowledge purchases
 *   - restore active subscriptions
 *
 * After a successful purchase, the JS layer is responsible for calling
 * the backend at POST /api/subscription/android with { productId, purchaseToken }
 * so the server can record the entitlement.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingBridge extends Plugin {

    private static final String TAG = "PlayBillingBridge";

    public static final String PRODUCT_PRO_MONTHLY = "skillswap_pro_android_monthly";
    public static final String PRODUCT_PRO_YEARLY = "skillswap_pro_android_yearly";

    private BillingClient billingClient;
    private final Map<String, ProductDetails> productDetailsCache = new HashMap<>();

    @Override
    public void load() {
        super.load();
        initBillingClient();
    }

    private void initBillingClient() {
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(new PurchasesUpdatedListener() {
                    @Override
                    public void onPurchasesUpdated(@NonNull BillingResult billingResult,
                                                  @Nullable List<Purchase> purchases) {
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK
                                && purchases != null) {
                            for (Purchase purchase : purchases) {
                                handlePurchase(purchase);
                            }
                        } else {
                            Log.w(TAG, "Purchase failed: " + billingResult.getDebugMessage());
                            JSObject obj = new JSObject();
                            obj.put("code", billingResult.getResponseCode());
                            obj.put("message", billingResult.getDebugMessage());
                            notifyListeners("purchase:failed", obj);
                        }
                    }
                })
                .enablePendingPurchases()
                .build();
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    Log.i(TAG, "Billing client connected");
                } else {
                    Log.e(TAG, "Billing setup failed: " + billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected");
            }
        });
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        products.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_PRO_MONTHLY)
                .setProductType(BillingClient.ProductType.SUBS)
                .build());
        products.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_PRO_YEARLY)
                .setProductType(BillingClient.ProductType.SUBS)
                .build());

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(products)
                .build();

        billingClient.queryProductDetailsAsync(params, new ProductDetailsResponseListener() {
            @Override
            public void onProductDetailsResponse(@NonNull BillingResult billingResult,
                                                 @NonNull List<ProductDetails> list) {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Failed to query products: " + billingResult.getDebugMessage());
                    return;
                }
                productDetailsCache.clear();
                JSONArray arr = new JSONArray();
                for (ProductDetails pd : list) {
                    productDetailsCache.put(pd.getProductId(), pd);
                    JSONObject obj = new JSONObject();
                    try {
                        obj.put("productId", pd.getProductId());
                        obj.put("title", pd.getTitle());
                        obj.put("description", pd.getDescription());
                        if (!pd.getSubscriptionOfferDetails().isEmpty()) {
                            ProductDetails.SubscriptionOfferDetails offer =
                                    pd.getSubscriptionOfferDetails().get(0);
                            ProductDetails.PricingPhase phase =
                                    offer.getPricingPhases().getPricingPhaseList().get(0);
                            obj.put("priceCents", phase.getPriceAmountMicros() / 10_000);
                            obj.put("currency", phase.getPriceCurrencyCode());
                            obj.put("formattedPrice", phase.getFormattedPrice());
                            obj.put("billingPeriodDays",
                                    phase.getBillingPeriod().contains("P1Y") ? 365 : 30);
                        }
                        arr.put(obj);
                    } catch (JSONException e) {
                        Log.e(TAG, "JSON error", e);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("products", arr);
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) {
            call.reject("productId is required");
            return;
        }
        ProductDetails details = productDetailsCache.get(productId);
        if (details == null) {
            call.reject("Product not loaded. Call getProducts() first.");
            return;
        }
        if (details.getSubscriptionOfferDetails() == null
                || details.getSubscriptionOfferDetails().isEmpty()) {
            call.reject("No offer details available");
            return;
        }

        ProductDetails.SubscriptionOfferDetails offer =
                details.getSubscriptionOfferDetails().get(0);

        com.android.billingclient.api.BillingFlowParams params =
                com.android.billingclient.api.BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(java.util.Arrays.asList(
                                com.android.billingclient.api.BillingFlowParams.ProductDetailsParams
                                        .newBuilder()
                                        .setProductDetails(details)
                                        .setOfferToken(offer.getOfferToken())
                                        .build()
                        ))
                        .build();

        BillingResult result = billingClient.launchBillingFlow(getActivity(), params);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            call.reject("Failed to launch billing: " + result.getDebugMessage());
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
        billingClient.queryPurchasesAsync(params, new PurchasesResponseListener() {
            @Override
            public void onQueryPurchasesResponse(@NonNull BillingResult billingResult,
                                                 @NonNull List<Purchase> purchases) {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Restore failed: " + billingResult.getDebugMessage());
                    return;
                }
                JSONArray arr = new JSONArray();
                for (Purchase p : purchases) {
                    if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                        try {
                            JSONObject o = new JSONObject();
                            o.put("productId", p.getProducts().get(0));
                            o.put("purchaseToken", p.getPurchaseToken());
                            o.put("orderId", p.getOrderId());
                            o.put("acknowledged", p.isAcknowledged());
                            arr.put(o);
                        } catch (JSONException ignored) {}
                    }
                }
                JSObject ret = new JSObject();
                ret.put("purchases", arr);
                call.resolve(ret);
            }
        });
    }

    private void handlePurchase(Purchase purchase) {
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return;

        if (!purchase.isAcknowledged()) {
            AcknowledgePurchaseParams ack = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.getPurchaseToken())
                    .build();
            billingClient.acknowledgePurchase(ack, billingResult -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Log.e(TAG, "Acknowledge failed: " + billingResult.getDebugMessage());
                }
            });
        }

        JSObject ret = new JSObject();
        try {
            ret.put("productId", purchase.getProducts().get(0));
            ret.put("purchaseToken", purchase.getPurchaseToken());
            ret.put("orderId", purchase.getOrderId());
        } catch (Exception ignored) {}
        notifyListeners("purchase:success", ret);
    }
}