import { createHash } from 'crypto';
import express from 'express';
import nodemailer from 'nodemailer';
import request from 'supertest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import authRouter from '../src/routes/auth.routes';
import { requestPasswordReset } from '../src/services/auth.service';
import { describeEmailConfig, sendPasswordResetEmail } from '../src/services/email.service';

jest.mock('../src/config/env', () => ({
  env: {
    NODE_ENV: 'development',
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: 587,
    SMTP_USER: 'test-user',
    SMTP_PASS: 'test-password',
    SMTP_FROM: 'support@example.test',
    RESEND_API_KEY: '',
    EMAIL_FROM: '',
    CLIENT_URL: 'https://example.test',
    RESET_URL: '',
  },
}));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    passwordResetToken: { create: jest.fn() },
  },
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

const findUser = prisma.user.findUnique as jest.Mock;
const createToken = prisma.passwordResetToken.create as jest.Mock;
const createTransport = nodemailer.createTransport as jest.Mock;
const sendMail = jest.fn();
const close = jest.fn();
const email = 'member@example.test';
const acknowledgment = {
  success: true,
  data: { message: 'If an account exists for that email, you will receive a password reset link.' },
};
const app = express();
app.use(express.json());
app.use('/auth', authRouter);

const fetchMock = jest.fn();
function resendOk() {
  fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => '{"id":"test-msg-id"}' });
}
function resendReject() {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 422,
    text: async () => '{"statusCode":422,"message":"recipient rejected"}',
  });
}
function resendPending() {
  fetchMock.mockImplementation(
    (_url: string, init: any) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal.reason ?? new Error('aborted'))
        );
      })
  );
}

let logs: jest.SpyInstance[];

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = fetchMock;
  env.NODE_ENV = 'development';
  env.SMTP_HOST = 'smtp.example.test';
  env.SMTP_FROM = 'support@example.test';
  env.RESEND_API_KEY = '';
  env.EMAIL_FROM = '';
  findUser.mockResolvedValue({ id: 'user-id', email });
  createToken.mockResolvedValue({ id: 'reset-id' });
  createTransport.mockReturnValue({ sendMail, close });
  sendMail.mockResolvedValue({ messageId: 'message-id' });
  logs = ['log', 'error', 'warn', 'info', 'debug'].map((method) =>
    jest.spyOn(console, method as 'log').mockImplementation(() => {})
  );
});

afterEach(() => {
  try {
    // Ops logs may appear on delivery failures, but never before delivery,
    // never on info/debug channels, and never containing a reset token.
    for (const spy of [logs[0], logs[2], logs[3], logs[4]]) {
      expect(spy).not.toHaveBeenCalled();
    }
    const errText = logs[1].mock.calls.map((c) => c.join(' ')).join('\n');
    expect(errText).not.toMatch(/token=[a-f0-9]{64}/);
  } finally {
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});

function deliveryScenario(scenario: string) {
  if (scenario === 'missing account') findUser.mockResolvedValue(null);
  if (scenario === 'no provider') {
    env.RESEND_API_KEY = '';
    env.SMTP_HOST = '';
  }
  if (scenario === 'delivery success') {
    env.RESEND_API_KEY = 're_test_x';
    resendOk();
  }
  if (scenario === 'delivery failure') {
    env.RESEND_API_KEY = 're_test_x';
    resendReject();
    // SMTP is the primary now, so "failure" must fail it too.
    sendMail.mockRejectedValue(new Error('smtp down'));
  }
}

describe.each(['development', 'production'])('Password reset privacy in %s', (mode) => {
  describe.each(['delivery success', 'delivery failure', 'no provider', 'missing account'])(
    '%s',
    (scenario) => {
      beforeEach(() => {
        env.NODE_ENV = mode;
        deliveryScenario(scenario);
      });

      it('never returns account details, delivery status, or a raw token', async () => {
        const result = await requestPasswordReset(email.toUpperCase());

        expect(result).toBeUndefined();
        expect(findUser).toHaveBeenCalledWith({
          where: { email },
          select: { id: true, email: true },
        });
        if (scenario === 'missing account') {
          expect(createToken).not.toHaveBeenCalled();
        } else {
          expect(createToken).toHaveBeenCalledTimes(1);
          const outbound = `${JSON.stringify(fetchMock.mock.calls ?? [])}${JSON.stringify(
            sendMail.mock.calls ?? []
          )}`;
          const raw =
            scenario === 'no provider'
              ? null
              : (outbound.match(/token=([a-f0-9]{64})/) || [])[1];
          if (raw) {
            expect(createToken).toHaveBeenCalledWith({
              data: {
                userId: 'user-id',
                tokenHash: createHash('sha256').update(raw).digest('hex'),
                expiresAt: expect.any(Date),
              },
            });
            expect(JSON.stringify(createToken.mock.calls)).not.toContain(raw);
          }
        }
        if (scenario === 'no provider' || scenario === 'missing account') {
          expect(fetchMock).not.toHaveBeenCalled();
          expect(createTransport).not.toHaveBeenCalled();
          expect(sendMail).not.toHaveBeenCalled();
        } else {
          // A fully-configured SMTP relay goes FIRST now: Resend's free tier
          // only delivers to the account owner, from onboarding@resend.dev,
          // which Gmail files under spam — the reset "worked" and never arrived.
          expect(createTransport).toHaveBeenCalledTimes(1);
          expect(sendMail).toHaveBeenCalledTimes(1);
          const sent = sendMail.mock.calls[0][0];
          expect(sent.to).toBe(email);
          expect(sent.html).toMatch(/Reset password/);
          expect(close).toHaveBeenCalledTimes(1);
          if (scenario === 'delivery success') {
            // SMTP delivered; Resend is never bothered.
            expect(fetchMock).not.toHaveBeenCalled();
          } else {
            // Both providers failed; Resend was tried as the fallback.
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('https://api.resend.com/emails');
            expect(init.headers.Authorization).toBe('Bearer re_test_x');
          }
        }
      });

      it('returns only the identical generic route acknowledgment', async () => {
        const response = await request(app).post('/auth/forgot-password').send({ email });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(acknowledgment);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.text).not.toContain(email);
        expect(response.text).not.toMatch(/token|delivered|user-id/i);
      });
    }
  );
});

it.each(['lookup', 'token persistence'])(
  'acknowledges %s failures without returning or logging internal errors',
  async (stage) => {
    const error = new Error(`Internal error for ${email}, token=private-reset-token`);
    if (stage === 'lookup') findUser.mockRejectedValue(error);
    else createToken.mockRejectedValue(error);

    const response = await request(app).post('/auth/forgot-password').send({ email });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(acknowledgment);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(logs[1]).not.toHaveBeenCalled();
  }
);

it('bounds a stalled Resend delivery at 15s and clears timers', async () => {
  jest.useFakeTimers();
  env.SMTP_HOST = ''; // no SMTP: Resend is the provider under test
  env.RESEND_API_KEY = 're_test_x';
  resendPending();
  const result = requestPasswordReset(email);
  const settled = jest.fn();
  void result.then(settled);

  await jest.advanceTimersByTimeAsync(14_999);
  expect(settled).not.toHaveBeenCalled();
  const signal = fetchMock.mock.calls[0][1].signal;
  expect(signal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toBeUndefined();
  expect(signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

it.each([
  'smtp success',
  'smtp failure + resend fallback',
  'smtp failure + resend failure',
  'smtp failure only',
  'resend-only success',
  'resend-only failure',
  'resend-only timeout',
  'smtp-only success',
  'smtp-only failure',
  'no provider',
])('returns only delivery status and clears timers after %s', async (scenario) => {
  jest.useFakeTimers();
  const resetUrl = 'https://example.test/api/auth/reset-password?token=private-reset-token';

  const smtpFails = () => sendMail.mockRejectedValue(new Error('smtp down'));
  const noSmtp = () => {
    env.SMTP_HOST = '';
  };
  const withResend = (mode: 'ok' | 'reject' | 'pending') => {
    env.RESEND_API_KEY = 're_test_x';
    if (mode === 'ok') resendOk();
    if (mode === 'reject') resendReject();
    if (mode === 'pending') resendPending();
  };

  if (scenario === 'smtp success') withResend('ok'); // configured but never reached
  if (scenario === 'smtp failure + resend fallback') {
    smtpFails();
    withResend('ok');
  }
  if (scenario === 'smtp failure + resend failure') {
    smtpFails();
    withResend('reject');
  }
  if (scenario === 'smtp failure only') smtpFails(); // no Resend key
  if (scenario === 'resend-only success') {
    noSmtp();
    withResend('ok');
  }
  if (scenario === 'resend-only failure') {
    noSmtp();
    withResend('reject');
  }
  if (scenario === 'resend-only timeout') {
    noSmtp();
    withResend('pending');
  }
  // 'smtp-only *': beforeEach defaults (SMTP up, no Resend key)
  if (scenario === 'smtp-only failure') smtpFails();
  if (scenario === 'no provider') noSmtp();

  const expectsSuccess = [
    'smtp success',
    'smtp failure + resend fallback',
    'resend-only success',
    'smtp-only success',
  ].includes(scenario);

  const result = sendPasswordResetEmail(email, resetUrl);
  await jest.advanceTimersByTimeAsync(scenario.includes('timeout') ? 15_000 : 0);

  await expect(result).resolves.toMatchObject({ delivered: expectsSuccess });
  if (!expectsSuccess) {
    // The reason is reported in-band (self-test endpoint) but never a secret.
    const outcome = await result;
    expect(typeof outcome.error).toBe('string');
    expect(outcome.error!.length).toBeGreaterThan(0);
  }
  expect(jest.getTimerCount()).toBe(0);

  const usesSmtp = !scenario.startsWith('resend-only') && scenario !== 'no provider';
  expect(close).toHaveBeenCalledTimes(usesSmtp ? 1 : 0);
});

it('keeps SMTP cleanup errors out of responses and the public log', async () => {
  jest.useFakeTimers();
  sendMail.mockReturnValue(new Promise(() => {}));
  close.mockImplementation(() => {
    throw new Error(`Private reset details for ${email}`);
  });
  const result = requestPasswordReset(email);

  await jest.advanceTimersByTimeAsync(15_000);

  await expect(result).resolves.toBeUndefined();
  expect(close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

describe('reset link base', () => {
  /** The plain-text body of the email that actually went out. */
  function sentLink(): string {
    const sent = sendMail.mock.calls.at(-1)?.[0];
    expect(sent).toBeTruthy();
    return sent.text as string;
  }

  function withEnv(over: Record<string, string>, run: () => Promise<void>) {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(over)) {
      saved[k] = (env as unknown as Record<string, string | undefined>)[k];
      (env as unknown as Record<string, string>)[k] = v;
    }
    return run().finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete (env as unknown as Record<string, string | undefined>)[k];
        else (env as unknown as Record<string, string>)[k] = v;
      }
    });
  }

  it('uses the request origin when CLIENT_URL is a CORS wildcard', async () => {
    await withEnv({ CLIENT_URL: '*', SERVER_URL: 'http://localhost:4000', RESET_URL: '' }, async () => {
      await requestPasswordReset(email, 'https://skillswap-api-dcg8.onrender.com');
      const link = sentLink();
      expect(link).toContain('https://skillswap-api-dcg8.onrender.com/api/auth/reset-password?token=');
      // A wildcard is not a clickable base — this was the bug.
      expect(link).not.toContain('*');
      expect(link).not.toContain('localhost');
      const html = sendMail.mock.calls.at(-1)?.[0].html as string;
      expect(html).toContain('https://skillswap-api-dcg8.onrender.com/api/auth/reset-password?token=');
    });
  });

  it('falls back to SERVER_URL when there is no request origin either', async () => {
    await withEnv({ CLIENT_URL: '*', SERVER_URL: 'https://api.example.test', RESET_URL: '' }, async () => {
      await requestPasswordReset(email);
      expect(sentLink()).toContain('https://api.example.test/api/auth/reset-password?token=');
    });
  });

  it('still prefers an explicit RESET_URL over everything', async () => {
    await withEnv(
      { CLIENT_URL: 'https://ignored.example.test', SERVER_URL: 'https://api.example.test', RESET_URL: 'https://app.example.test/reset-password' },
      async () => {
        await requestPasswordReset(email, 'https://origin.example.test');
        expect(sentLink()).toContain('https://app.example.test/reset-password?token=');
      }
    );
  });

  it('keeps using a real CLIENT_URL when one is configured', async () => {
    await withEnv({ CLIENT_URL: 'https://example.test', SERVER_URL: 'https://api.example.test', RESET_URL: '' }, async () => {
      await requestPasswordReset(email, 'https://origin.example.test');
      expect(sentLink()).toContain('https://example.test/reset-password?token=');
    });
  });
});

describe('email provider summary (boot log)', () => {
  // describeEmailConfig() is read at boot from the same env object the rest of
  // the suite mutates, so restore whatever it touched.
  function withEmailEnv(over: Record<string, string>, run: () => void) {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(over)) {
      saved[k] = (env as unknown as Record<string, string | undefined>)[k];
      (env as unknown as Record<string, string>)[k] = v;
    }
    try {
      run();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete (env as unknown as Record<string, string | undefined>)[k];
        else (env as unknown as Record<string, string>)[k] = v;
      }
    }
  }

  const secret = 'xsmtpsib-not-a-real-key';

  it('names the relay, port, TLS mode and sender when SMTP is complete', () => {
    withEmailEnv(
      {
        SMTP_HOST: 'smtp-relay.brevo.com',
        SMTP_PORT: '587',
        SMTP_USER: 'me@example.test',
        SMTP_PASS: secret,
        SMTP_FROM: 'SkillSwap <me@example.test>',
        RESEND_API_KEY: '',
      },
      () => {
        const line = describeEmailConfig();
        expect(line).toContain('smtp-relay.brevo.com:587');
        expect(line).toContain('STARTTLS');
        expect(line).toContain('me@example.test');
        expect(line).toContain('SkillSwap <me@example.test>');
      }
    );
  });

  it('never prints the SMTP password', () => {
    withEmailEnv(
      {
        SMTP_HOST: 'smtp-relay.brevo.com',
        SMTP_USER: 'me@example.test',
        SMTP_PASS: secret,
        SMTP_FROM: 'SkillSwap <me@example.test>',
        RESEND_API_KEY: '',
      },
      () => {
        expect(describeEmailConfig()).not.toContain(secret);
      }
    );
  });

  it('says INCOMPLETE and names the missing key when only one of the pair is set', () => {
    withEmailEnv(
      { SMTP_HOST: 'smtp-relay.brevo.com', SMTP_FROM: '', RESEND_API_KEY: '' },
      () => {
        const line = describeEmailConfig();
        expect(line).toContain('INCOMPLETE');
        expect(line).toContain('SMTP_FROM');
      }
    );
  });

  it('says INCOMPLETE when SMTP_USER is set but SMTP_PASS is empty', () => {
    // The state render.yaml leaves a fresh deploy in: four of the five values are
    // pre-filled, so the relay looks configured while every AUTH fails with 535.
    withEmailEnv(
      {
        SMTP_HOST: 'smtp-relay.brevo.com',
        SMTP_PORT: '587',
        SMTP_USER: 'me@example.test',
        SMTP_PASS: '',
        SMTP_FROM: 'SkillSwap <me@example.test>',
        RESEND_API_KEY: '',
      },
      () => {
        const line = describeEmailConfig();
        expect(line).toContain('INCOMPLETE');
        expect(line).toContain('SMTP_PASS');
        expect(line).toContain('535');
      }
    );
  });

  it('says NONE when nothing is configured', () => {
    withEmailEnv({ SMTP_HOST: '', SMTP_FROM: '', RESEND_API_KEY: '' }, () => {
      expect(describeEmailConfig()).toContain('NONE');
    });
  });

  it('reports Resend first with SMTP as the fallback when both are set', () => {
    withEmailEnv(
      {
        SMTP_HOST: 'smtp-relay.brevo.com',
        SMTP_FROM: 'SkillSwap <me@example.test>',
        RESEND_API_KEY: 're_test_x',
      },
      () => {
        const line = describeEmailConfig();
        expect(line).toContain('tried first');
        expect(line).toContain('fallback');
      }
    );
  });
});

describe('The emailed link lands on a page that actually exists', () => {
  it('points at the API-served reset page when no client URL is configured', async () => {
    env.CLIENT_URL = '';
    await requestPasswordReset(email, 'https://api.example.test');
    const mail = sendMail.mock.calls[0]?.[0];
    expect(mail.html).toMatch(
      /https:\/\/api\.example\.test\/api\/auth\/reset-password\?token=[a-f0-9]{64}/
    );
  });

  it('points at the web app reset page when CLIENT_URL is configured', async () => {
    env.CLIENT_URL = 'https://app.example.test';
    await requestPasswordReset(email, 'https://api.example.test');
    const mail = sendMail.mock.calls[0]?.[0];
    expect(mail.html).toMatch(/https:\/\/app\.example\.test\/reset-password\?token=[a-f0-9]{64}/);
  });

  it('serves the reset page itself, with a same-origin form', async () => {
    const page = await request(app).get('/auth/reset-password?token=deadbeefdeadbeef');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.text).toContain('Choose a new password');
    expect(page.text).toContain('<form');
    // The form posts to location.pathname: same origin, no CORS, no frontend.
    expect(page.text).toContain('location.pathname');
  });
});
