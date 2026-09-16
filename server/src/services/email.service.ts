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