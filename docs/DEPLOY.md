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

#### If a deploy fails on migrations (P3009 / P3018)

Symptom, verbatim from a real build log:

```
Applying migration `20260925124802_add_user_token_version`
Error: P3018
A migration failed to apply. New migrations cannot be applied before the error
is recovered from.
Database error code: 42701
ERROR: column "tokenVersion" of relation "User" already exists
==> Build failed 😞
```

Cause: the production database was originally created with `prisma db push`, so
columns that a later migration adds can already exist. The bare `ADD COLUMN`
collides, Prisma records that migration as **failed**, and from then on it refuses
to apply *anything* — every following deploy dies in the same place, even after
the SQL is corrected. Redeploying alone cannot clear it.

This is handled automatically now, in two parts:

1. Migrations are re-runnable. `ADD COLUMN IF NOT EXISTS`, so applying one to a
   database that already has the column is a no-op instead of an error.
2. `scripts/ensure-migrations.js` (which the build command runs immediately
   before `migrate deploy`) clears any migration left in a failed state with
   `prisma migrate resolve --rolled-back`, so the corrected SQL is retried on the
   same deploy. It also re-records the checksum of an already-applied migration
   whose file was hardened afterwards, because Prisma verifies a SHA-256 of each
   file and would otherwise fail every database that applied the old copy.

So the recovery is: **push, and let it redeploy.** The log should show
`🩺 1 migration(s) left in a failed state … ↩ … → prisma migrate resolve
--rolled-back` and then `All migrations have been successfully applied`.

If you ever need to do it by hand (a host with shell access, or a database that
is not this one), point `DATABASE_URL` at that database and run:

```bash
cd server
npx prisma migrate resolve --rolled-back <migration_name>   # clear the failure
npx prisma migrate deploy                                   # retry
```

`--rolled-back` only edits Prisma's bookkeeping table; it never touches your
data. Use `--applied` instead when the migration's changes genuinely are already
in the database and you want it skipped rather than retried.

Rules that keep this from recurring:

- Every migration must be safe to re-run (`IF NOT EXISTS`, guarded `UPDATE`s).
- Never edit what a released migration *does* — only harden it or fix comments.
  The checksum repair above re-records on trust, so a substantive edit would pass
  silently on databases that already applied the old version and never reach them.
- `prisma db push` must never run against production.


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

## Calls: TURN credentials (set once, then redeploy)

Calls use WebRTC peer-to-peer. STUN alone works when at least one peer has a
public address, but two phones on mobile data are usually both behind
carrier-grade NAT — the norm on MTN/Airtel/Glo — and then there is no direct
route. TURN relays the media in that case. Without it a call rings, both sides
show "connecting", and then it fails.

The client reads three build-time variables (`client/src/contexts/CallsContext.tsx`):

| Variable | Example |
| --- | --- |
| `VITE_TURN_URLS` | `turn:turn.example.com:3478,turns:turn.example.com:5349?transport=tls` |
| `VITE_TURN_USERNAME` | `skillswap` |
| `VITE_TURN_CREDENTIAL` | `a-long-random-secret` |

`VITE_*` values are **inlined into the bundle at build time**, and the Render
service `skillswap-api` is what builds the client. So:

1. Render dashboard → `skillswap-api` → **Environment**.
2. Add or edit the three variables (they already exist as blanks in `render.yaml`).
3. **Save changes** → Render redeploys, and the new bundle carries them.
4. For the Android app the same values must be present when the APK/AAB is built —
   put them in `client/.env.production` before `npm run cap:sync` (see *5. Update
   the APK* above), otherwise the installed app keeps falling back to the open
   relay.

Until they are set, the client falls back to `stun:stun.l.google.com:19302` plus
the Open Relay Project (`openrelay.xyz`). That is fine for development on one
Wi-Fi network and useless as a production plan: it is a shared free service with
no credentials, no SLA and aggressive rate limits.

### Getting a TURN server

Ordered by effort, cheapest first:

- **Self-host coturn** (free, BSD-licensed, what most production WebRTC runs).
  Any small VPS works — an Oracle Cloud *Always Free* ARM instance costs nothing,
  Hetzner CX22 is ~€4/mo. This is the right answer for a real product because you
  pay nothing per GB and you control the credentials. Minimal
  `/etc/turnserver.conf`:

  ```conf
  listening-port=3478
  tls-listening-port=5349
  cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
  pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
  # static username/password, which is what VITE_TURN_USERNAME/CREDENTIAL expect
  lt-cred-mech
  user=skillswap:a-long-random-secret
  realm=turn.example.com
  # also listen on 443 — campus and corporate networks block 3478 and UDP
  alt-tls-listening-port=443
  no-multicast-peers
  denied-peer-ip=10.0.0.0-10.255.255.255
  denied-peer-ip=192.168.0.0-192.168.255.255
  ```

  Open UDP+TCP 3478, 5349 and 443, plus a UDP relay range
  (`min-port=49152`, `max-port=49200`). Use a real domain with Let's Encrypt so
  `turns:` works.
- **Managed with a free tier and static credentials** — ExpressTURN or Xirsys.
  Sign up, copy the URL/username/credential from the dashboard, paste them in.
  Five minutes, no server to maintain, and the free allowance is enough for
  testing with a handful of real users.
- **Metered** — was the previous hardcoded provider. Its free plan caps relayed
  media at 500 MB/month, which a single video call can exhaust, and paid plans
  start around $99/month.
- **Cloudflare TURN** — $0.05/GB and very good anycast coverage, but it expects
  short-lived credentials minted by your backend per session, which the current
  static-env client does not do. Only choose this together with the server-minted
  credentials change below.

### One honest caveat

Static TURN credentials are compiled into the client bundle, so anyone who
inspects the site or unpacks the APK can read them and relay their own traffic
through your TURN server — which is a bandwidth bill or an exhausted quota, not a
data leak. For a handful of testers this is acceptable. Before real traffic, move
to short-lived credentials: coturn's `use-auth-secret` plus an authenticated
endpoint (for example `GET /api/calls/ice-servers`) that returns an
HMAC credential valid for a few minutes, and have `buildIceServers()` fetch it
instead of reading `import.meta.env`. That also removes the need to rebuild the
app to rotate credentials.

### Verifying it works

Test from two phones on **mobile data** (not the same Wi-Fi — that hides the
problem). In Chrome on desktop you can also open `chrome://webrtc-internals` and
confirm a `relay` candidate appears and that the selected candidate pair uses it.

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