#!/usr/bin/env node
/**
 * ensure-migrations.js — makes `prisma migrate deploy` safe on a database that
 * was originally created with `prisma db push`, and able to recover from a
 * migration that already failed.
 *
 * Why this exists
 * ---------------
 * SkillSwap shipped without migration files; the schema was pushed directly.
 * `migrate deploy` on such a database tries to run the baseline migration and
 * fails with "table already exists". Render's free plan gives no shell, so the
 * fix has to run inside the build command.
 *
 * The same root cause produced a second, stickier failure. Because the schema
 * was pushed, columns added by later migrations can already exist, so a
 * migration like `ADD COLUMN "tokenVersion"` fails with 42701. Prisma records
 * that migration as FAILED and then refuses to apply anything at all until the
 * failure is resolved (P3018) — every subsequent deploy dies in the same place,
 * even after the SQL is fixed. Step 2 below clears that state so the corrected,
 * idempotent migration is retried.
 *
 * What it does
 * ------------
 *   1. Looks for evidence that the schema already exists (the "User" table).
 *   2. Clears any migration left in a failed state (`finished_at IS NULL` and
 *      not rolled back) with `prisma migrate resolve --rolled-back`, which is
 *      the documented recovery path and lets `migrate deploy` retry it.
 *   3. Re-records the checksum of an already-applied migration whose file was
 *      hardened afterwards. Prisma stores a SHA-256 of migration.sql and fails
 *      the deploy on a mismatch, so editing a migration to make it idempotent
 *      would otherwise brick every database that had already applied it.
 *   4. If the baseline migration is not yet recorded in `_prisma_migrations`,
 *      marks it applied with `prisma migrate resolve --applied` — the official
 *      baselining command. No data is touched.
 *   5. Otherwise does nothing, and `migrate deploy` creates the schema normally.
 *
 * Never destructive: it only ever inserts, clears or re-records bookkeeping
 * rows, and it never drops a table, column or row of application data.
 *
 * Companion rules for migrations in this repo:
 *   - They MUST be re-runnable (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF
 *     NOT EXISTS`, guarded UPDATEs), because on a db-push database the schema
 *     they describe may already exist.
 *   - An already-released migration may only be edited to make it idempotent or
 *     to fix a comment — never to change what it does. Step 3 re-records the
 *     checksum on trust, so a substantive edit would silently pass on databases
 *     that already applied the old version and never reach them.
 *
 * Run: node scripts/ensure-migrations.js     (before `prisma migrate deploy`)
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('./load-env').require(); // must run before PrismaClient reads DATABASE_URL
const { PrismaClient } = require('@prisma/client');

const BASELINE = '0_init';
const SERVER_ROOT = path.resolve(__dirname, '..');
const prisma = new PrismaClient();

function resolve(...args) {
  execFileSync('npx', ['prisma', 'migrate', 'resolve', ...args], {
    cwd: SERVER_ROOT,
    stdio: 'inherit',
  });
}

async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    table
  );
  return rows.length > 0;
}

/** Migrations Prisma started but never finished, and has not rolled back. */
async function failedMigrations() {
  if (!(await tableExists('_prisma_migrations'))) return [];
  return prisma.$queryRawUnsafe(
    `SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
      ORDER BY started_at`
  );
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

/** Only resolve failures for migrations that still exist in the repo. */
function migrationDirExists(name) {
  return fs.existsSync(path.join(SERVER_ROOT, 'prisma', 'migrations', name));
}

async function healFailedMigrations() {
  const failed = await failedMigrations();
  if (!failed.length) return;

  console.log(`🩺 ${failed.length} migration(s) left in a failed state — Prisma will refuse to`);
  console.log(`   apply anything until they are resolved (error P3018). Clearing them so the`);
  console.log(`   corrected, idempotent SQL is retried by "migrate deploy":`);

  for (const { migration_name: name } of failed) {
    if (!migrationDirExists(name)) {
      console.log(`   ⚠ "${name}" failed but no longer exists in prisma/migrations — skipping.`);
      console.log(`     Resolve it by hand if "migrate deploy" still complains.`);
      continue;
    }
    console.log(`   ↩ "${name}" → prisma migrate resolve --rolled-back`);
    resolve('--rolled-back', name);
  }
  console.log(`✅ Failed migrations cleared. Retrying them on this deploy.`);
}

/**
 * Prisma records a SHA-256 of each migration file and refuses to deploy when a
 * recorded checksum no longer matches. Hardening an already-applied migration
 * (the `IF NOT EXISTS` fix above) changes that hash, so without this every
 * database that had already applied it — a laptop, staging — would fail the
 * deploy with "checksum mismatch" instead of moving on.
 *
 * Repair = drop the bookkeeping row and re-record it with `migrate resolve
 * --applied`, which recomputes the checksum from the file. The migration is not
 * re-run and no data is touched.
 */
async function repairChangedChecksums() {
  if (!(await tableExists('_prisma_migrations'))) return;

  const applied = await prisma.$queryRawUnsafe(
    `SELECT migration_name, checksum FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY started_at`
  );

  for (const row of applied) {
    const file = path.join(SERVER_ROOT, 'prisma', 'migrations', row.migration_name, 'migration.sql');
    if (!fs.existsSync(file)) continue; // migration removed from the repo: leave the row alone

    const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (actual === row.checksum) continue;

    console.log(`🔁 "${row.migration_name}" was applied from an older copy of its file.`);
    console.log(`     recorded checksum ${String(row.checksum).slice(0, 12)}… ≠ file ${actual.slice(0, 12)}…`);
    console.log(`     Re-recording it (migration is NOT re-run, no data is touched).`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM _prisma_migrations WHERE migration_name = $1`,
      row.migration_name
    );
    resolve('--applied', row.migration_name);
  }
}

async function main() {
  const schemaPresent = await tableExists('User');

  if (!schemaPresent) {
    console.log(`🧭 Empty database — "migrate deploy" will create the schema from ${BASELINE}.`);
    return;
  }

  // Runs before baselining: a database can have a recorded baseline AND a later
  // migration that failed, which is exactly the state a failed deploy leaves.
  await healFailedMigrations();
  await repairChangedChecksums();

  if (await baselineIsRecorded()) {
    console.log(`🧭 Baseline "${BASELINE}" already recorded — nothing to do.`);
    return;
  }

  console.log(`🧭 Existing schema detected without migration history.`);
  console.log(`   Marking "${BASELINE}" as applied (bookkeeping only, no data changes)…`);
  resolve('--applied', BASELINE);
  console.log(`✅ Migration history baselined. Later migrations will now apply cleanly.`);
}

main()
  .catch((err) => {
    console.error('❌ ensure-migrations failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
