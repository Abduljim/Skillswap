/**
 * index.ts — process bootstrap only.
 *
 * The Express app lives in ./app.ts so tests can import it without binding a
 * port. This file attaches Socket.IO, starts the listener, runs the boot-time
 * tasks and shuts down cleanly (Render sends SIGTERM on every deploy).
 */
import http from 'http';
import { env, allowedOrigins, isProduction, webBillingEnabled, playVerificationEnabled } from './config/env';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import { initSocket } from './sockets/io';
import { SKILLS } from './catalogue';
import { describeTurnConfig } from './services/turn.service';

const app = createApp();
const httpServer = http.createServer(app);
initSocket(httpServer);

/** Prints a hint when the database has no accounts yet. */
async function autoSeedIfEmpty() {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log(`🌱 Database already seeded (${userCount} users). Skipping.`);
      return;
    }
    console.log('🌱 Empty database detected. Run `npm run seed` once to populate the catalogue.');
  } catch (e: any) {
    console.error('⚠️  DB check failed (non-fatal):', e?.message || e);
  }
}

/**
 * Keeps the live skill catalogue in sync on every boot (additive/upsert). This
 * is what ships new skills to existing deployments without a manual seed — the
 * seed scripts use the same list (src/catalogue.ts).
 */
async function ensureDefaultSkills() {
  try {
    const names = SKILLS.map((s) => s.name);
    const existing = await prisma.skill.findMany({
      where: { name: { in: names } },
      select: { name: true },
    });
    const have = new Set(existing.map((s) => s.name));
    const missing = SKILLS.filter((s) => !have.has(s.name));
    if (!missing.length) return;
    // One statement instead of 287 sequential upserts on a fresh database.
    await prisma.skill.createMany({
      data: missing.map((s) => ({
        name: s.name,
        category: s.category,
        description: s.description ?? null,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    console.log(`🌱 Catalogue synced: added ${missing.length} skills.`);
  } catch (e: any) {
    console.error('⚠️  Catalogue sync failed (non-fatal):', e?.message || e);
  }
}

/** Prints security-relevant configuration once at boot so misconfigurations show up in deploy logs. */
function logConfigSummary() {
  console.log(`🔐 CORS allowlist: ${allowedOrigins.join(', ')}`);
  // A missing relay looks exactly like a firewall problem from the user's seat
  // ("the call rang and nobody could hear anything"), so say what is configured.
  console.log(`📞 [turn] ${describeTurnConfig()}`);
  if (env.CLIENT_URL === '*') {
    console.log('ℹ️  CLIENT_URL="*" is treated as "not configured" — only the allowlist above is permitted.');
  }
  if (isProduction) {
    if (!webBillingEnabled) {
      console.log('💳 POST /api/subscription/web is DISABLED (no payment provider). Set ENABLE_WEB_BILLING=true to open it.');
    } else {
      console.log('⚠️  ENABLE_WEB_BILLING=true — the web upgrade grants PRO without payment.');
    }
    if (!playVerificationEnabled) {
      console.log(
        '⚠️  PLAY_BILLING_VERIFY is not "true": Android purchases cannot be verified and will be REJECTED. ' +
          'Set PLAY_BILLING_VERIFY=true and GOOGLE_PLAY_SERVICE_ACCOUNT_JSON to accept real purchases.'
      );
    }
  }
}

httpServer.listen(env.PORT, () => {
  console.log(`🚀 SkillSwap API running on http://localhost:${env.PORT}`);
  console.log(`📦 Environment: ${env.NODE_ENV}`);
  logConfigSummary();
  autoSeedIfEmpty();
  ensureDefaultSkills();
});

// Graceful shutdown: stop accepting connections, then release the pool.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down…`);
  const forceExit = setTimeout(() => {
    console.error('Forced exit after 10s');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  httpServer.close(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
