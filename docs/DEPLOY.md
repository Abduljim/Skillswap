# Deploy SkillSwap to Render — One-Click Blueprint

This guide deploys a **persistent**, public version of the SkillSwap API + PostgreSQL database in about 3 minutes. Once deployed, your APK will work forever.

## What gets created

| Resource | Type | URL |
| --- | --- | --- |
| `skillswap-db` | PostgreSQL 16 (free) | private, only accessible by `skillswap-api` |
| `skillswap-api` | Node Web Service (free) | `https://skillswap-api.onrender.com` |

## Steps

### 1. Push this repo to GitHub

```bash
cd skillswap
git init
git add .
git commit -m "SkillSwap MVP"
# Create a repo on github.com (any name, public or private), then:
git remote add origin https://github.com/YOUR-USER/skillswap.git
git push -u origin main
```

### 2. One-click Blueprint deploy

1. Go to **[dashboard.render.com/blueprints](https://dashboard.render.com/blueprints)**
2. Click **New Blueprint Instance**
3. Select your GitHub repo
4. Click **Apply**
5. Render will:
   - Create `skillswap-db` (Postgres)
   - Create `skillswap-api` (Node web service)
   - Run `npm ci && prisma generate && ensure-migrations && prisma migrate deploy && esbuild && seed-prod`
   - Start the server

#### Schema migrations

The build applies versioned migrations from `server/prisma/migrations/` — it no
longer runs `prisma db push --accept-data-loss`, which could silently drop columns
and tables holding real user data whenever the schema and database diverged.

Databases that were created with `db push` before this change are handled
automatically: `scripts/ensure-migrations.js` detects an existing schema with no
migration history and records the baseline (`0_init`) as applied — bookkeeping only,
no data is touched. The first deploy after this change therefore reports
`No pending migrations to apply`.

After that, ship schema changes by committing a migration:

```bash
cd server && npm run migrate -- --name describe_the_change
git add prisma/migrations && git commit -m "…" && git push   # Render redeploys
```

Watch the build log. It will print `🚀 SkillSwap API running on http://localhost:4000` when ready (~2–3 min).

### 3. Seeding (automatic)

`node scripts/seed-prod.js` already runs at the end of the build command, so there
is nothing to do. It upserts the skill catalogue (287 skills / 14 categories,
loaded from the compiled `dist/catalogue.js` so dev and prod can never drift) and
promotes `ADMIN_EMAIL`.

It creates **no demo accounts** — it deletes the old placeholders
(`alice@example.com`, …) if they are still present. The app starts empty and only
real sign-ups create users.

To re-run it by hand (paid plans only — Render's free tier has no Shell tab):

```bash
cd server && node scripts/seed-prod.js
```

### 4. Get your live URL

Your API URL is shown at the top of the `skillswap-api` service page:
```
https://skillswap-api.onrender.com
```

Test it:
```
https://skillswap-api.onrender.com/health
```
should return `{"success":true,"data":{"status":"ok",...}}`.

### 5. Update the APK

The APK you have now points to the ephemeral sandbox URL. Rebuild it with your live URL:

```bash
cd client
cat > .env.production <<'ENV'
VITE_API_URL=https://skillswap-api.onrender.com
# Required for calls to connect on mobile networks (both peers behind CGNAT).
VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349?transport=tls
VITE_TURN_USERNAME=<username>
VITE_TURN_CREDENTIAL=<password>
ENV
npm run build
npm run cap:sync
cd android
./gradlew assembleRelease bundleRelease
```

Signing material lives outside the repo — see *Release signing* in
`docs/ANDROID.md`. Without `client/android/keystore.properties` (or the
`SKILLSWAP_*` environment variables) the artifacts come out unsigned.

The new APK is in `android/app/build/outputs/apk/release/app-release.apk`.

Sideload it on your Android phone — done.

## What about Play Billing?

Not enabled in this deploy. To turn it on:

1. Create subscription SKUs in Play Console: `skillswap_pro_android_monthly` and `skillswap_pro_android_yearly`
2. Generate a Google Play service-account JSON key
3. In Render, add these env vars to `skillswap-api`:
   - `PLAY_BILLING_VERIFY=true`
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/etc/secrets/play-sa.json` (use Render's Secret Files feature)
4. Upload the AAB (`app-release.aab`) to Play Console internal testing
5. The APK will then be able to charge real money

**Until those variables are set, Android purchases are rejected.** The verifier
fails closed in production: with `PLAY_BILLING_VERIFY` unset or `false` it returns
`valid: false` instead of trusting whatever `purchaseToken` the client sent. That is
deliberate — trusting the token meant any client could mint a year of Pro with
`{"productId":"…","purchaseToken":"anything"}`.

The web "instant upgrade" fallback (`POST /api/subscription/web`, no payment
provider) is likewise **disabled in production** and returns `403`. It stays
available in development so the paywall UI can be exercised. To open it in
production you must set `ENABLE_WEB_BILLING=true` — which makes Pro free for anyone
with a session cookie, so only do that if you have wired up a real web payment
provider first.

Every start-up prints the effective billing configuration to the deploy log, so a
misconfigured environment is visible immediately.

## Free tier caveats

- Render free Postgres is **deleted after 90 days** of inactivity. To avoid losing data, log into the dashboard every <90 days, or upgrade to a paid plan ($7/mo).
- Render free web services **spin down after 15 min of no traffic**. The first request after that takes ~30s to wake up. Upgrade to the $7/mo plan to keep it always-on.
- For a real product, deploy both Postgres and Web Service to a paid tier.

## Manual deploy alternative (Fly.io, Railway)

If you prefer another host, the codebase is fully portable:

- **Fly.io**: `fly launch && fly postgres create && fly secrets set DATABASE_URL=... && fly ssh -- node scripts/seed-prod.js`
- **Railway**: New Project → Deploy from GitHub → Add Postgres plugin → Set env vars → Deploy

The only host-specific file is `render.yaml`. Everything else is plain Node + TypeScript.