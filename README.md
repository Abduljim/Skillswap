# SkillSwap

> **Trade what you know for what you want to learn.**

SkillSwap is a peer-to-peer skill exchange platform where students find other students who can teach skills they want to learn, while offering skills they can teach in return.

The matching engine is **deterministic** — no LLM, no AI APIs, no generative AI. Just clear scoring rules so every match can be explained.

---

## Features

- 🔐 Email + password authentication with HTTP-only cookies
- 👤 Rich profiles with skills, availability, and ratings
- 🎯 Reciprocal skill matching (deterministic, explainable scores)
- 💌 Exchange requests (send / accept / reject / cancel)
- 🤝 Exchange workspaces with real-time chat (Socket.IO)
- 📅 Session scheduling
- ⭐ Reviews and reputation
- 🔔 Notifications
- 🛡️ Blocking and reporting
- 🛠️ Admin dashboard
- 💎 **Pro membership** with visibility boost, "who viewed me" insights, and unlimited exchanges
- 📱 **Android app** via Capacitor with native Google Play Billing integration
- 🌐 Mobile-first responsive design

---

## Tech Stack

| Layer       | Tech                                                |
| ----------- | --------------------------------------------------- |
| Frontend    | React, Vite, TypeScript, Tailwind, React Router     |
|             | TanStack Query, React Hook Form, Zod                |
| Backend     | Node.js, Express, TypeScript, REST                  |
| Realtime    | Socket.IO                                           |
| Database    | PostgreSQL + Prisma                                 |
| Auth        | bcrypt + JWT (HTTP-only cookies)                    |
| Validation  | Zod                                                 |
| Billing     | Google Play Billing (Android) + web dev upgrade     |
| Mobile      | Capacitor 6 + custom Play Billing bridge            |
| Tests       | Jest + Supertest                                    |

---

## Membership tiers

**Free**
- Up to 3 pending requests
- Up to 5 active exchanges
- Browse + match

**Pro ($4.99/mo or $49/yr)**
- Unlimited requests + exchanges
- Boost your visibility for 1 hour
- See who viewed your profile
- Pro badge on your profile and match cards

Subscriptions are stored per-user with platform (`WEB` or `ANDROID`), product ID, purchase token (Android), and an expiry date. Admins always get Pro.

Both caps are enforced server-side: the 3-request limit in `createExchangeRequest`,
and the 5-exchange limit in `acceptRequest` (an active exchange counts against
**both** members, so accepting is refused if either side is at their cap).

---

## Billing & entitlements

There is **no web payment provider** (no Stripe/Paystack). Two purchase paths exist:

| Path | Endpoint | Verification |
| --- | --- | --- |
| Android | `POST /api/subscription/android` | Google Play Developer API, via `playBillingVerifier` |
| Web (development only) | `POST /api/subscription/web` | none — grants PRO immediately |

Because the web path charges nothing, it is **refused in production** unless an
operator opts in explicitly:

```bash
ENABLE_WEB_BILLING=false   # production default: POST /api/subscription/web → 403
ENABLE_WEB_BILLING=true    # opt in (Pro becomes free for anyone with a cookie)
```

Android purchases fail closed as well. With `PLAY_BILLING_VERIFY` unset or `false`,
a production server **rejects** every purchase rather than trusting the
`purchaseToken` — otherwise any client could mint PRO with
`{"productId":"…","purchaseToken":"anything"}`. To accept real purchases:

```bash
PLAY_BILLING_VERIFY=true
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='{…service account key…}'
ANDROID_PACKAGE_NAME=app.skillswap.client
```

Outside production both paths stay permissive so the paywall UI can be exercised.
The boot log prints the effective billing configuration on every start.

---

## Security notes

- **CORS** — explicit allowlist (`allowedOrigins` in `server/src/config/env.ts`), never a reflected wildcard, because the auth cookie is sent with `credentials: true`. The Capacitor WebView origins (`https://localhost`, `capacitor://localhost`) are always allowed. `CLIENT_URL='*'` means "not configured", not "allow everything"; list real domains comma-separated, or use `EXTRA_ALLOWED_ORIGINS`.
- **Session revocation** — `User.tokenVersion` is embedded in every JWT and checked by `requireAuth`, `optionalAuth` and the Socket.IO handshake. It is bumped on logout, password change, password reset and admin deactivation, so a token that leaks (it is also returned in the response body for the native socket handshake) cannot be replayed for the full 365-day lifetime.
- **Passwords** — bcrypt cost 10. Login returns one message for "no such user" and "wrong password".
- **Rate limiting** — global limiter plus a stricter 20-per-15-min limiter on the auth endpoints. Skipped under `NODE_ENV=test` so suites stay deterministic.
- **Admin** — `requireAuth` + `requireAdmin`, which re-reads `isAdmin` from the database on every request, so a demotion takes effect immediately.

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm 9+
- *(For Android)* Android Studio, JDK 17, Google Play Console account

---

## Setup

### 1. Install PostgreSQL

```bash
# macOS
brew install postgresql
brew services start postgresql
createdb skillswap

# Ubuntu
sudo apt install postgresql
sudo -u postgres createuser -s skillswap
sudo -u postgres createdb skillswap -O skillswap
```

### 2. Configure environment

```bash
cp .env.example .env
# edit .env and set DATABASE_URL and JWT_SECRET
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run migrations & seed

```bash
npm run migrate          # create + apply migrations while developing
npm run migrate:deploy   # apply pending migrations (baselines a db-push database first)
npm run seed             # upsert the skill catalogue (287 skills / 14 categories)
```

The schema is version-controlled in `server/prisma/migrations/`. `migrate:deploy`
first runs `scripts/ensure-migrations.js`, which records the baseline migration on
any database that was originally created with `prisma db push` — so deploying to an
existing production database is a no-op instead of a destructive re-sync.

`prisma db push --accept-data-loss` must never be run against a database that holds
real user data.

> The Prisma CLI and the standalone scripts read the **repository root** `.env`.
> `scripts/load-env.js` handles that for you, so `npm run seed` and
> `npm run migrate` work on a fresh clone without exporting anything.

### 5. Start development servers

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000

---

## First account & admin access

There are **no demo accounts** — the seed ships the skill catalogue only, and it
permanently removes the placeholder accounts (`alice@example.com`, …) from older
releases. The app starts empty; only real sign-ups create users.

Admin is bootstrapped from the environment: set `ADMIN_EMAIL` and the matching
account is promoted on sign-up, on login, and on every deploy.

```bash
ADMIN_EMAIL=you@example.com   # in .env (local) or the Render dashboard
```

To exercise Pro locally, sign in and open **Membership** → upgrade. That uses the
no-payment development path described in [Billing](#billing--entitlements).

---

## Development Scripts

```bash
npm run dev               # run client + server
npm run build             # build both
npm run test              # run the server test suite (unit + integration)
npm run migrate           # create + apply a migration while developing
npm run seed              # upsert the skill catalogue
```

Server-only scripts (`cd server`):

```bash
npm run test:db:prepare   # push the schema to TEST_DATABASE_URL before integration tests
npm run test:integration  # prepare the test DB, then run the suite
npm run migrate:deploy    # baseline (if needed) + apply pending migrations
npm run db:baseline       # record the baseline migration on a db-push database
npm run lint              # tsc --noEmit
npm run build:prod        # esbuild bundle for Render (dist/index.js + dist/catalogue.js)
```

### Tests

Jest + Supertest. The suite runs against a **real PostgreSQL test database**
(`TEST_DATABASE_URL`) for the integration tests — no mocking of the data layer:

```
tests/matching.test.ts                  match scoring rules
tests/matching-edge-cases.test.ts       exclusions, blocks, inactive users
tests/entitlements.test.ts              FREE vs PRO limits
tests/subscription-products.test.ts     product catalogue
tests/password-reset.test.ts            reset tokens + email (mocked transport)
tests/integration/session-revocation.test.ts   logout / password change / deactivation
tests/integration/billing-gates.test.ts        production refusals for free Pro
tests/integration/cors.test.ts                 origin allowlist
tests/integration/entitlements-limits.test.ts  3-request and 5-exchange caps, end to end
```

ts-jest runs transpile-only (`tsconfig.test.json`); type-checking the generated
Prisma client plus `googleapis` pushed the runner past 900 MB and OOM-killed it.
Types are still checked by `npm run lint`.

### Android scripts

```bash
cd client
npm run cap:sync        # build web + sync into android/
npm run cap:open        # open Android Studio
npm run android:build   # build release APK
```

See **[docs/ANDROID.md](docs/ANDROID.md)** for the full Android + Play Billing setup guide.

---

## API Overview

See `server/src/routes/` for the full REST surface. Key resources:

- `/api/auth/*` — auth
- `/api/profile` — current profile
- `/api/users/*` — user discovery & profiles
- `/api/skills/*` — skill catalogue
- `/api/matches` — reciprocal matches (with Pro boost sort)
- `/api/exchange-requests/*` — request lifecycle
- `/api/exchanges/*` — active exchanges
- `/api/notifications/*` — notifications
- `/api/reports`, `/api/users/:id/block` — safety
- `/api/admin/*` — admin only
- `/api/subscription/*` — Pro membership, billing, restore, cancel
- `/api/boost` — activate visibility boost (Pro)
- `/api/profile-views` — see profile viewers (Pro)

---

## Architecture

```
skillswap/
├── client/                  # React + Vite frontend
│   ├── android/             # Capacitor Android project + Play Billing bridge
│   ├── capacitor.config.json
│   └── src/
│       ├── pages/           # route components
│       ├── components/      # reusable UI (+ PaywallModal)
│       ├── contexts/        # auth + toast
│       ├── lib/             # api client + billing bridge
│       └── types/
├── server/                  # Express + Prisma backend
│   ├── prisma/             # schema + seed + migrations
│   ├── src/
│   │   ├── routes/
│   │   ├── services/       # matching, subscriptions, entitlements, billing
│   │   ├── middleware/
│   │   ├── validators/
│   │   └── sockets/
│   └── tests/
├── shared/                 # shared types
├── docs/ANDROID.md
└── package.json            # workspace orchestrator
```

---

## License

MITcp client/.env.production.example client/.env.production
