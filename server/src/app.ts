/**
 * app.ts — the Express application, with no side effects on import.
 *
 * Keeping the app separate from the bootstrap (index.ts) means integration tests
 * can `import app from './app'` and drive it with supertest without binding a
 * port, attaching Socket.IO, or running the boot-time catalogue sync.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { env, allowedOrigins } from './config/env';
import { ForbiddenError } from './utils/errors';
import { errorHandler, notFoundHandler } from './middleware/error';
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import usersRoutes from './routes/users.routes';
import skillsRoutes from './routes/skills.routes';
import matchesRoutes from './routes/matches.routes';
import exchangeRequestsRoutes from './routes/exchangeRequests.routes';
import exchangesRoutes from './routes/exchanges.routes';
import messagesRoutes from './routes/messages.routes';
import sessionsRoutes from './routes/sessions.routes';
import notificationsRoutes from './routes/notifications.routes';
import safetyRoutes from './routes/safety.routes';
import adminRoutes from './routes/admin.routes';
import billingRoutes from './routes/billing.routes';
import callsRoutes from './routes/calls.routes';

const isTest = env.NODE_ENV === 'test';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      // Explicit allowlist. Reflecting an arbitrary Origin with credentials:true
      // would let any website make authenticated requests and read the responses.
      origin(origin, callback) {
        // No Origin header: same-origin browser call, the native WebView bridge,
        // curl, or a server-to-server request. Always allowed.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new ForbiddenError(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // Rate limiting is skipped under `jest` so suites stay deterministic.
  const skipInTests = () => isTest;

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      skip: skipInTests,
    })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipInTests,
  });

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/signup', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/skills', skillsRoutes);
  app.use('/api/matches', matchesRoutes);
  app.use('/api/exchange-requests', exchangeRequestsRoutes);
  app.use('/api/exchanges', exchangesRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  // Minted TURN credentials for calls + the group-call limits the UI enforces.
  app.use('/api/calls', callsRoutes);
  app.use('/api', safetyRoutes); // /reports, /users/:id/block
  app.use('/api', billingRoutes); // /subscription, /boost, /profile-views
  app.use('/api/admin', adminRoutes);

  // Serve the built web client (SPA) from the same process when present.
  // All API routes are mounted above, so this only handles non-API GETs and
  // falls back to index.html so React Router paths (/reset-password, …) work.
  const publicDir = path.resolve(__dirname, '../../client/dist');
  if (!isTest && fs.existsSync(path.join(publicDir, 'index.html'))) {
    app.use(express.static(publicDir, { maxAge: '7d', index: 'index.html' }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
