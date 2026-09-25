#!/usr/bin/env node
/**
 * ensure-migrations.js — makes `prisma migrate deploy` safe on a database that
 * was originally created with `prisma db push`.
 *
 * Why this exists
 * ---------------
 * SkillSwap shipped without migration files; the schema was pushed directly.
 * `migrate deploy` on such a database tries to run the baseline migration and
 * fails with "table already exists". Render's free plan gives no shell, so the
 * fix has to run inside the build command.
 *
 * What it does
 * ------------
 *   1. Looks for evidence that the schema already exists (the "User" table).
 *   2. If it does, and the baseline migration is not yet recorded in
 *      `_prisma_migrations`, marks it applied with `prisma migrate resolve
 *      --applied` — the official baselining command. No data is touched.
 *   3. Otherwise does nothing, and `migrate deploy` creates the schema normally.
 *
 * Never destructive: it only ever inserts bookkeeping rows.
 *
 * Run: node scripts/ensure-migrations.js     (before `prisma migrate deploy`)
 */
const { execFileSync } = require('child_process');
const path = require('path');
require('./load-env').require(); // must run before PrismaClient reads DATABASE_URL
const { PrismaClient } = require('@prisma/client');

const BASELINE = '0_init';
const prisma = new PrismaClient();

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    table
  );
  return rows.length > 0;
}

async function baselineIsRecorded() {
  if (!(await tableExists('_prisma_migrations'))) return false;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM _prisma_migrations
      WHERE migration_name = $1 AND rolled_back_at IS NULL LIMIT 1`,
    BASELINE
  );
  return rows.length > 0;
}

async function main() {
  const schemaPresent = await tableExists('User');

  if (!schemaPresent) {
    console.log(`🧭 Empty database — "migrate deploy" will create the schema from ${BASELINE}.`);
    return;
  }

  if (await baselineIsRecorded()) {
    console.log(`🧭 Baseline "${BASELINE}" already recorded — nothing to do.`);
    return;
  }

  console.log(`🧭 Existing schema detected without migration history.`);
  console.log(`   Marking "${BASELINE}" as applied (bookkeeping only, no data changes)…`);
  execFileSync('npx', ['prisma', 'migrate', 'resolve', '--applied', BASELINE], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });
  console.log(`✅ Migration history baselined. Later migrations will now apply cleanly.`);
}

main()
  .catch((err) => {
    console.error('❌ ensure-migrations failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
