/**
 * Seed script for SkillSwap.
 *   1. Upserts the 200+ skill catalogue (additive, idempotent).
 *   2. Permanently removes the built-in demo accounts (they were placeholders;
 *      real user accounts are never touched).
 *
 * Run: cd server && npm run seed           (uses tsx)
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { SKILLS } from '../src/catalogue';

// This script runs under plain `tsx`, so nothing loads the repository's .env.
// Without this, `npm run seed` fails on a fresh clone with
// "Environment variable not found: DATABASE_URL".
// Precedence (dotenv never overwrites what is already set):
//   real environment variables > server/.env > repo root .env
for (const candidate of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../.env'),
]) {
  dotenv.config({ path: candidate });
}

const prisma = new PrismaClient();

// Built-in demo accounts that must never appear in production. Only these exact
// emails are removed — every other account is preserved.
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

// Demo accounts — these are fixture data only and must never exist in a running
// instance. The seed permanently removes any that were created by an older
// version of this script. The app starts with zero user accounts.
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding SkillSwap…');

  // ── Skills (always additive, idempotent) ──────────────────────────────────
  const skillCount = await prisma.skill.count();
  console.log(`Upserting ${SKILLS.length} skills…`);

  // One idempotent statement instead of 280+ sequential round-trips:
  // missing skills are inserted, existing ones get category/description
  // refreshed and are re-activated.
  const params: unknown[] = [];
  const tuples = SKILLS.map((skill) => {
    params.push(skill.name, skill.category, skill.description ?? null);
    const n = params.length; // 1-indexed placeholders
    return `(gen_random_uuid(), $${n - 2}, $${n - 1}, $${n})`;
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Skill" ("id", "name", "category", "description") VALUES ${tuples.join(', ')}
     ON CONFLICT ("name") DO UPDATE SET
       "category" = EXCLUDED."category",
       "description" = EXCLUDED."description",
       "isActive" = true`,
    ...params
  );

  console.log(`Skills: ${skillCount} → ${await prisma.skill.count()} (missing ones added).`);

  // ── Remove built-in demo accounts ─────────────────────────────────────────
  const demo = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { id: true, email: true },
  });
  if (demo.length) {
    // User delete cascades to profile, userSkills, subscriptions, etc. Some
    // FK constraints (messages, exchanges) can hold up a plain deleteMany, so
    // delete individually in a transaction — the cascade handles cleanup.
    await prisma.$transaction(
      demo.map((u) => prisma.user.delete({ where: { id: u.id } })),
    );
    console.log(`Removed ${demo.length} demo accounts: ${demo.map((u) => u.email).join(', ')}`);
  } else {
    console.log('No demo accounts present (clean state).');
  }

  const realUsers = await prisma.user.count();
  console.log(`Registered users remaining: ${realUsers}`);
  console.log('✅ Seed complete!');
  console.log(`📊 ${await prisma.skill.count()} skills across ${new Set(SKILLS.map((s) => s.category)).size} categories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });