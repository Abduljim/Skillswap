# Email — password reset delivery (no domain, no card)

## What email is actually used for

Exactly one thing today: **password reset**.

```
server/src/services/auth.service.ts:151
    await sendPasswordResetEmail(user.email, resetUrl).catch(() => undefined);
```

The `.catch(() => undefined)` is deliberate — the API must not reveal whether an
address exists, so it returns the same response either way. The consequence of
leaving the variables empty is therefore **silent**: "Forgot password" appears to
work, no mail ever arrives, and that account is unrecoverable without an admin
resetting it by hand. Empty SMTP vars are not a cosmetic gap.

`server/src/services/email.service.ts` tries providers in this order:

1. `RESEND_API_KEY` — HTTP API to Resend
2. `SMTP_HOST` **and** `SMTP_FROM` — nodemailer (`isSmtpConfigured()` requires both)
3. neither → logs `[email] no delivery provider configured` and returns
   `{ delivered: false }`

Port handling: `secure: env.SMTP_PORT === 465`. So **587 → STARTTLS** (correct for
Gmail and Brevo), 465 → implicit TLS.

---

## ⚠️ The Resend trap — read this before touching `RESEND_API_KEY`

`.env.example` currently says *"Resend is recommended"* and `render.yaml` defaults
`EMAIL_FROM` to `SkillSwap <onboarding@resend.dev>`. **That advice only holds if
you own a verified domain.**

Resend's free tier can send from `onboarding@resend.dev` **only to the email
address you signed up with** until you verify your own domain with SPF/DKIM DNS
records. Their docs describe it as a sandbox for initial testing.

So without a domain, setting `RESEND_API_KEY` produces the worst possible failure
mode: it works when you test it against your own inbox, returns `200`, and then
every real user's reset is rejected. `sendViaResend()` does log
`[email] Resend rejected <status>` — but only if you go looking.

**Do not use Resend until you have a domain.** Use SMTP below.

---

## Option 1 — Gmail SMTP (recommended right now): ~5 minutes, 500/day

Why this one: the mail leaves **Google's own servers** with a `gmail.com` From
address, so SPF, DKIM and DMARC are all perfectly aligned. That is better inbox
placement than relaying a gmail address through a third party, and it needs no
card, no domain and no code change.

| Key | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `jimoh0004@gmail.com` (already `ADMIN_EMAIL`) |
| `SMTP_PASS` | the 16-character **App Password** — *not* your Gmail password |
| `SMTP_FROM` | `SkillSwap <jimoh0004@gmail.com>` |
| `RESEND_API_KEY` | leave **empty** |

### Getting the App Password

1. https://myaccount.google.com/security → turn **2-Step Verification ON**. It is a
   prerequisite; without it the App Passwords page does not appear.
2. https://myaccount.google.com/apppasswords → name it `SkillSwap` → **Create**.
3. Copy the 16 characters. Paste them into `SMTP_PASS` with or without the spaces —
   both are accepted.

### Notes and limits

- A regular Gmail password fails with `534-5.7.9 Application-specific password
  required` or `535-5.7.8 Username and Password not accepted`.
- **500 recipients per rolling 24 h** on a free Gmail account. One reset = one
  recipient, so that is far beyond early traffic. Exceeding it returns
  `550-5.4.5 Daily sending quota exceeded` and resets stop for up to 24 hours.
- `SMTP_FROM` must be the authenticated mailbox (or an alias it owns). Google
  rejects sending as an arbitrary address.
- This is a personal mailbox — never use it for marketing or bulk sends. Google
  suspends accounts that look like spammers, and losing it would cost you more
  than the reset feature.
- An App Password grants full SMTP access to that mailbox and cannot be scoped.
  Treat `SMTP_PASS` like a password: it stays in Render, never in git.

---

## Option 2 — Brevo SMTP relay: 300/day free, no card, no domain

| Key | Value |
| --- | --- |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | your Brevo login email |
| `SMTP_PASS` | the SMTP key from **SMTP & API** in the Brevo dashboard |
| `SMTP_FROM` | `SkillSwap <jimoh0004@gmail.com>` |

Sender setup: **Senders & Domains → Add a sender** → Brevo emails a 6-digit code to
that address → enter it. **No DNS records and no domain required**, and the free
plan is 300 emails/day with no time limit and no card.

The honest trade-off: the message leaves Brevo's servers but claims
`From: …@gmail.com`, so SPF/DKIM are not aligned with gmail.com and DMARC
alignment fails. At 300/day that still normally lands in the inbox, but it is more
likely to be junked at Outlook/Yahoo than Option 1. Choose Brevo when you outgrow
500/day, or when you stop wanting resets tied to a personal mailbox.

---

## Option 3 — the real answer later: get a domain

About $10/year (or a free `.me` through the GitHub Student Pack's Namecheap offer).
Then:

1. Add the provider's DNS records: **SPF**, **DKIM**, and **DMARC** (`p=quarantine`).
2. Use Resend (3,000/month, 100/day free), Brevo, Postmark or SES.
3. Send as `SkillSwap <noreply@skillswap.app>`.

Same environment variables — `RESEND_API_KEY` + `EMAIL_FROM`, or the SMTP five. No
code change and no APK rebuild, ever: email is entirely server-side.

---

## Verify it end to end (~2 min)

1. **Logs.** Render → skillswap-api → Logs. There must be no
   `[email] no delivery provider configured` line after a reset attempt.
2. **Send.** On the app or the web build, request a reset for your own account.
   Check the inbox **and the spam folder**.
3. **Link.** It should open `/reset-password?token=…`. `RESET_URL` is already
   `https://skillswap-api-dcg8.onrender.com/reset-password`, and `app.ts` serves
   the built client with an `index.html` fallback for React Router paths — so the
   API host resolves the page itself. No separate frontend deploy needed.
4. **Complete the reset** and sign in with the new password. Only then is the flow
   proven; a delivered email with a broken link is a different bug.

### Failure modes

| Log / error | Cause |
| --- | --- |
| `[email] no delivery provider configured` | `SMTP_HOST` or `SMTP_FROM` missing — both are required |
| `535-5.7.8` / `534-5.7.9` | Used the Gmail password instead of an App Password, or 2SV is off |
| `550-5.4.5` | Daily quota reached — waits up to 24 h |
| `421-4.7.0` | Too many concurrent SMTP sessions; the code closes the transporter after every send, so this is unlikely |
| `Email delivery timed out` | 15 s socket timeout — often a Render free-tier cold start. Retry once before investigating |
| `[email] Resend rejected 403` | The Resend trap above: unverified domain, recipient is not your own address |

---

## Security notes

- Reset tokens: 1-hour expiry, single use, stored only as a SHA-256 hash
  (`auth.service.ts`) — the raw token exists only in the emailed URL. Keep it that
  way.
- **Do not add a fallback that logs the reset URL.** In production that writes
  account-takeover links into Render's logs, which are visible to anyone with
  dashboard access. If you want one for local development, gate it on
  `NODE_ENV !== 'production'` and never commit it ungated.
- `SMTP_PASS` is a secret. It is already `sync`-managed in `render.yaml` and never
  belongs in the repo, the APK, or the web bundle.
