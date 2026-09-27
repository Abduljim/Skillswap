/**
 * FCM failure classification. The value sendFcmV1 returns decides whether
 * push.service.ts deletes a user's stored device token, so a misclassification
 * is data loss rather than a missed notification.
 *
 * The bug this pins down: HTTP 400 used to be classified 'invalid' (dead token),
 * and FCM answers 400 SENDER_ID_MISMATCH when FCM_SERVICE_ACCOUNT_JSON comes
 * from a different Firebase project than the app's google-services.json. One
 * wrong paste would have deleted every user's push token, and push would still
 * be broken after the key was fixed, because there would be nothing left to push
 * to. A wrongly-kept token costs a retry; a wrongly-deleted one is unrecoverable.
 *
 * Drives the real function against a stubbed network — no database, no live
 * calls, no real Firebase project.
 */
import { generateKeyPairSync } from 'crypto';
import { env } from '../src/config/env';
import { sendFcmV1 } from '../src/services/fcm.service';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'skillswap-test',
  client_email: 'firebase-adminsdk-test@skillswap-test.iam.gserviceaccount.com',
  private_key: privateKey,
});

type Stub = { status: number; body: string };

const envRef = env as unknown as Record<string, string>;
const realFetch = globalThis.fetch;
let calls: string[] = [];

/** Stubs both legs: the OAuth token exchange and the messages:send call. */
function stubNetwork(send: Stub) {
  calls = [];
  const fake = (async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('oauth2.googleapis.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'stub-access-token', expires_in: 3600 }),
        text: async () => '',
      };
    }
    return {
      ok: send.status >= 200 && send.status < 300,
      status: send.status,
      json: async () => JSON.parse(send.body || '{}'),
      text: async () => send.body,
    };
  }) as unknown as typeof fetch;
  (globalThis as { fetch: typeof fetch }).fetch = fake;
}

const DATA = { type: 'call_incoming', exchangeId: 'exchange-1' };

beforeAll(() => {
  envRef.FCM_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT;
});

afterAll(() => {
  (globalThis as { fetch: typeof fetch }).fetch = realFetch;
});

describe('sendFcmV1 classification', () => {
  it("reports 'ok' when FCM accepts the message", async () => {
    stubNetwork({ status: 200, body: '{"name":"projects/skillswap-test/messages/1"}' });
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('ok');
  });

  it("treats 400 SENDER_ID_MISMATCH as our fault, not a dead device: 'error'", async () => {
    stubNetwork({
      status: 400,
      body: '{"error":{"status":"SENDER_ID_MISMATCH","message":"Token does not match sender id"}}',
    });
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('error');
  });

  it("treats 400 INVALID_ARGUMENT as our fault too: 'error'", async () => {
    stubNetwork({
      status: 400,
      body: '{"error":{"status":"INVALID_ARGUMENT","message":"Invalid JSON payload"}}',
    });
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('error');
  });

  it("treats 404 UNREGISTERED as the one genuine dead-token verdict: 'invalid'", async () => {
    stubNetwork({
      status: 404,
      body: '{"error":{"status":"UNREGISTERED","message":"Device token no longer valid"}}',
    });
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('invalid');
  });

  it("treats 410 GONE as a dead token: 'invalid'", async () => {
    stubNetwork({ status: 410, body: '{"error":{"status":"UNREGISTERED"}}' });
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('invalid');
  });

  it("never costs a token on 403 PERMISSION_DENIED (bad credentials): 'error'", async () => {
    stubNetwork({
      status: 403,
      body: '{"error":{"status":"PERMISSION_DENIED","message":"Sender or client does not match"}}',
    });
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('error');
  });

  it("never costs a token on 401 UNAUTHENTICATED: 'error'", async () => {
    stubNetwork({
      status: 401,
      body: '{"error":{"status":"UNAUTHENTICATED","message":"Request had invalid authentication"}}',
    });
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('error');
  });

  it('survives a 500 from FCM without blaming the device', async () => {
    stubNetwork({ status: 500, body: '{"error":{"status":"INTERNAL"}}' });
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('error');
  });

  it('never touches the network when the service account JSON is unusable', async () => {
    stubNetwork({ status: 200, body: '{}' });
    envRef.FCM_SERVICE_ACCOUNT_JSON = '{"project_id":"skillswap-test"}'; // no key, no email
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('error');
    expect(calls).toEqual([]);
    envRef.FCM_SERVICE_ACCOUNT_JSON = 'not json at all';
    await expect(sendFcmV1('device-token', DATA)).resolves.toBe('error');
    expect(calls).toEqual([]);
    envRef.FCM_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT;
  });
});
