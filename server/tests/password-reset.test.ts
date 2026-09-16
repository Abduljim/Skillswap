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
let logs: jest.SpyInstance[];

beforeEach(() => {
  jest.resetAllMocks();
  env.NODE_ENV = 'development';
  env.SMTP_HOST = 'smtp.example.test';
  env.SMTP_FROM = 'support@example.test';
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
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  } finally {
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});

function deliveryScenario(scenario: string) {
  if (scenario === 'missing account') findUser.mockResolvedValue(null);
  if (scenario === 'no SMTP') env.SMTP_HOST = '';
  if (scenario === 'delivery failure') {
    sendMail.mockImplementation(async (message) => {
      throw new Error(`${message.to}: ${message.text} ${message.html}`);
    });
  }
}

describe.each(['development', 'production'])('Password reset privacy in %s', (mode) => {
  describe.each(['delivery success', 'delivery failure', 'no SMTP', 'missing account'])('%s', (scenario) => {
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
      }
      if (scenario === 'no SMTP' || scenario === 'missing account') {
        expect(createTransport).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
      } else {
        const message = sendMail.mock.calls[0][0];
        const raw = message.text.match(/token=([a-f0-9]{64})/)[1];
        expect(message.to).toBe(email);
        expect(createToken).toHaveBeenCalledWith({
          data: {
            userId: 'user-id',
            tokenHash: createHash('sha256').update(raw).digest('hex'),
            expiresAt: expect.any(Date),
          },
        });
        expect(JSON.stringify(createToken.mock.calls)).not.toContain(raw);
        expect(close).toHaveBeenCalledTimes(1);
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
  });
});

it.each(['lookup', 'token persistence'])('acknowledges %s failures without returning or logging internal errors', async (stage) => {
  const error = new Error(`Internal error for ${email}, token=private-reset-token`);
  if (stage === 'lookup') findUser.mockRejectedValue(error);
  else createToken.mockRejectedValue(error);

  const response = await request(app).post('/auth/forgot-password').send({ email });

  expect(response.status).toBe(200);
  expect(response.body).toEqual(acknowledgment);
  expect(sendMail).not.toHaveBeenCalled();
});

it('bounds the entire reset email delivery and closes a stalled transporter', async () => {
  jest.useFakeTimers();
  let rejectDelivery!: (error: Error) => void;
  sendMail.mockImplementation(() => new Promise((_resolve, reject) => {
    rejectDelivery = reject;
  }));
  const result = requestPasswordReset(email);
  const settled = jest.fn();
  void result.then(settled);

  await jest.advanceTimersByTimeAsync(14_999);
  expect(settled).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  }));
  await jest.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toBeUndefined();
  expect(close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);

  rejectDelivery(new Error(sendMail.mock.calls[0][0].text));
  await jest.advanceTimersByTimeAsync(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it.each(['success', 'failure', 'timeout', 'transport setup failure', 'no sender'])('returns only delivery status and clears timers after %s', async (scenario) => {
  jest.useFakeTimers();
  const resetUrl = 'https://example.test/reset-password?token=private-reset-token';
  if (scenario === 'failure') sendMail.mockRejectedValue(new Error(resetUrl));
  if (scenario === 'timeout') sendMail.mockReturnValue(new Promise(() => {}));
  if (scenario === 'transport setup failure') {
    createTransport.mockImplementation(() => { throw new Error(resetUrl); });
  }
  if (scenario === 'no sender') env.SMTP_FROM = '';

  const result = sendPasswordResetEmail(email, resetUrl);
  await jest.advanceTimersByTimeAsync(scenario === 'timeout' ? 15_000 : 0);

  await expect(result).resolves.toEqual({ delivered: scenario === 'success' });
  expect(jest.getTimerCount()).toBe(0);
  expect(close).toHaveBeenCalledTimes(['transport setup failure', 'no sender'].includes(scenario) ? 0 : 1);
});

it('contains transporter cleanup errors even on timeout', async () => {
  jest.useFakeTimers();
  sendMail.mockReturnValue(new Promise(() => {}));
  close.mockImplementation(() => { throw new Error(`Private reset details for ${email}`); });
  const result = requestPasswordReset(email);

  await jest.advanceTimersByTimeAsync(15_000);

  await expect(result).resolves.toBeUndefined();
  expect(close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
