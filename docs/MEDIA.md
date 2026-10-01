# Chat media storage (video, photos and voice notes)

SkillSwap v1.6 can **record and send video** in a chat, with a Standard/HD choice
and a 60-second cap. v1.11 adds **voice notes**. Both need somewhere to live that
is not your database.

**Why not the database?** Photos are currently base64 text inside the Postgres
row. That survives a 300 KB JPEG, but it cannot survive video — and it has a
deadline you should know about either way:

> Render's **free** Postgres instance is **512 MB** and is **deleted 90 days
> after it was created** (not 90 days after last use) unless you upgrade to the
> paid tier. That applies to your users, chats, matches and reviews, not just to
> media. Check the date your `skillswap-db` was created in the Render dashboard
> and plan for it — see [Your database has an expiry date](#your-database-has-an-expiry-date) below.

So media goes to **Supabase Storage**: free, **no card required**, 1 GB stored
and 5 GB served per month. The database then holds only a URL.

---

## What to do (about 10 minutes, no card)

### 1. Create a Supabase account

1. Go to <https://supabase.com/dashboard/sign-up> and sign up with **GitHub**
   (fastest — no email verification loop).
2. Click **New project**.
3. Fill in:
   - **Name:** `skillswap`
   - **Database Password:** click *Generate a password* and **save it somewhere**
     (you will not need it for SkillSwap, but Supabase will ask for it later if
     you ever connect a database tool).
   - **Region:** pick **US West (Oregon)** — that is where your Render service
     and database live, so uploads do not cross continents.
   - **Plan:** **Free**.
4. Click **Create new project** and wait ~2 minutes for it to provision.

### 2. Create the bucket

> [`supabase-setup.sql`](../supabase-setup.sql) covers steps 2 and 2b, but its two
> halves run in different places: the bucket comes from the dashboard (or the
> Storage API on your own machine — Supabase's hosted Postgres cannot shell out),
> while the policies are pasted into the SQL Editor.

1. In the left sidebar click **Storage** (the box icon).
2. Click **New bucket**.
3. **Name:** `skillswap-media`
   (If you use a different name, set `SUPABASE_MEDIA_BUCKET` to match.)
4. Turn **Public bucket** ON.
   > This is deliberate. Chat history needs URLs that keep working next month;
   > Supabase's *signed* read URLs expire (after an hour by default), which
   > would break every older message. Access control here is the unguessable
   > UUID in the path — the bucket is never listed anywhere, and the server
   > generates the paths, so a client cannot point one at someone else's file.
5. Optional but sensible: in the bucket's **Settings**, set **File size limit**
   to `64 MB` (the same ceiling the API enforces).
6. Click **Create bucket**.

### 2b. Install the storage policies — required, or every upload 403s

**"Public bucket" only controls reads.** Storage keeps object metadata in the
row-level-security-protected table `storage.objects`, and an upload runs
`INSERT … RETURNING *`. With no policies at all, every signed upload fails with:

    403 {"statusCode":"403","error":"new row violates row-level security policy"}

— even though the token is valid, the bucket is public, and the request is
authenticated correctly. This was verified against a live project, and it is not
caused by `x-upsert`: turning that header off changes nothing.

Fix: Supabase dashboard → **SQL Editor** → paste **PART 2** of
[`supabase-setup.sql`](../supabase-setup.sql) → **Run**. It creates two policies:

| Policy | Grants | Scope |
|---|---|---|
| `skillswap media insert` | `INSERT` | this bucket only, and only the exact `<kind>/<8 hex of sender>/<date>/<uuid>.<ext>` path the API generates |
| `skillswap media read` | `SELECT` | this bucket only (the upload needs it for the `RETURNING *` clause) |

Nothing can be written under a different name, into a different bucket, or over
an existing object — each upload gets a fresh server-generated UUID path, and
`/api/media/confirm` refuses any path the server never issued.

The honest trade-off is written into `supabase-setup.sql` rather than left
implicit: the publishable key is public by design and ships inside the app, so
someone holding it can upload a file that *looks* like SkillSwap media without
going through the API. They cannot read anything the public bucket does not
already expose and cannot overwrite anything. The optional `file_size_limit` /
`allowed_mime_types` statements at the bottom of that script cap the surface
further; enable them once video messages are confirmed working, so a failure
during setup has only one possible cause.


### 3. Copy the two values

1. Left sidebar → **Project Settings** (the gear) → **API Keys**.
   You will see two tabs:
   - **Publishable and secret API keys** ← use this one
   - **Legacy anon, service_role API keys** ← ignore it
2. Your **Project URL** is `https://<your-project-ref>.supabase.co`. The project
   ref is the string in your dashboard address bar between `/project/` and
   `/settings`, so if the dashboard says
   `.../project/abcdefghijklm/settings/api-keys` then
   `SUPABASE_URL=https://abcdefghijklm.supabase.co`.
   (It is also shown as **Project URL** / **API** on the same settings page.)
3. On the **Publishable and secret API keys** tab, find the key labelled
   **Secret** — it starts with `sb_secret_` — click **Reveal** then **Copy**.
   → that value is `SUPABASE_SERVICE_ROLE_KEY`

   The variable keeps its old name so an existing deployment does not have to be
   renamed, but the *value* is the new-format secret key. `SUPABASE_SECRET_KEY`
   is accepted as an alias if you prefer the modern name.

   If your project is old enough to only offer the legacy tab, copy the
   `service_role` JWT instead — the server sends both an `apikey` and an
   `Authorization` header, so either key format works.
4. Nothing else is needed from this page. In particular, **do not** add the
   Publishable (`sb_publishable_...`) key: the upload leg is authorised entirely
   by the single-use token in the signed URL, so no API key of any kind travels
   to the phone. An earlier version of this guide asked for it, because a bug in
   the upload verb made Supabase answer as if no token had been sent — see
   *"Upload succeeds but the video never arrives"* below.

   Both values are required. `GET /api/media/status` reports
   `"configured": false` plus a `missing` list naming any that are absent, so a
   half-finished setup tells you exactly which one you forgot.

> ⚠️ **The secret key goes on the server only.** Never into the app, the web
> bundle, GitHub, or a chat message. It can read and write every file in your
> project and it bypasses Row Level Security. SkillSwap never sends it to a
> client — the phone only ever receives a single-use upload URL for one specific
> file. Supabase additionally returns 401 if a secret key is used from a browser,
> which is a useful second line of defence.
>
> The **Publishable** key (or legacy `anon`) is **not** a substitute: it cannot
> create signed upload URLs, so `/api/media/sign` would fail with 403.

### 4. Add them to Render

1. Render dashboard → your **skillswap-api** web service → **Environment**.
2. Add:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | the **Secret** key from step 3 (`sb_secret_...`) |
   | `SUPABASE_MEDIA_BUCKET` | `skillswap-media` (optional — this is the default) |

3. **Save changes**, then **Manual deploy → Deploy latest commit**.

> If you deploy by Blueprint instead: existing Render services often do **not**
> pick up keys that were newly added to `render.yaml`. If video still says it is
> not configured after a Blueprint sync, add the two keys by hand as above.

### 5. Check it worked

```bash
curl -s https://skillswap-api-dcg8.onrender.com/health
```

then, from inside the app (signed in):

```bash
curl -s -H "Authorization: Bearer <your token>" \
  https://skillswap-api-dcg8.onrender.com/api/media/status
```

You want:

```json
{ "success": true, "data": { "configured": true, "missing": [], "maxVideoBytes": 67108864, "maxImageBytes": 12582912, "maxVideoMs": 65000 } }
```

If it says `"configured": false`, read the `missing` array — it names the exact
variable that is empty, which is faster than guessing.

`"configured": false` means the two keys are not visible to the running process
— re-check spelling and that the deploy actually restarted.

---

## How a video is sent

```
phone                     SkillSwap API              Supabase Storage
  |  POST /api/media/sign      |                            |
  |--------------------------->|  sign upload for path P     |
  |                            |--------------------------->|
  |   { path, uploadUrl }      |<---------------------------|
  |<---------------------------|                            |
  |  POST uploadUrl (the bytes — up to 64 MB)                |
  |--------------------------------------------------------->|
  |  POST /api/media/confirm   |   HEAD the object at P      |
  |--------------------------->|--------------------------->|
  |                            |   real size + real type     |
  |   { url, bytes }           |<---------------------------|
  |<---------------------------|                            |
  |  POST /exchanges/:id/messages  { type: VIDEO, mediaUrl, thumbUrl, ... }
  |--------------------------->|                            |
```

Three details worth knowing:

- **Bytes never touch the API.** Your Render instance is free (512 MB RAM) and
  Express caps JSON bodies at 3 MB; proxying video through it would fail and
  would bill its bandwidth. The signed URL lets the phone talk to storage
  directly while the server still decides the path and the limits.
- **The size is measured, not trusted.** `/confirm` asks storage how big the
  object actually is. A modified client claiming 1 KB for a 200 MB file is still
  rejected — and the oversize object is deleted.
- **A message can only point at your bucket.** `message.service` rejects any
  `mediaUrl` or `thumbUrl` whose host is not your Supabase project, so nobody
  can use a SkillSwap chat bubble to host a tracking pixel or a link to malware.

## Limits

| | Standard | HD |
|---|---|---|
| Resolution | 480p | 720p |
| Video bitrate | 900 kbps | 2.5 Mbps |
| Typical 60s clip | ~7 MB | ~20 MB |
| Max length | 60s (recorder stops itself) | 60s |
| Max file (recorded or picked) | 64 MB | 64 MB |

Gallery videos are checked against the same limits **before** uploading, so a
2-minute clip is refused immediately with *"That video is 2:14 long. SkillSwap
sends clips up to 1:05."* rather than after a long upload.

HD is offered in the UI with the words **"uses more data"** next to it, because
on a student's mobile plan that is the part that matters.

Voice notes have their own ceiling — see [Voice notes](#voice-notes) below. They
are an order of magnitude smaller than video, so in practice they are free.

**How much fits in 1 GB free:** roughly 50 HD clips or 150 Standard clips. Free
egress is 5 GB/month, i.e. about 250 HD plays or 700 Standard plays. Supabase
shows both numbers under **Settings → Usage**, and it emails you before you hit
a limit rather than cutting you off.

## Voice notes

v1.11 adds voice notes to chat. They ride exactly the same pipeline as video —
record, sign, upload straight to Supabase, confirm, then a message row carrying a
URL — so **there is nothing new to configure**. If video works, voice notes work.

| | Voice note |
|---|---|
| Codec | Opus in WebM (Android WebView); AAC in MP4 (iOS) |
| Bitrate | 32 kbps |
| Max length | 5 minutes (the recorder stops itself) |
| Typical size | ~240 KB per minute, so a full 5-minute note is ~1.2 MB |
| Max file | 12 MB |

Worth knowing:

- **No thumbnail step.** A note has no frame to grab, so sending is one upload
  instead of two, and the bubble draws without fetching anything until Play is
  pressed (`preload="none"`). A chat full of notes still opens instantly on
  mobile data.
- **`MessageType` gained `AUDIO`**, which is a database enum change:
  `server/prisma/migrations/20261001000000_audio_messages`. `prisma migrate
  deploy` runs during the Render build, so there is nothing to do by hand.
- **An older APK still works.** It does not know the `AUDIO` type, so its bubble
  falls through to the text branch and shows the note's URL. Nothing crashes and
  no message is lost — which is the compatibility rule every new message type has
  to satisfy.
- **Duration ceilings are per type.** One column (`mediaDurationMs`) serves both
  video and audio, so the validator checks the type as well as the number: 60s
  for a clip, 5 minutes for a note. Claiming `VIDEO` is not a way to smuggle a
  long file past the cap the recorder promises.
- **Listen before sending.** The recorder has a review step (play it back,
  re-record, or send), because a voice note cannot be re-shot as cheaply as a
  photo can be re-picked.
- **A failed upload is retryable.** If the note cannot be sent, the composer keeps
  it with *Send again* / *Discard* rather than making a two-minute explanation be
  recorded twice because one request dropped.
- **Storage paths** are `audio/<8 hex>/<date>/<uuid>.<ext>`, minted server-side
  like every other kind. `/media/confirm` rejects a path whose prefix does not
  match the kind it is confirmed as, so an audio confirm cannot be pointed at
  somebody's video object.

## Photos changed too

Photos now upload as real files when storage is configured, and fall back to the
old inline base64 when it is not. Two side benefits:

- The message list stops carrying hundreds of kilobytes per photo (it used to
  refetch every photo in the conversation on every incoming message).
- Photos sent from now on are no longer inside the database, so they do not die
  with it at the 90-day mark.

Old photos already stored inline keep rendering exactly as before.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Video buttons hidden, or *"Video sending is not switched on"* | `/api/media/status` says `configured: false` | The keys are not in the running process — step 4. `/api/media/status` lists exactly which ones under `missing` |
| `502 … The storage bucket "skillswap-media" was not found` | Bucket missing, misnamed, or private | Step 2 — name and **Public bucket** ON |
| `502 … Supabase refused the storage key` (401/403 underneath) | Wrong key: the **Publishable** key instead of **Secret**, or a key from a different project | Step 3 — copy the `sb_secret_...` key for THIS project |
| `Invalid Compact JWS` on **`/api/media/sign`** (server leg) | The secret key reached Supabase only in `Authorization: Bearer`, which the gateway tries to JWT-decode; an opaque `sb_secret_` key is not a JWT | Fixed — `supabase.service.ts` sends the key on `apikey` **and** `Authorization` |
| Upload returns **200** but the video never arrives, and `/confirm` says *"That upload did not arrive"* | The bytes were sent with **POST**. On the signed-upload route storage reads POST as "mint me another signed URL" — it answers 200 with a token and stores nothing | Fixed — `/api/media/sign` returns `method: "PUT"` and the app obeys it. No APK rebuild needed |
| `Invalid Compact JWS` on the **upload itself** (client leg) | The upload URL carried two `?token=` segments, so storage saw a corrupt token and fell back to the create-signed-URL endpoint, which does require an API key | Fixed — the URL now carries one token, and no API key is sent with the bytes |
| `403 … new row violates row-level security policy` on the upload | `storage.objects` has no policies — a public bucket still needs them for writes | Step 2b: run **PART 2** of `supabase-setup.sql` in the SQL Editor |
| `400 That file is 71.0 MB. The limit is 64 MB.` | Clip too big | Record at Standard, or trim the clip |
| Upload stalls then fails | Weak signal on a big HD clip | Standard quality; the app allows 10 minutes for an upload |
| Black video bubble, audio plays | The device recorded WebM and the poster failed | Cosmetic — playback still works; the poster is best-effort |
| *"This device cannot record video inside the app"* | WebView without MediaRecorder (rare, old Android) | The sheet still offers **Videos** (gallery) |

## Testing it locally

```bash
# .env at the repo root
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_MEDIA_BUCKET=skillswap-media
```

The integration suite does **not** need real keys — it stubs the storage calls
and covers the caps, the own-host rule and the "unconfigured" fallbacks:

```bash
cd server && npm run test:integration    # 15 suites / 152 tests
```

## Your database has an expiry date

Separate from media, and more urgent: the **free Render Postgres instance is
deleted 90 days after creation**. Everything — users, exchanges, chats, reviews
— is inside it.

Your options, in order of effort:

1. **Take a backup now, and keep taking them.** Render dashboard → your
   database → **Backups**. Free-tier databases can be backed up manually. A
   `pg_dump` you hold yourself costs nothing and is the only real safety net.
2. **Upgrade the database** ($7/month) — it then persists and gets daily
   automatic backups.
3. **Move Postgres to a free tier that does not expire** (Neon or Supabase
   Postgres — you will already have a Supabase account after step 1 above). That
   means changing `DATABASE_URL` on Render and running `npx prisma migrate
   deploy` once. Tell me and I will write the migration runbook; it is about
   20 minutes of work and no downtime if we do it in the right order.

Media in Supabase Storage is not affected by any of this — that is the point of
keeping it out of the database.
