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
ENV
npm run build
npm run cap:sync
cd android
./gradlew assembleRelease bundleRelease
```

Signing material lives outside the repo — see *Release signing* in
`docs/ANDROID.md`. Without `client/android/keystore.properties` (or the
`SKILLSWAP_*` environment variables) the artifacts come out unsigned.

`VITE_API_URL` is the only variable the mobile build needs: TURN credentials for
calls are fetched from the API at runtime, so rotating them or standing up a relay
later does not require a new APK.

The new APK is in `android/app/build/outputs/apk/release/app-release.apk`.

Sideload it on your Android phone — done.

## Calls: the TURN relay

Calls are WebRTC: signalling goes through the API, media goes peer to peer — except
when it cannot. Two phones on mobile data are usually both behind carrier-grade NAT
(the norm on MTN/Airtel/Glo), where no direct route exists and a relay is the only
way through. Without one, a call rings, both sides answer, and nobody hears
anything.

**Full setup guide: [`docs/TURN.md`](TURN.md)** — free coturn on an Oracle Always
Free VPS, the two firewalls you have to open, TLS, testing, capacity maths and
troubleshooting. The short version:

1. Run coturn somewhere with a public IP and free egress (Oracle Always Free gives
   10 TB/month outbound).
2. Set these on Render → `skillswap-api` → **Environment**, then redeploy:

   | Key | Example | Notes |
   | --- | --- | --- |
   | `TURN_URLS` | `turn:turn.skillswap.app:3478,turns:turn.skillswap.app:5349?transport=tcp,turns:turn.skillswap.app:443?transport=tcp` | Comma-separated, `turn:`/`turns:` only |
   | `TURN_SECRET` | `openssl rand -hex 32` | = coturn's `static-auth-secret`. **Server-side only** |
   | `TURN_REALM` | `turn.skillswap.app` | = coturn's `realm` |
   | `TURN_TTL_SECONDS` | `3600` | Must outlive a whole call |
   | `MAX_GROUP_CALL_PARTICIPANTS` | `4` | Group-call mesh cap |

3. Check the startup log for `[turn] TURN ephemeral (3 urls, ttl 3600s)`, and
   `GET /api/calls/ice-servers` (authenticated) for a minted credential.

Credentials are minted per request by the API
(`server/src/services/turn.service.ts`) using coturn's REST scheme
(`use-auth-secret`), and the client fetches them just before each call
(`client/src/lib/ice.ts`). Nothing secret is compiled into the bundle, so:

- rotating the relay secret does **not** require rebuilding the web app or the APK;
- a leaked credential expires within `TURN_TTL_SECONDS` instead of working forever;
- the fallback order is minted → `VITE_TURN_*` → Metered's legacy Open Relay →
  STUN only, and the last one is reported to the UI so the call overlay can explain
  why a call may not connect.

`VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` remain as an
optional escape hatch for providers that only issue static credentials (Xirsys,
Metered). They *are* inlined at build time — a redeploy is needed to change them,
and anyone can read them out of the bundle, which is why they are not the default
path any more.

### Group calls

Group calls run as a mesh (every participant opens a connection to every other),
which is why they are **capped** and **audio-first**:

- `MAX_GROUP_CALL_PARTICIPANTS` (default 4) is enforced in the socket layer.
  Invitees past the cap are dropped before being rung, the host is told with
  `capped: true` and `maxParticipants` in `group:call:started`, and a joiner racing
  past the cap gets `group:call:full`. The client mirrors the cap from
  `GET /api/calls/limits`, so the picker cannot select people who will never ring.
- A group call starts with microphones only. In a mesh, video costs `n-1` uploads
  per phone, which is the first thing to fail on mobile data. The camera button
  acquires a video track, adds it to every leg and renegotiates; switching it off
  stops the track (so Android's camera indicator goes out) and renegotiates again.
- Two people enabling cameras at once creates signalling glare; the local offer is
  rolled back and the remote one applied, per the polite-peer rule.

1:1 calls still offer voice and video explicitly, unchanged.

### Verifying it works

Test from two phones on **mobile data** — the same Wi-Fi hides the problem, because
a LAN needs no relay. On desktop Chrome, `chrome://webrtc-internals` should show a
`relay` candidate and a selected candidate pair that uses it. The
[Trickle ICE demo](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
with a hand-minted credential (recipe in `docs/TURN.md` §6) isolates the relay from
the app.

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