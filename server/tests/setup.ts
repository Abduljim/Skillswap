// Test setup
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jest-runs-only';
process.env.DATABASE_URL = 'postgresql://localhost:5432/skillswap_test';