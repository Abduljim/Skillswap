import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { prisma } from './lib/prisma';
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
import { initSocket } from './sockets/io';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL === '*' ? true : env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(env.COOKIE_SECRET));

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
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
app.use('/api', safetyRoutes); // /reports, /users/:id/block
app.use('/api', billingRoutes); // /subscription, /boost, /profile-views
app.use('/api/admin', adminRoutes);

// Serve the built web client (SPA) from the same process when present.
// All API routes are mounted above, so this only handles non-API GETs and
// falls back to index.html so React Router paths (/reset-password, …) work.
const publicDir = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  app.use(express.static(publicDir, { maxAge: '7d', index: 'index.html' }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  console.log(`🌐 Serving web client from ${publicDir}`);
} else {
  console.log(`🌐 No web client build found at ${publicDir} — API only.`);
}

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);
initSocket(httpServer);

// Marker for auto-seed status. Set to 'true' via env var when DB is freshly empty.
async function autoSeedIfEmpty() {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log(`🌱 Database already seeded (${userCount} users). Skipping.`);
      return;
    }
    console.log('🌱 Empty database detected. Run `npm run seed` once to populate demo data.');
    console.log('   (Render Shell tab: cd server && npm run seed)');
  } catch (e: any) {
    console.error('⚠️  DB check failed (non-fatal):', e?.message || e);
  }
}

httpServer.listen(env.PORT, () => {
  console.log(`🚀 SkillSwap API running on http://localhost:${env.PORT}`);
  console.log(`📦 Environment: ${env.NODE_ENV}`);
  autoSeedIfEmpty();
});

export default app;