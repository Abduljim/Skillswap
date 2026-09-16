import { createHash } from 'crypto';
import express from 'express';
import nodemailer from 'nodemailer';
import request from 'supertest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import authRouter from '../src/routes/auth.routes';
import { requestPasswordReset } from '../src/services/auth.service';
import { sendPasswordResetEmail } from '../src/services/email.service';

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
          const raw =
            scenario === 'no provider'
              ? null
              : (JSON.stringify(fetchMock.mock.calls[0][1].body).match(/token=([a-f0-9]{64})/) ||
                  [])[1];
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
          expect(fetchMock).toHaveBeenCalledTimes(1);
          const [url, init] = fetchMock.mock.calls[0];
          expect(url).toBe('https://api.resend.com/emails');
          expect(init.method).toBe('POST');
          expect(init.headers.Authorization).toBe('Bearer re_test_x');
          const body = JSON.parse(init.body);
          expect(body.to).toEqual([email]);
          expect(body.html).toMatch(/Reset password/);
        }
        if (scenario === 'delivery failure') {
          // Resend rejection falls back to SMTP (mock succeeds) and closes the transporter.
          expect(sendMail).toHaveBeenCalledTimes(1);
          expect(close).toHaveBeenCalledTimes(1);
        } else {
          expect(close).not.toHaveBeenCalled();
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
  ['resend success', ['resend success']],
  ['resend failure + smtp fallback', ['resend failure', 'smtp fallback success']],
  ['resend failure only', ['resend failure']],
  ['resend timeout only', ['resend timeout']],
  ['smtp fallback success', ['smtp fallback success']],
  ['smtp fallback failure', ['smtp fallback failure']],
  ['no provider', ['no provider']],
])('returns only delivery status and clears timers after %s', async (scenario) => {
  jest.useFakeTimers();
  const resetUrl = 'https://example.test/reset-password?token=private-reset-token';
  if (scenario === 'resend success') {
    env.RESEND_API_KEY = 're_test_x';
    resendOk();
  }
  if (scenario === 'resend failure + smtp fallback') {
    env.RESEND_API_KEY = 're_test_x';
    resendReject();
  }
  if (scenario === 'resend failure only' || scenario === 'resend timeout only') {
    env.RESEND_API_KEY = 're_test_x';
    env.SMTP_HOST = '';
    if (scenario === 'resend failure only') resendReject();
    else resendPending();
  }
  if (scenario === 'smtp fallback failure') {
    sendMail.mockRejectedValue(new Error(resetUrl));
  }
  if (scenario === 'no provider') {
    env.SMTP_HOST = '';
  }

  const expectsSuccess = [
    'resend success',
    'resend failure + smtp fallback',
    'smtp fallback success',
  ].includes(scenario);
  const result = sendPasswordResetEmail(email, resetUrl);
  await jest.advanceTimersByTimeAsync(scenario.includes('timeout') ? 15_000 : 0);

  await expect(result).resolves.toEqual({ delivered: expectsSuccess });
  expect(jest.getTimerCount()).toBe(0);
  const usesSmtp = ['resend failure + smtp fallback', 'smtp fallback success', 'smtp fallback failure'];
  expect(close).toHaveBeenCalledTimes(usesSmtp.includes(scenario) ? 1 : 0);
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