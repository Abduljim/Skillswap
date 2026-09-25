// Test setup — runs before every suite (jest `setupFilesAfterEnv`).
//
// The repository's .env is loaded first so TEST_DATABASE_URL can come from it,
// then DATABASE_URL is FORCED to the test database. Nothing here may ever point
// at the development database: integration tests truncate tables.
import loadEnv = require('../scripts/load-env');

loadEnv; // ensure the module is evaluated (loads .env into process.env)

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest-runs-only';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/skillswap_test';

// Safety net: refuse to run against anything that is not obviously a test database.
if (!/(_test|test_|skillswap_test)/.test(TEST_DATABASE_URL)) {
  throw new Error(
    `TEST_DATABASE_URL must point at a dedicated test database (got "${TEST_DATABASE_URL}"). ` +
      'Tests truncate tables.'
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;
