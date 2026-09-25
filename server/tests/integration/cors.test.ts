/**
 * CORS — an explicit allowlist instead of reflecting any Origin.
 *
 * The previous configuration was `origin: env.CLIENT_URL === '*' ? true : …`
 * with `credentials: true`, and render.yaml sets CLIENT_URL='*'. That reflected
 * every Origin back with credentials, so any website a logged-in user visited
 * could read their data and drive their session.
 */
import { api, resetDatabase, prisma } from '../helpers/api';

const EVIL = 'https://evil.example';
const ANDROID_WEBVIEW = 'https://localhost'; // capacitor androidScheme: "https"
const DEV_WEB = 'http://localhost:5173';

describe('CORS allowlist', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('blocks an unknown origin and sends no allow-header', async () => {
    const res = await api().get('/health').set('Origin', EVIL).expect(403);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks an unknown origin on a preflight too', async () => {
    const res = await api()
      .options('/api/auth/me')
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'GET')
      .expect(403);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the Android WebView origin (native app calls the API cross-origin)', async () => {
    const res = await api().get('/health').set('Origin', ANDROID_WEBVIEW).expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(ANDROID_WEBVIEW);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows the local dev web origin', async () => {
    const res = await api().get('/health').set('Origin', DEV_WEB).expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(DEV_WEB);
  });

  it('answers a preflight from an allowed origin with credentials enabled', async () => {
    const res = await api()
      .options('/api/auth/me')
      .set('Origin', DEV_WEB)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(DEV_WEB);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('never reflects an arbitrary subdomain of an allowed host', async () => {
    await api().get('/health').set('Origin', 'http://localhost:5173.evil.example').expect(403);
  });

  it('lets same-origin and native requests through with no Origin header', async () => {
    // Not a CORS decision at all: no Origin means same-origin browser call,
    // the WebView bridge, curl, or server-to-server traffic.
    await api().get('/health').expect(200);
    await api().get('/api/auth/me').expect(401); // reaches auth, not CORS
  });
});
