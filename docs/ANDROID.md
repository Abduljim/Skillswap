# SkillSwap — Android Build & Play Billing

This document explains how to build the SkillSwap Android app with Capacitor and integrate Google Play Billing.

---

## 1. Prerequisites

- Node.js 18+
- Android Studio Hedgehog (or newer)
- JDK 17
- A Google Play Console account with a draft app created
- A registered service account in Google Cloud with the **Android Publisher** role

## 2. One-time setup

### a. Create the Android project

From the `client/` directory:

```bash
npm install
npm run build            # produces client/dist/
npm run cap:add:android  # first time only — creates android/ folder
```

After this you should see `client/android/` with the Capacitor scaffolding.

### b. Copy the native bridge

The bridge code in this repo lives at `client/android/app/src/main/java/app/skillswap/client/`. When you ran `cap add android`, Capacitor generated a *different* `MainActivity.java` and no bridge file. Either:

- Replace the generated files with the ones in this repo, OR
- Re-run `cap add android` and then copy the files from this repo into the generated project.

The bridge consists of:

```
client/android/app/src/main/java/app/skillswap/client/MainActivity.java
client/android/app/src/main/java/app/skillswap/client/billing/PlayBillingBridge.java
```

### c. Add Play Billing to the Gradle file

The repo's `client/android/app/build.gradle` already declares:

```gradle
implementation 'com.android.billingclient:billing:7.0.0'
```

Capacitor's default scaffold does not. If you regenerated the project, copy the relevant dependency from this repo.

### d. Configure the package name and signing

Edit `client/android/app/build.gradle` — the `applicationId` must match your Google Play Console package:

```gradle
defaultConfig {
    applicationId "app.skillswap.client"  // ← match Play Console
    ...
}
```

For a release build, generate an upload keystore and configure `signingConfigs.release` in `build.gradle`. Never commit your keystore.

## 3. Set up Play Console subscriptions

1. In Play Console → your app → **Monetize → Products → Subscriptions**
2. Create two subscription products with these IDs (must match `PlayBillingBridge.PRODUCT_PRO_*`):
   - `skillswap_pro_android_monthly` — Monthly Pro
   - `skillswap_pro_android_yearly`   — Yearly Pro
3. Set the prices in your local currency.

## 4. Service account for server-side verification

The SkillSwap backend can verify purchase tokens with the Google Play Developer API.

1. In Google Cloud Console → **IAM & Admin → Service Accounts** → create a service account
2. Grant it the **Android Publisher** role (or use the Play Console's API access to grant the role)
3. Create a JSON key, download it as `play-service-account.json`
4. Put it somewhere on your server (e.g. `/etc/skillswap/play-service-account.json`)

Then add to your server `.env`:

```bash
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/etc/skillswap/play-service-account.json
ANDROID_PACKAGE_NAME=app.skillswap.client
PLAY_BILLING_VERIFY=true
```

When `PLAY_BILLING_VERIFY=true`, the server will reject any purchase token that doesn't verify against Google Play. **Never set this to true in development** — Google rejects tokens generated outside a real Android purchase.

## 5. Configure the production API URL

In `client/.env.production` (create it):

```bash
VITE_API_URL=https://api.skillswap.app

# TURN relay for calls. STUN alone cannot connect two peers that are both
# behind carrier-grade NAT, which is the normal case on mobile networks, so a
# TURN server is what makes calls actually work in the field.
# Providers: metered.ca (free tier + API for short-lived credentials), Twilio
# Network Traversal, or your own coturn. Separate multiple URLs with commas.
VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349?transport=tls
VITE_TURN_USERNAME=<username>
VITE_TURN_CREDENTIAL=<password>
```

Without `VITE_TURN_URLS` the app falls back to public STUN plus the legacy
Metered Open Relay hosts. Those relays now need an account, so treat the
fallback as "works on Wi‑Fi/LAN, unreliable on mobile data" — set TURN before
you ship.

Then build:

```bash
npm run build
npm run cap:sync
```

`cap:sync` copies `dist/` into `android/app/src/main/assets/public` and updates native deps.

### Release signing

The keystore and its passwords are **not** in the repo (they used to be
hardcoded in `app/build.gradle`, which meant anyone with read access could sign
an update Play would accept). Put them in `client/android/keystore.properties`
(gitignored):

```properties
storeFile=skillswap-release.jks
storePassword=...
keyAlias=skillswap
keyPassword=...
```

or export `SKILLSWAP_STORE_FILE`, `SKILLSWAP_STORE_PASSWORD`,
`SKILLSWAP_KEY_ALIAS`, `SKILLSWAP_KEY_PASSWORD`. With neither present the build
still succeeds but produces **unsigned** artifacts.

Generate a keystore once and back it up somewhere durable — Play signs every
future update with it, and losing it means never being able to update the app:

```bash
keytool -genkeypair -v -keystore client/android/app/skillswap-release.jks \
  -alias skillswap -keyalg RSA -keysize 2048 -validity 10950 \
  -dname "CN=SkillSwap, OU=Mobile, O=SkillSwap, L=Lagos, ST=Lagos, C=NG"
```

## 6. Build & install

```bash
cd client
npm run android:build        # runs cap:sync then assembleRelease
```

Output: `client/android/app/build/outputs/apk/release/app-release.apk` (signed with debug key by default).

For Play Store: in Android Studio → Build → Generate Signed Bundle/APK → Android App Bundle → upload the AAB to Play Console.

## 7. End-to-end test

1. Install on a real device with a Play Console test account
2. Sign up in the app
3. Go to **Membership** → tap **Subscribe via Google Play**
4. Google Play purchase sheet should appear
5. Approve → app should call `POST /api/subscription/android` with the purchase token
6. Server verifies against Google Play (if `PLAY_BILLING_VERIFY=true`)
7. User becomes Pro; the upgrade indicator + Pro badge appear

## 8. Restoring purchases

Users can tap **Restore purchase** on the Membership page. The app calls the bridge's `restorePurchases()` which uses `BillingClient.queryPurchasesAsync` to list active subscriptions, then re-reports each to the server.

---

## File map

| File | Purpose |
| --- | --- |
| `client/capacitor.config.json` | Capacitor app config |
| `client/android/app/src/main/AndroidManifest.xml` | Permissions + activity |
| `client/android/app/src/main/java/.../MainActivity.java` | Registers the bridge plugin |
| `client/android/app/src/main/java/.../billing/PlayBillingBridge.java` | Play Billing v7 native bridge |
| `client/android/app/build.gradle` | Dependencies (incl. Play Billing) |
| `client/src/lib/billing-bridge.ts` | JS shim that calls `Capacitor.Plugins.PlayBilling` |
| `client/src/pages/MembershipPage.tsx` | Pricing UI — uses bridge on Android |
| `server/src/services/playBillingVerifier.ts` | Server-side verification |
| `server/src/services/subscription.service.ts` | Activates purchase + entitlement |
| `server/src/routes/billing.routes.ts` | `/subscription/web`, `/subscription/android`, `/boost`, `/profile-views` |

---

## Troubleshooting

**`Failed to query products`** — Verify the subscription SKUs match exactly in Play Console and the Google Play account on the device is added as a license tester.

**`Billing setup failed`** — Add the device's Google account to License Testers in Play Console. Use a debug build or a non-signed build during testing.

**`Purchase not valid`** — Server couldn't verify the token. Check that `PLAY_BILLING_VERIFY` is set correctly and the service-account JSON file is readable.

**JS bridge not found** — Make sure `MainActivity.registerPlugin(PlayBillingBridge.class)` runs before `super.onCreate`. The `window.Capacitor.Plugins.PlayBilling` global only exists after Capacitor initializes.