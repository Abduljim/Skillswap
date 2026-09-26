# Relay without a VPS — no card, no domain, no code change

`docs/TURN.md` covers running your own coturn on an Oracle VPS. That is the best
long-term answer (10 TB/month of egress) but it needs a server, a card for the
sign-up hold, and an afternoon.

This page is the other path: a **hosted** relay. No server to install, no ports to
open, no SSH, no domain, no credit card. You fill in a web form, copy two values
into Render, and calls work between two people on mobile data.

---

## 0. Read this first — it changes what you have to do

The app asks the server for relay configuration **at the moment a call starts**:

```
GET /api/calls/ice-servers   →  { iceServers, turnConfigured, mode, ttlSeconds }
```

`client/src/contexts/CallsContext.tsx` → `rtcConfig()` consumes that response.
Nothing relay-related is compiled into the APK (that is deliberate: `VITE_*`
values are readable by anyone who unpacks the app).

**So configuring a relay is an environment-variable change on Render. There is no
code change, no rebuild, and no new APK to distribute.** The 1.4 build already on
your phone starts relaying on the next deploy.

What a relay does and does not fix:

| Two people are… | Without any relay | With Metered configured |
| --- | --- | --- |
| on the same Wi-Fi / LAN | ✅ connects | ✅ connects |
| one on Wi-Fi, one on data | 🟡 usually connects | ✅ connects |
| on one phone's hotspot | ✅ connects | ✅ connects |
| **both on mobile data (CGNAT)** | ❌ rings, then the amber "no relay" line | ✅ **connects — this is what you are fixing** |

A relay is about *network path*, not about call size: 1:1 audio, 1:1 video and
group calls all need it in exactly the same situations. Removing group calls would
not have made 1:1 work on mobile data.

---

## 1. Option A — the free relay you can use today (no signup, no card, no code)

Metered publishes a **public** coturn REST-auth endpoint for their Open Relay
product, with the shared secret in their own docs:

```
host:   staticauth.openrelay.metered.ca
secret: openrelayprojectsecret
```

That is precisely the `use-auth-secret` scheme `server/src/services/turn.service.ts`
already implements — `username = "<expiry>:<realm>"`,
`credential = base64(HMAC-SHA1(secret, username))`. So the server can mint valid
credentials for it **as-is**, with no code change and no account.

Their published allowance for Open Relay is **20 GB of TURN traffic per calendar
month**, versus 500 MB for the premium trial tier in §2.

### Verified, not assumed

Tested from a clean Linux box with coturn's own client (`turnutils_uclient`),
minting the credential exactly the way `mintTurnCredential()` does:

| Candidate | Result |
| --- | --- |
| `turn:staticauth.openrelay.metered.ca:80?transport=tcp` | ✅ **`recv: Success`** — relay allocation granted |
| `turn:staticauth.openrelay.metered.ca:443?transport=tcp` | ✅ **`recv: Success`** — relay allocation granted |
| `turn:…:80` (UDP) | ⚠️ no reply from the test host (outbound UDP to :80 was blocked there; Google STUN on UDP/19302 answered, so the sandbox allowed UDP generally). Untested, kept as a candidate — real phones on real networks may well use it. |
| `turns:…:443?transport=tcp` (TLS) | ⚠️ TLS handshake failed *in the test tool* (`SSL routines::internal error`). Not proof the server is wrong — coturn's uclient is fussy about SNI. Add it later only if a specific network needs it. |

Reproduce it yourself:

```bash
sudo apt-get install -y coturn          # provides turnutils_uclient
U="$(python3 -c "
import hmac,hashlib,base64,time
u=f'{int(time.time())+3600}:skillswap'
print(u)")"
C="$(python3 -c "
import hmac,hashlib,base64,time
u=f'{int(time.time())+3600}:skillswap'
print(base64.b64encode(hmac.new(b'openrelayprojectsecret',u.encode(),hashlib.sha1).digest()).decode())")"
turnutils_uclient -v -n 1 -y -T -p 80 -u "$U" -w "$C" staticauth.openrelay.metered.ca
# expect: allocate sent / recv: Success
```

Note the realm half of the username is arbitrary — `skillswap` was accepted, so
`TURN_REALM` can stay as it is.

### The env vars for Render

| Key | Value |
| --- | --- |
| `TURN_URLS` | `turn:staticauth.openrelay.metered.ca:80,turn:staticauth.openrelay.metered.ca:80?transport=tcp,turn:staticauth.openrelay.metered.ca:443,turn:staticauth.openrelay.metered.ca:443?transport=tcp` |
| `TURN_SECRET` | `openrelayprojectsecret` |
| `TURN_REALM` | leave as is (`turn.skillswap.app`) |
| `TURN_TTL_SECONDS` | leave as is (`3600`) |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | leave **empty** — they are ignored whenever `TURN_SECRET` is set |

Because `TURN_SECRET` is set, `buildIceConfig()` returns `mode: "ephemeral"` and
each call gets a credential that expires an hour later. Nothing static reaches the
client.

Boot log should read:

```
📞 [turn] TURN ephemeral (4 urls, ttl 3600s)
```

### The honest caveat

`openrelayprojectsecret` is **published**, so you are sharing a pool with everyone
else who read that page — it is best-effort, not a private quota, and Metered can
rate-limit, rotate or retire it without notice. Their own docs still advertise it
as a supported product today, and it answered a real allocation request when
tested. Treat it as: *excellent for launch and testing, not a contract.*

If it ever degrades, the fallbacks are §2 (your own account) and §6 (bigger
providers). Moving to any of them is the same three env vars — no rebuild, ever.

---

## 2. Option B — your own free Metered account (private quota)

Sign up at **https://dashboard.metered.ca/signup?tool=turnserver** — email and
password, **no card**. You then get either of two free things:

### B1. The 500 MB premium trial — zero code

A private allocation of **500 MB of TURN usage per month**, renewed every month,
plus unlimited STUN and REST API access. Static username/credential pair:

| Key | Value |
| --- | --- |
| `TURN_URLS` | `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp` |
| `TURN_USERNAME` | *(from the dashboard: Static Credentials / Add New Credential)* |
| `TURN_CREDENTIAL` | *(from the dashboard)* |
| `TURN_SECRET` | **must be empty or deleted** — see the trap below |

> ### ⚠️ The one trap
> `buildIceConfig()` checks `TURN_SECRET` **first**. If it holds any value, the
> server mints coturn-style HMAC credentials, which a static-credential endpoint
> does not understand — **every allocation is rejected** and calls fail exactly as
> if nothing were configured. Option A wants `TURN_SECRET` set; Option B1 wants it
> empty. Never both.

### B2. Open Relay with your own API key — 20 GB/month, needs ~40 lines

The same 20 GB, but attributed to *your* account instead of the shared pool.
Credentials come from a REST call rather than being static:

```
GET https://<your-app-name>.metered.live/api/v1/turn/credentials?apiKey=<API_KEY>
    →  returns the iceServers array, geo-routed to the nearest relay
```

The server would call that (keeping the API key server-side), cache the result for
a few minutes, and hand it to clients through the existing
`GET /api/calls/ice-servers`. That is a small addition to `turn.service.ts` —
say the word and it gets written, tested and pushed. Do this when Option A shows
signs of strain, not before: it buys attribution, not more bandwidth.

---

## 3. How to add the variables in Render

1. **https://dashboard.render.com** → the **skillswap-api** web service.
2. Left sidebar → **Environment**.
3. **Add Environment Variable** for each key; paste the value on one line.
4. For Option B1, delete or clear any existing `TURN_SECRET` row.
5. **Save Changes** → Render redeploys automatically (2–4 min on the free plan).

Notes:

- Environment variables are per-service: **skillswap-api**, not a static site or
  the database.
- `TURN_URLS` must stay on **one line**. Spaces around commas are tolerated
  (`parseTurnUrls` trims); newlines are not.
- **Blueprint caveat:** `TURN_USERNAME` / `TURN_CREDENTIAL` have been added to
  `render.yaml` with `sync: false`, so a Blueprint sync will not overwrite the
  values you set here with empty placeholders. The dashboard remains the source of
  truth for them.
- Saved secrets display as `••••` afterwards. Normal, not an error.

---

## 4. Verify it took (≈2 min)

1. **Deploy log.** Render → skillswap-api → **Logs**. On boot the server prints one
   line from `describeTurnConfig()`:

   ```
   📞 [turn] TURN ephemeral (4 urls, ttl 3600s)     ← Option A, or coturn with TURN_SECRET
   📞 [turn] TURN static (4 urls, ttl 0s)            ← Option B1 (Metered static credentials)
   ```

   | What you see instead | What it means |
   | --- | --- |
   | `TURN not configured — calls need a direct route…` | `TURN_URLS` empty or not saved on this service |
   | `TURN urls set but no credentials — calls will fall back to direct/STUN only` | `TURN_USERNAME`/`TURN_CREDENTIAL` missing, **or** `TURN_SECRET` is set and the minting path is being used with the wrong scheme |
   | `TURN ephemeral` when you meant to use B1 | `TURN_SECRET` is still set from Option A — clear it, static credentials are ignored while it is |

2. **Real call test.** Two phones, **Wi-Fi off on both**, mobile data on. Call each
   other. Before this change you would get the amber *"No relay server is
   configured"* line; now it should connect. Check both directions of audio.
3. **Usage.** Metered dashboard → the project's usage/traffic graph shows MB per
   day. If a call connected and the counter moved, the relay is carrying it.
4. Optional API check from a logged-in browser session:
   `GET /api/calls/ice-servers` should return `"mode":"static"` and
   `"turnConfigured":true`.

---

## 5. What the allowance actually buys

Relayed traffic counts **ingress + egress**, so video is the expensive one. These
figures assume the worst case — a call that cannot find a direct path. When the
two phones are on the same Wi-Fi, the relay carries **nothing** and the call is
free of quota.

| Call | Relayed | 500 MB (B1) | **20 GB (A or B2)** |
| --- | --- | --- | --- |
| 1:1 audio, 5 min | ≈ 2–3 MB | ≈ 150–200 calls | ≈ **7,000–10,000 calls** |
| Group of 4, audio, 5 min | ≈ 12–15 MB | ≈ 30–40 calls | ≈ **1,300–1,600 calls** |
| 1:1 video, 5 min | ≈ 40–75 MB | ≈ 6–12 calls | ≈ **270–500 calls** |

So on 500 MB the relay is really a testing budget — audio is fine, video runs out
in an afternoon. On 20 GB it is a launch budget: a few hundred video calls and
thousands of audio calls a month, which is comfortably more than an early student
user base will consume.

What happens at the limit: with no card on file there is no overage bill. The
relay stops granting allocations, ICE falls back to direct/STUN, and calls behave
as they do today — working on Wi-Fi, showing the amber *"No relay server is
configured"* line when both peers are behind CGNAT. Nothing crashes; it degrades
to the pre-relay behaviour. The allowance then resets at the start of the next
month.

Ways to stretch any allowance:

- Groups already start audio-only (`groupCallsAudioFirst`, video opt-in per
  participant) — that is the single biggest saving, because mesh video is
  n·(n−1) streams.
- `MAX_GROUP_CALL_PARTICIPANTS=3` roughly halves a group call's relay traffic.
- Most campus calls never touch the relay at all.

---

## 6. While you are in the Render dashboard: `FCM_SERVICE_ACCOUNT_JSON`

Push is still waiting on this one variable — without it the server cannot send
call-ring notifications, so an incoming call only appears if the app is open.

1. Firebase console → your project (`skillswap-2459a`) → **Project settings** →
   **Service accounts** tab → **Generate new private key** → downloads a JSON file.
2. Add it to Render as `FCM_SERVICE_ACCOUNT_JSON` with the **entire file contents
   on a single line**.

   The `private_key` field contains `\n` escape sequences. **Keep them as literal
   `\n`** — do not let a text editor turn them into real line breaks, and do not
   pretty-print the JSON. If the value has real newlines, `JSON.parse` fails and
   `fcm.service.ts` silently skips sending: the API looks healthy and no push ever
   arrives. The parser needs `project_id`, `client_email` and `private_key`.
3. Save → redeploy → the boot log should no longer warn about FCM being
   unconfigured.
4. Confirm tokens are arriving: `select * from "PushToken";` in the Render
   Postgres shell, after opening the app on a phone and allowing notifications.

> **Adding the SHA-1 fingerprint to Firebase does not require a new APK.** FCM
> registration uses `google_app_id`, `project_number` and the API key, which are
> already compiled into build 1.4. Fingerprints matter for Google Sign-In,
> Firebase Auth and App Check. Re-download `google-services.json` and rebuild only
> when you add one of those.

---

## 7. If you outgrow it, in order

| Option | Cost | Allowance | Card? | Code? |
| --- | --- | --- | --- | --- |
| **Open Relay, public static-auth secret** (§1) | ₦0 | 20 GB/mo, shared pool | No | None |
| **Open Relay with your own API key** (§2 B2) | ₦0 | 20 GB/mo, yours | No | ~40 lines |
| Metered premium trial (§2 B1) | ₦0 | 500 MB/mo, yours | No | None |
| TurnWebrtc | ₦0 | ~5–10 GB/mo | No | None (static creds) |
| Metered Growth | $99/mo | 150 GB/mo + $0.40/GB | Yes | None |
| **Cloudflare Realtime TURN** | ₦0 | **1,000 GB/mo**, then $0.05/GB | **Yes — a payment method must be on file to enable it** | New provider scheme |
| Twilio Network Traversal | $15 trial credit | metered | Trial: no | Mint mode differs |
| **Self-hosted coturn, Oracle Always Free** | card hold at sign-up | **10 TB/mo** | Yes | None — it is the scheme already implemented |

Cloudflare's 1 TB free tier is the biggest hosted allowance by a long way and
`stun.cloudflare.com` is free and unlimited, but enabling Realtime requires
billing details even while you stay inside the free tier — worth revisiting if a
card ever becomes available, and skipped here for that reason.

Self-hosting coturn (§`TURN.md`) needs no new code either, because it uses the
same `use-auth-secret` REST scheme as Option A. Switching later is three env vars:
point `TURN_URLS` at your server, set `TURN_SECRET` to your `static-auth-secret`,
match `TURN_REALM`, and clear `TURN_USERNAME`/`TURN_CREDENTIAL`. The server
upgrades itself to ephemeral mode automatically — still no rebuild.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Boot log says `TURN not configured` | Keys not saved, or saved on the wrong service. Check skillswap-api → Environment. |
| Boot log says `urls set but no credentials` | `TURN_SECRET` is non-empty (ephemeral path) or the static pair is incomplete. |
| Log says `TURN static` but mobile-data calls still fail | Metered free tier exhausted or the project paused — check their usage page. Then test with one peer on Wi-Fi: if that works, the app is fine and the relay is the problem. |
| Calls work on data but not on a specific campus network | That network blocks UDP/3478 — make sure the `?transport=tcp` and `turns:…:443` entries are in `TURN_URLS`. |
| Rings but no audio after connecting | Usually a mic permission prompt dismissed on one side; on Android check Settings → Apps → SkillSwap → Permissions. |
| Amber "no relay" line in the app | Exactly the `turnConfigured: false` state — the server has no usable relay credentials. |
| Log says `TURN ephemeral` but mobile-data calls still fail | The public Open Relay secret may be rate-limited or rotated — re-run the `turnutils_uclient` test in §1. If allocation fails there too, switch to Option B1/B2 (your own account) or self-hosted coturn. |
| Calls relay fine for a while, then stop mid-month | Shared-pool exhaustion on Option A. Move to B2 (your own 20 GB) or a paid/self-hosted tier. |
| Allocation succeeds but media is one-way | Usually a permission or a firewall that permits TCP/80 but blocks the relay's UDP media range. Prefer the `?transport=tcp` candidates. |
