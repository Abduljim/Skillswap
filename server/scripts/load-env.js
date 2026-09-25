/**
 * load-env.js — shared environment loader for standalone Node scripts.
 *
 * The app reads the ROOT .env (server/src/config/env.ts resolves ../../../.env),
 * but scripts run under plain `node`/`tsx` and the Prisma CLI only looks for .env
 * in its working directory (server/) and next to the schema (server/prisma/).
 * Without this, documented commands fail on a fresh clone with
 * "error: Environment variable not found: DATABASE_URL".
 *
 * Precedence (dotenv never overwrites a variable that is already set):
 *   real environment variables  >  server/.env  >  repo root .env
 *
 * Usage:  require('./load-env');            // loads, warns if DATABASE_URL missing
 *         require('./load-env').require();  // loads and exits(1) if missing
 */
const path = require('path');
const dotenv = require('dotenv');

const CANDIDATES = [
  path.resolve(process.cwd(), '.env'), // server/.env
  path.resolve(process.cwd(), '../.env'), // repo root when cwd is server/
  path.resolve(__dirname, '../../.env'), // repo root from any cwd
];

for (const candidate of CANDIDATES) {
  dotenv.config({ path: candidate });
}

function requireDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  console.error(
    '❌ DATABASE_URL is not set.\n' +
      '   Copy the example environment file to the repository root and fill it in:\n' +
      '     cp .env.example .env\n'
  );
  process.exit(1);
}

module.exports = { require: requireDatabaseUrl, CANDIDATES };
