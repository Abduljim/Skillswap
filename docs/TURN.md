# TURN relay for calls — self-hosting coturn for free

Calls in SkillSwap are WebRTC. Signalling goes through the API over Socket.IO, but
the **audio and video travel peer to peer** — except when it cannot, which on
mobile data is most of the time.

Two phones behind carrier-grade NAT (CGNAT) have no public address to be reached
at. STUN tells each phone what its own address *looks like* from outside, but with
CGNAT that address belongs to the carrier's NAT, not to the phone, so neither side
can dial the other. The only way through is a **relay**: a public server both
phones connect *out* to, which then forwards media between them. That server is
TURN.

Without it the failure looks like this: the call rings, both sides answer, the UI
shows "connected", and nobody hears anything. This guide removes that failure for
£0/$0 a month.

```
   Phone A ──┐                          ┌── Phone B
             │  (both behind CGNAT,     │
   Phone A ──┼──► TURN relay (your VPS) ◄┼── Phone B
             │      forwards media)     │
```

---

## 1. What the app expects

The API mints a short-lived relay credential per signed-in user and the app fetches
it just before every call:

| Endpoint | What it returns |
| --- | --- |
| `GET /api/calls/ice-servers` | `{ iceServers, turnConfigured, mode, ttlSeconds }` — STUN always, plus a TURN entry with a freshly minted username/credential |
| `GET /api/calls/limits` | `{ maxGroupCallParticipants, groupCallsAudioFirst }` — the group-call cap the UI enforces |

Both require authentication: an anonymous caller must not be able to collect relay
credentials and spend your bandwidth.

The credential is coturn's REST scheme (`use-auth-secret`), implemented in
`server/src/services/turn.service.ts`:

```
username   = "<unix expiry>:<realm>"
credential = base64(HMAC-SHA1(static-auth-secret, username))
```

coturn recomputes that HMAC and rejects the allocation once the expiry passes.
Nothing is stored server-side, and **the secret never reaches the client** — which
is the whole point. A `VITE_TURN_CREDENTIAL` baked into the web bundle or the APK
can be read by anyone who unpacks it, and they can then relay their own traffic on
your account.

Three modes, chosen automatically by what you configure:

| Mode | Trigger | Behaviour |
| --- | --- | --- |
| `ephemeral` | `TURN_URLS` + `TURN_SECRET` | Credentials minted per request. **This is the one to use.** |
| `static` | `TURN_URLS` + `TURN_USERNAME` + `TURN_CREDENTIAL`, no secret | Shared credentials handed to every client. For providers without HMAC support (Xirsys, Metered). |
| `none` | no usable TURN config | STUN only. Calls work on the same LAN or a permissive NAT; the UI says so instead of pretending. |

The client caches a minted credential and refreshes it at 80% of its lifetime, so a
long call is not cut off by an expiring credential (`client/src/lib/ice.ts`). If the
API is slow or unreachable it falls back to `VITE_TURN_*`, then to Metered's legacy
Open Relay, then to STUN alone — a call is always *attempted*.

---

## 2. Getting a free server

You need a small Linux VPS with a **public IP** and generous outbound bandwidth.
Oracle Cloud's Always Free tier is the best fit:

| Always Free (2026) | Limit |
| --- | --- |
| Ampere A1 (ARM) compute | 2 OCPUs / 12 GB RAM — reduced from 4/24 in June 2026, still far more than coturn needs |
| AMD micro instances | 2 × (1/8 OCPU, 1 GB) — also fine for coturn |
| Outbound data | **10 TB/month**, inbound unlimited |
| Block storage | 200 GB |

coturn is I/O bound, not CPU bound: one OCPU relays hundreds of concurrent calls.
The number that matters is the 10 TB of egress, which no other free tier comes
close to (AWS 100 GB, GCP 200 GB, Azure 15 GB).

Two honest caveats about Always Free:

- **Capacity.** ARM shapes are frequently "out of host capacity" in popular regions
  (US East/Ashburn, Mumbai). Try a less busy home region, or the AMD micro shape,
  and retry at odd hours.
- **Idle reclaim.** Oracle reclaims Always Free instances that sit idle (roughly
  <10% CPU *and* <10% network for 7 days). A quiet TURN server can be reclaimed.
  Upgrading the account to Pay As You Go (still $0 while inside Always Free limits)
  disables the reclaim — do this if the calls matter to you.

### 2.1 Create the instance

1. oracle.com/cloud → **Sign up** (card required, not charged for Always Free).
2. **Compute → Instances → Create instance**.
   - Image: **Ubuntu 24.04 (aarch64)** or **Canonical Ubuntu 22.04 Minimal**.
   - Shape: **Ampere A1 Flex**, 1 OCPU / 6 GB (or an AMD E2.1.Micro).
   - Networking: create a new VCN, **assign a public IPv4 address**.
3. Add your SSH public key, then create.
4. Note the **public IP** (e.g. `140.245.10.20`) and the **private IP** shown on
   the instance page (e.g. `10.0.0.123`). You need both — see §4.

Pick a hostname for the relay, e.g. `turn.skillswap.app`, and point an **A record**
at the public IP now (DNS needs time to propagate before the TLS step).

---

## 3. Open the ports — twice

This is the single most common reason a fresh coturn install "doesn't work". Oracle
filters traffic in **two independent places**, and both must allow it:

1. the VCN **security list** (cloud firewall, outside the VM), and
2. the **iptables/nftables** rules inside Ubuntu's image.

### 3.1 VCN security list (OCI console)

**Networking → Virtual cloud networks → your VCN → Subnet → Security list → Add
ingress rules.** One rule each:

| Stateless | Source | Protocol | Ports |
| --- | --- | --- | --- |
| no | `0.0.0.0/0` | UDP | 3478 |
| no | `0.0.0.0/0` | TCP | 3478 |
| no | `0.0.0.0/0` | TCP | 5349 |
| no | `0.0.0.0/0` | TCP | 443 |
| no | `0.0.0.0/0` | UDP | 49152-49300 |
| no | `0.0.0.0/0` | TCP | 80 *(only while issuing/renewing the certificate)* |

Why each one: **3478** is standard TURN (UDP for media, TCP for networks that block
UDP). **5349** is TURNS (TURN over TLS). **443** as an alternate TLS listener gets
through the most restrictive networks, because blocking 443 means blocking the web.
**49152-49300** is the relay port range where the actual media is forwarded.
**80** is Let's Encrypt's HTTP challenge.

### 3.2 Inside the VM

Ubuntu images on OCI ship with iptables rules that drop everything but SSH:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3478 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 3478 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5349 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 49152:49300 -j ACCEPT
sudo apt-get install -y netfilter-persistent
sudo netfilter-persistent save
```

Check with `sudo iptables -L INPUT -n --line-numbers`.

---

## 4. Install coturn

```bash
sudo apt-get update
sudo apt-get install -y coturn certbot
```

Generate the shared secret — this is the value that goes into `TURN_SECRET` on
Render, and it is the only secret in this whole setup:

```bash
openssl rand -hex 32
# e.g. 9f1c4b7e2a6d48f0b3c5e7a9d1f3b5c7e9a1c3d5e7f9a1b3c5d7e9f1a3b5c7d9
```

Write `/etc/turnserver.conf` (replace the IPs, the realm and the secret):

```ini
# ── Listeners ────────────────────────────────────────────────────────────────
listening-port=3478
tls-listening-port=5349
# Reachable through networks that block 3478 and 5349 outright.
alt-tls-listening-port=443

# OCI gives the instance a private IP and 1:1 NATs the public one. Without
# external-ip, coturn advertises the PRIVATE address in its relay candidates and
# every call fails to connect even though the service looks healthy.
listening-ip=10.0.0.123
external-ip=140.245.10.20/10.0.0.123

# ── Authentication: the REST scheme the API mints credentials for ────────────
use-auth-secret
static-auth-secret=9f1c4b7e2a6d48f0b3c5e7a9d1f3b5c7e9a1c3d5e7f9a1b3c5d7e9f1a3b5c7d9
# MUST equal TURN_REALM on Render: coturn checks the realm half of the username.
realm=turn.skillswap.app

# ── Abuse limits ─────────────────────────────────────────────────────────────
# Per-user and total concurrent allocations. A mesh group call of 4 uses 3 per
# participant, so 12 per user is generous for a human and expensive for a bot.
user-quota=12
total-quota=200
# Reject allocations to private ranges: a relay that will forward to 10.x/192.168.x
# is a way into your own network.
no-loopback-peers
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255

# ── Relay ports: must match the UDP range opened in §3 ───────────────────────
min-port=49152
max-port=49300

# ── TLS ──────────────────────────────────────────────────────────────────────
cert=/etc/coturn/certs/turn.crt
pkey=/etc/coturn/certs/turn.key
cipher-list="ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256"

# ── Housekeeping ─────────────────────────────────────────────────────────────
fingerprint
stale-nonce=600
proc-user=turnserver
proc-group=turnserver
log-file=/var/log/turnserver.log
simple-log
# No telnet admin port.
no-cli
```

Ubuntu ships coturn **disabled**. Turn it on:

```bash
sudo sed -i 's/^#*TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable coturn
```

### 4.1 TLS certificate

```bash
sudo certbot certonly --standalone -d turn.skillswap.app --agree-tos -m you@example.com
```

`--standalone` needs port 80 free, so stop coturn first if it is already running
(`sudo systemctl stop coturn`), then start it again afterwards.

coturn runs as the unprivileged `turnserver` user and cannot read
`/etc/letsencrypt`, so copy the certificates somewhere it can:

```bash
sudo mkdir -p /etc/coturn/certs
sudo tee /etc/letsencrypt/renewal-hooks/deploy/coturn.sh >/dev/null <<'SH'
#!/bin/sh
set -e
cp -L /etc/letsencrypt/live/turn.skillswap.app/fullchain.pem /etc/coturn/certs/turn.crt
cp -L /etc/letsencrypt/live/turn.skillswap.app/privkey.pem   /etc/coturn/certs/turn.key
chown root:turnserver /etc/coturn/certs/turn.crt /etc/coturn/certs/turn.key
chmod 640 /etc/coturn/certs/turn.key
systemctl restart coturn
SH
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
sudo /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
```

That hook runs on every renewal, so certificates never silently expire (certbot's
timer renews automatically; verify with `sudo certbot renew --dry-run`).

Then start it:

```bash
sudo systemctl restart coturn
sudo systemctl status coturn --no-pager
sudo ss -lntup | grep -E '3478|5349|443'
```

---

## 5. Wire it into the deployment

On Render → **skillswap-api → Environment**, set:

| Key | Value | Notes |
| --- | --- | --- |
| `TURN_URLS` | `turn:turn.skillswap.app:3478,turns:turn.skillswap.app:5349?transport=tcp,turns:turn.skillswap.app:443?transport=tcp` | Comma-separated. Include at least one `turn:` (UDP) and one `turns:` (TLS) entry — restrictive networks block one or the other. |
| `TURN_SECRET` | the `openssl rand -hex 32` value | Must equal coturn's `static-auth-secret`. Server-side only. |
| `TURN_REALM` | `turn.skillswap.app` | Must equal coturn's `realm`. |
| `TURN_TTL_SECONDS` | `3600` | Credential lifetime. Must outlive a whole call, because coturn re-checks it on every allocation refresh. |
| `MAX_GROUP_CALL_PARTICIPANTS` | `4` | Mesh cap, enforced by the socket layer and published to the UI. |

Save → Render redeploys. **No client rebuild is needed**: the app fetches
credentials at runtime, which is exactly why they are not compiled in.

`VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` are now an
optional escape hatch only (providers without HMAC support, or an API that
predates the endpoint). Leave them empty — and note they *are* baked into the
bundle at build time, so a redeploy is required to change them and anyone can read
them.

### Verify

The startup log prints one line describing the relay, and deliberately never prints
the secret:

```
[turn] TURN ephemeral (3 urls, ttl 3600s)
```

If you see `TURN not configured` or `TURN urls set but no credentials`, the env
vars did not take.

Then check the minted credential from your machine:

```bash
API=https://skillswap-api-dcg8.onrender.com
curl -s -c /tmp/ss.txt -X POST "$API/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}' >/dev/null
curl -s -b /tmp/ss.txt "$API/api/calls/ice-servers" | jq
curl -s -b /tmp/ss.txt "$API/api/calls/limits" | jq
```

Expect `"mode": "ephemeral"`, `"turnConfigured": true`, a `stun:` entry with no
credentials, and a `turn:`/`turns:` entry whose username looks like
`1790000000:turn.skillswap.app`.

---

## 6. Test the relay itself

Mint a credential by hand — the same arithmetic the API does — and try it in the
[Trickle ICE demo](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/):

```bash
SECRET='9f1c4b7e…'          # your static-auth-secret
REALM='turn.skillswap.app'
EXPIRES=$(( $(date +%s) + 3600 ))
USERNAME="${EXPIRES}:${REALM}"
CREDENTIAL=$(printf '%s' "$USERNAME" | openssl dgst -sha1 -hmac "$SECRET" -binary | base64)
echo "$USERNAME"
echo "$CREDENTIAL"
```

Paste `turn:turn.skillswap.app:3478` (and the `turns:` entries) with that
username/credential and click **Add Server → Gather candidates**. You want to see
at least one candidate of type **`relay`**, with `raddr 0.0.0.0`. Only `host` and
`srflx` candidates means the relay is not working — see the troubleshooting table
below.

This also proves the format matches: if the hand-made credential works and the
API's does not, `TURN_SECRET`/`TURN_REALM` disagree with coturn's config.

Finally, the test that matters: **two real phones, both on mobile data** (not the
same Wi-Fi), one calling the other. Then a group call with three people.

---

## 7. Capacity, cost and why group calls are capped

Relayed media costs bandwidth on your VPS, and a mesh group call multiplies it:
*n* participants each upload a copy of their stream to every other participant, so
there are `n × (n-1)` one-way legs.

| Call | Relayed data, 5 minutes |
| --- | --- |
| 1:1 audio | ~2 MB total |
| 1:1 video | 50–150 MB |
| 4-person group, audio | ~6 MB per participant (~24 MB through the relay) |
| 4-person group, video | 150–450 MB per participant |

That table is the reason for the two group-call decisions in this codebase:

- **Audio-first.** A group call starts with microphones only. Video is opt-in per
  participant — the camera button acquires a track, adds it to every mesh leg and
  renegotiates. Nobody pays for `n-1` video uploads they did not ask for.
- **Capped at 4** (`MAX_GROUP_CALL_PARTICIPANTS`). Beyond that, a phone's uplink,
  not the relay, is what fails: at 5 people each phone uploads 4 audio streams and
  decodes 4 more. Invitees past the cap are dropped before being rung, and the host
  is told via `capped` in `group:call:started`, so nobody watches an invitation
  silently vanish.

At 10 TB/month of free egress you can relay on the order of **80,000 five-minute
audio calls a month**. Group video is what would eat it, which is another argument
for audio-first.

If you outgrow a mesh, the answer is not a bigger cap — it is an **SFU** (each phone
sends one stream to a server that fans it out: LiveKit, mediasoup, Jitsi Videobridge).
That is a different architecture; the cap constant is where the current one is
documented.

---

## 8. Operations

**Logs.** `sudo tail -f /var/log/turnserver.log`. Allocations show the username, so
you can see whose credential is being used. `simple-log` keeps it to one file; add
logrotate if it grows (coturn's Debian package installs a rotation config already —
check `/etc/logrotate.d/coturn`).

**Rotating the secret.** Generate a new one, put it in coturn's
`static-auth-secret`, restart coturn, then update `TURN_SECRET` on Render. Order
matters: updating Render first would mint credentials the relay rejects. Clients
holding the old credential keep working until it expires (≤ `TURN_TTL_SECONDS`), so
do it during a quiet hour and expect no downtime longer than the restart.

**Restarting.** `sudo systemctl restart coturn` — in-flight allocations drop, so
active calls fall back to a direct route or end.

**Watching it.** Oracle's monitoring shows instance CPU/network. A sudden jump in
egress that does not match your user count means someone is using the relay for
their own traffic; check the log for unfamiliar usernames and confirm
`use-auth-secret` is on (it is what makes credentials expire).

**Backups.** Nothing here holds state. The whole setup is one config file plus a
certificate; keeping `turnserver.conf` in a private note is enough to rebuild the
relay on a new instance in about ten minutes.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Call rings, connects, no audio, both on mobile data | No relay configured, or the relay is unreachable | Check the startup log line; run §6 |
| Trickle ICE shows only `host`/`srflx` candidates | Ports not open in **both** places, or coturn not running | §3.1 + §3.2, `systemctl status coturn` |
| `relay` candidates appear but carry a `10.x` address | Missing `external-ip` (OCI NAT) | §4 `external-ip=<public>/<private>` |
| `401 Wrong credentials` in the coturn log | `TURN_SECRET`/`TURN_REALM` disagree with `static-auth-secret`/`realm` | §5 table; re-run §6 by hand |
| API returns `"mode": "static"` though you set a secret | `TURN_SECRET` is empty or not saved on Render | Re-save and redeploy |
| API returns `"mode": "none"` though `TURN_URLS` is set | URLs present but no credentials — deliberately reported as unusable | Set `TURN_SECRET` (or the static pair) |
| `TURN_URLS` set, still `none` | URLs that are not `turn:`/`turns:` are filtered out | Keep only TURN schemes in that variable |
| Works on Wi-Fi, fails on mobile data | Expected without a relay: Wi-Fi NAT is often permissive, CGNAT is not | §1–§5 |
| Group call rings only some invitees | The cap dropped the extras | Look for `capped` handling; raise `MAX_GROUP_CALL_PARTICIPANTS` if your users are on good networks |
| TLS listener rejected, plain 3478 works | Certificate unreadable by `turnserver`, or expired | §4.1 hook, `sudo certbot renew --dry-run` |
| Everything worked, then stopped after a week | Oracle reclaimed an idle Always Free instance | Convert to Pay As You Go, or use the AMD micro shape |

---

## 10. Alternatives if you would rather not run a server

| Option | Cost | Fits this setup? |
| --- | --- | --- |
| **Self-hosted coturn** (this guide) | $0 + 10 TB egress | Yes — `ephemeral` mode, secret stays on your server |
| **Cloudflare TURN** | $0.05/GB, anycast, no ports to manage | Yes — supports the same REST scheme, so `TURN_SECRET` works unchanged |
| **Metered / Twilio / AWS** | per GB, free tiers small | Yes, via `static` mode (`TURN_USERNAME` + `TURN_CREDENTIAL`) |
| **Xirsys, ExpressTURN** | free tiers | Yes, `static` mode |
| **Metered Open Relay** (`openrelayproject`) | free, rate-limited, deprecated | Last-resort fallback only; already wired in as the final client fallback |

Managed providers that only issue static credentials are the weaker option: those
credentials ship inside the APK. If you use one, prefer a provider with per-key
quotas so a leaked key costs you a capped amount, and rotate it when you ship a new
build.

---

## Related

- `docs/DEPLOY.md` — Render environment variables, migrations, and the rest of the deploy
- `docs/ANDROID.md` §5 — production API URL and the mobile build
- `server/src/services/turn.service.ts` — the minting logic and the mode selection
- `server/tests/turn-service.test.ts` — recomputes the HMAC to prove the format
- `client/src/lib/ice.ts` — caching, timeout and fallback chain
