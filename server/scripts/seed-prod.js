// Run with: node scripts/seed-prod.js
// Used in production on every deploy (in the Render build command).
//
//  1. Upserts the skill catalogue — additive and idempotent, in ONE statement.
//  2. Removes the built-in demo accounts (placeholders; real accounts are never touched).
//  3. Promotes ADMIN_EMAIL to admin so the first real sign-up can use the panel.
//
// The catalogue is NOT duplicated here any more: it is loaded from the compiled
// `src/catalogue.ts` (dist/catalogue.js), which `npm run build:prod` emits just
// before this script runs. One source of truth for dev seed, prod seed and boot sync.
//
// Uses the compiled Prisma client only. No TypeScript, no tsx needed at runtime.

const path = require('path');
const fs = require('fs');
require('./load-env').require(); // must run before PrismaClient reads DATABASE_URL
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Built-in demo accounts that must never appear in production. Only these exact
// emails are removed — every other account is preserved. The app starts empty:
// only real sign-ups create user accounts.
const DEMO_EMAILS = [
  'alice@example.com',
  'bob@example.com',
  'sarah@example.com',
  'david@example.com',
  'fatima@example.com',
  'emma@example.com',
  'james@example.com',
  'zainab@example.com',
];

// ---------- catalogue (compiled from src/catalogue.ts) ----------
const CATALOGUE_PATH = path.resolve(__dirname, '../dist/catalogue.js');

function loadSkills() {
  if (!fs.existsSync(CATALOGUE_PATH)) {
    console.error(
      `❌ ${CATALOGUE_PATH} not found.\n` +
        '   Run `npm run build:prod` before seeding (the Render build command already does).\n' +
        '   Locally: npx esbuild src/catalogue.ts --bundle --platform=node --format=cjs --outfile=dist/catalogue.js'
    );
    process.exit(1);
  }
  const { SKILLS } = require(CATALOGUE_PATH);
  if (!Array.isArray(SKILLS) || SKILLS.length === 0) {
    console.error('❌ dist/catalogue.js exported no SKILLS array.');
    process.exit(1);
  }
  return SKILLS;
}

/**
 * One idempotent upsert for the whole catalogue.
 * Existing rows get their category/description refreshed and are re-activated;
 * missing rows are inserted. Replaces 280+ sequential round-trips per deploy.
 */
async function upsertSkills(skills) {
  const before = await prisma.skill.count();

  const params = [];
  const tuples = skills.map((skill) => {
    params.push(skill.name, skill.category, skill.description ?? null);
    // Placeholders are 1-indexed: after the push, this skill occupies
    // $(n-2) name, $(n-1) category, $(n) description.
    const n = params.length;
    return `(gen_random_uuid(), $${n - 2}, $${n - 1}, $${n})`;
  });

  const sql =
    `INSERT INTO "Skill" ("id", "name", "category", "description") VALUES ${tuples.join(', ')} ` +
    `ON CONFLICT ("name") DO UPDATE SET ` +
    `"category" = EXCLUDED."category", "description" = EXCLUDED."description", "isActive" = true`;

  await prisma.$executeRawUnsafe(sql, ...params);

  const after = await prisma.skill.count();
  console.log(`Skills: ${before} → ${after} (${after - before} added, existing refreshed).`);
}

async function main() {
  console.log('🌱 Seeding SkillSwap…');

  const SKILLS = loadSkills();
  console.log(`Upserting ${SKILLS.length} skills from dist/catalogue.js…`);
  await upsertSkills(SKILLS);

  // ── Remove built-in demo accounts ─────────────────────────────────────────
  const demo = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { id: true, email: true },
  });
  if (demo.length) {
    // CASCADE covers profile, userSkills, subscriptions, etc. but message &
    // exchange constraints can hold up a plain deleteMany. Wrap in a transaction.
    await prisma.$transaction(demo.map((u) => prisma.user.delete({ where: { id: u.id } })));
    console.log(`Removed ${demo.length} demo accounts: ${demo.map((u) => u.email).join(', ')}`);
  } else {
    console.log('No demo accounts present (clean state).');
  }

  console.log(`Registered users remaining: ${await prisma.user.count()}`);

  // ── Bootstrap admin ────────────────────────────────────────────────────────
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  if (adminEmail) {
    const promoted = await prisma.user.updateMany({
      where: { email: adminEmail, isAdmin: false },
      data: { isAdmin: true },
    });
    console.log(`ADMIN_EMAIL bootstrap: promoted ${promoted.count} account(s) (${adminEmail})`);
  }

  console.log('✅ Seed complete!');
  console.log(
    `📊 ${await prisma.skill.count()} skills across ${new Set(SKILLS.map((s) => s.category)).size} categories`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
