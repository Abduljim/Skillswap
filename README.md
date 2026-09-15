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

Subscriptions are stored per-user with platform (`WEB` or `ANDROID`), product ID, purchase token (Android), and an expiry date.

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
npm run migrate
npm run seed
```

### 5. Start development servers

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000

---

## Test Users (after seeding)

| Email                | Password    |
| -------------------- | ----------- |
| alice@example.com    | password123 |
| bob@example.com      | password123 |
| sarah@example.com    | password123 |
| david@example.com    | password123 |
| fatima@example.com   | password123 |
| emma@example.com     | password123 |
| james@example.com    | password123 |
| zainab@example.com   | password123 |

Alice is an admin. Log in, then go to **Membership** → upgrade to Pro to test the paid flow.

---

## Development Scripts

```bash
npm run dev          # run client + server
npm run build        # build both
npm run test         # run server tests
npm run migrate      # run Prisma migrations
npm run seed         # seed demo data
```

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
