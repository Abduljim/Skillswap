import nodemailer from 'nodemailer';
import { env } from '../config/env';

interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function sendViaResend(opts: MailOptions): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'SkillSwap <onboarding@resend.dev>',
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[email] Resend rejected', res.status, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] Resend delivery failed', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function isSmtpConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

/** SMTP is only "ready" when AUTH can actually run: host+from AND user+pass. */
function isSmtpReady() {
  return isSmtpConfigured() && Boolean(env.SMTP_USER && env.SMTP_PASS);
}

async function sendViaSmtp(opts: MailOptions): Promise<{ delivered: boolean; error: string | null }> {
  let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Email delivery timed out')), 15_000);
    });
    await Promise.race([
      transporter.sendMail({
        from: env.SMTP_FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
      timeout,
    ]);
    return { delivered: true, error: null };
  } catch (e) {
    const err = e as Error;
    const message = String(err?.message ?? e).replace(/https?:\/\/\S+/gi, '[url]').slice(0, 160);
    console.error('[email] SMTP delivery failed', err?.name || 'Error', message);
    return { delivered: false, error: `smtp: ${err?.name || 'Error'}: ${message}` };
  } finally {
    clearTimeout(timer);
    try {
      transporter?.close();
    } catch {}
  }
}

/**
 * Deliver an email, reporting what actually happened.
 *
 * Provider order matters. A fully-configured SMTP relay (Brevo) goes FIRST:
 * Resend's free tier only delivers to the account owner and sends from
 * onboarding@resend.dev, which Gmail files under spam — the old order made the
 * server report "delivered" while the user's inbox stayed empty. Resend is the
 * fallback; a half-configured SMTP (no AUTH) is the last resort.
 */
export async function sendEmail(
  opts: MailOptions
): Promise<{ delivered: boolean; error: string | null }> {
  let lastError: string | null = null;

  if (isSmtpReady()) {
    const result = await sendViaSmtp(opts);
    if (result.delivered) return result;
    lastError = result.error;
  }

  if (env.RESEND_API_KEY) {
    const ok = await sendViaResend(opts);
    if (ok) return { delivered: true, error: null };
    lastError = lastError ?? 'resend: rejected the message (status in server log)';
  }

  if (!isSmtpReady() && isSmtpConfigured()) {
    const result = await sendViaSmtp(opts);
    if (result.delivered) return result;
    lastError = result.error;
  }

  if (!isSmtpConfigured() && !env.RESEND_API_KEY) {
    console.error(
      '[email] no delivery provider configured. Set SMTP_HOST/SMTP_FROM/SMTP_USER/SMTP_PASS or RESEND_API_KEY.'
    );
    return { delivered: false, error: 'no delivery provider configured' };
  }

  return { delivered: false, error: lastError };
}

/**
 * One-line, secret-free summary of what will actually deliver a password reset,
 * for the boot log.
 *
 * Email failure is silent by design — auth.service.ts swallows the send error so
 * the endpoint cannot reveal which addresses exist — which makes the deploy log
 * the only place a missing or half-configured provider is visible before someone
 * is locked out of their account. Never prints SMTP_PASS.
 */
export function describeEmailConfig(): string {
  // The Brevo SMTP LOGIN (something@smtp-brevo.com) is not a sendable address:
  // that domain publishes SPF "-all" and DMARC "p=reject", so every receiving
  // server silently discards mail From: it - Brevo answers "250 accepted" and
  // the mail then vanishes without even reaching spam. This misconfiguration is
  // invisible in every server-side log, so name it explicitly wherever the
  // config is described (boot log + email self-test).
  if (/@smtp-brevo\.com/i.test(env.SMTP_FROM || '')) {
    return `smtp DANGER - SMTP_FROM is "${env.SMTP_FROM}". smtp-brevo.com publishes SPF "-all" and DMARC "p=reject": receiving servers SILENTLY DISCARD mail from it (Brevo still says "accepted"). That address is your Brevo LOGIN, not a sender. Fix: Brevo dashboard -> Senders, Domains & Dedicated IPs -> Add a sender (e.g. your own Gmail), then set SMTP_FROM to it (docs/EMAIL.md).`;
  }
  // isSmtpConfigured() only checks host and from, so a relay can look configured
  // while every AUTH fails: Brevo and Gmail both need the password. Say so, with
  // the error code it will produce, rather than printing a healthy-looking line.
  if (isSmtpConfigured() && env.SMTP_USER && !env.SMTP_PASS) {
    return `smtp INCOMPLETE — SMTP_USER is set but SMTP_PASS is empty, so AUTH will fail with 535. Add the SMTP key/password in the Render dashboard (docs/EMAIL.md).`;
  }
  const smtp = isSmtpConfigured()
    ? `smtp ${env.SMTP_HOST}:${env.SMTP_PORT}${
        env.SMTP_PORT === 465 ? ' (implicit TLS)' : ' (STARTTLS)'
      } as "${env.SMTP_USER || 'no auth'}" from "${env.SMTP_FROM}"`
    : env.SMTP_HOST || env.SMTP_FROM
    ? `smtp INCOMPLETE — ${[!env.SMTP_HOST && 'SMTP_HOST', !env.SMTP_FROM && 'SMTP_FROM']
        .filter(Boolean)
        .join(' and ')} missing, and both are required, so nothing will be sent`
    : '';
  const resend = env.RESEND_API_KEY
    ? 'resend (delivers only to the account owner until a domain is verified — docs/EMAIL.md)'
    : '';
  if (smtp && resend) return `${smtp} tried first; ${resend} as fallback`;
  if (smtp) return smtp;
  if (resend) return resend;
  return 'NONE — password-reset emails will not be sent. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM (docs/EMAIL.md).';
}

/**
 * Live check for GET /api/admin/diagnostics.
 *
 * `transporter.verify()` performs a real SMTP handshake and AUTH. That is the
 * only way to prove these credentials work: createTransport() accepts nonsense
 * and stays silent until something is actually sent, which for a password reset
 * means the failure surfaces to a locked-out user instead of to you. Returns no
 * password.
 */
export async function emailDiagnostics(): Promise<{
  provider: 'resend' | 'smtp' | 'none';
  smtp: {
    configured: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    verify: 'ok' | 'failed' | 'not_attempted';
    error: string | null;
  };
  resend: {
    configured: boolean;
    from: string;
    keyCheck: 'ok' | 'failed' | 'not_attempted';
    error: string | null;
  };
}> {
  const smtp = {
    configured: isSmtpConfigured(),
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    user: env.SMTP_USER,
    from: env.SMTP_FROM,
    verify: 'not_attempted' as 'ok' | 'failed' | 'not_attempted',
    error: null as string | null,
  };
  const resend = {
    configured: Boolean(env.RESEND_API_KEY),
    from: env.EMAIL_FROM || 'SkillSwap <onboarding@resend.dev>',
    keyCheck: 'not_attempted' as 'ok' | 'failed' | 'not_attempted',
    error: null as string | null,
  };

  if (smtp.configured) {
    let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('SMTP verify timed out after 15s')), 15_000);
      });
      await Promise.race([transporter.verify(), timeout]);
      smtp.verify = 'ok';
    } catch (e) {
      const err = e as Error;
      smtp.verify = 'failed';
      // Strip URLs so a credential embedded in an error string cannot leak.
      smtp.error = `${err?.name || 'Error'}: ${String(err?.message ?? e)
        .replace(/https?:\/\/\S+/gi, '[url]')
        .slice(0, 200)}`;
    } finally {
      clearTimeout(timer);
      try {
        transporter?.close();
      } catch {}
    }
  }

  if (resend.configured) {
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      });
      resend.keyCheck = res.ok ? 'ok' : 'failed';
      if (!res.ok) resend.error = `HTTP ${res.status}`;
    } catch (e) {
      resend.keyCheck = 'failed';
      resend.error = String((e as Error).message).slice(0, 120);
    }
  }

  const provider = resend.configured ? 'resend' : smtp.configured ? 'smtp' : 'none';
  return { provider, smtp, resend };
}

export function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendEmail({
    to,
    subject: 'SkillSwap — reset your password',
    text: `Reset your password here:\n\n${resetUrl}\n\nThe link expires in 1 hour and can be used once.\nIf you didn't ask for this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;padding:24px;background:#f5f2ec;border-radius:16px">
        <h2 style="margin:0 0 8px;color:#12131a">SkillSwap</h2>
        <p style="color:#3b3b41;margin:0 0 16px">Click below to choose a new password.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#fb4f1d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">Reset password</a>
        <p style="color:#8a8a8f;font-size:12px;margin-top:20px">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  });
}