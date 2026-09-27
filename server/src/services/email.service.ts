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

export async function sendEmail(opts: MailOptions): Promise<{ delivered: boolean }> {
  if (env.RESEND_API_KEY) {
    const ok = await sendViaResend(opts);
    if (ok) return { delivered: true };
  }
  if (!isSmtpConfigured()) {
    console.error(
      '[email] no delivery provider configured. Set RESEND_API_KEY (recommended) or SMTP_HOST/SMTP_FROM.'
    );
    return { delivered: false };
  }
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
    return { delivered: true };
  } catch (e) {
    const err = e as Error;
    const message = String(err?.message ?? e).replace(/https?:\/\/\S+/gi, '[url]').slice(0, 160);
    console.error('[email] SMTP delivery failed', err?.name || 'Error', message);
    return { delivered: false };
  } finally {
    clearTimeout(timer);
    try {
      transporter?.close();
    } catch {}
  }
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