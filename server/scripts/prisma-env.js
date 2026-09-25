#!/usr/bin/env node
/**
 * prisma-env.js — runs the Prisma CLI with the repository's environment loaded.
 *
 * Why: the app reads the ROOT .env (server/src/config/env.ts resolves
 * ../../../.env), but the Prisma CLI only looks for .env in its working
 * directory (server/) and next to the schema (server/prisma/). On a fresh clone
 * neither exists, so `npm run migrate` / `prisma db push` die with
 * "error: Environment variable not found: DATABASE_URL".
 *
 * Precedence (dotenv never overwrites what is already set):
 *   real environment variables  >  server/.env  >  repo root .env
 *
 * Usage: node scripts/prisma-env.js <any prisma args>
 *   e.g. node scripts/prisma-env.js migrate dev
 */
const { spawnSync } = require('child_process');
const loadEnv = require('./load-env');

loadEnv.require();

// `--test` runs the CLI against TEST_DATABASE_URL instead of the dev database.
const args = process.argv.slice(2);
if (args[0] === '--test') {
  args.shift();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    console.error('❌ TEST_DATABASE_URL is not set — refusing to run against the dev database.');
    process.exit(1);
  }
  process.env.DATABASE_URL = testUrl;
}

// The CLI is hoisted to the workspace root by npm workspaces, so resolve it
// instead of hardcoding a node_modules path.
const cli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
