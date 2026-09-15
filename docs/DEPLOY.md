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
   - Run `npm ci && prisma generate && prisma db push && esbuild`
   - Start the server

Watch the build log. It will print `🚀 SkillSwap API running on http://localhost:4000` when ready (~2–3 min).

### 3. Seed the database (one-time)

In the Render dashboard, open your `skillswap-api` service → **Shell** tab → run:

```bash
cd server && node scripts/seed-prod.js
```

You'll see `✅ Seed complete!` and 8 demo users printed.

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
echo 'VITE_API_URL=https://skillswap-api.onrender.com' > .env.production
npm run cap:sync
cd android
./gradlew assembleRelease bundleRelease
```

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

Until then, Pro upgrades use the **web dev fallback** — instant upgrade with no payment. Users with Pro see the Pro badge and unlock unlimited exchanges.

## Free tier caveats

- Render free Postgres is **deleted after 90 days** of inactivity. To avoid losing data, log into the dashboard every <90 days, or upgrade to a paid plan ($7/mo).
- Render free web services **spin down after 15 min of no traffic**. The first request after that takes ~30s to wake up. Upgrade to the $7/mo plan to keep it always-on.
- For a real product, deploy both Postgres and Web Service to a paid tier.

## Manual deploy alternative (Fly.io, Railway)

If you prefer another host, the codebase is fully portable:

- **Fly.io**: `fly launch && fly postgres create && fly secrets set DATABASE_URL=... && fly ssh -- node scripts/seed-prod.js`
- **Railway**: New Project → Deploy from GitHub → Add Postgres plugin → Set env vars → Deploy

The only host-specific file is `render.yaml`. Everything else is plain Node + TypeScript.