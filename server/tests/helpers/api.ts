/**
 * Integration test helpers.
 *
 * These hit the real Express app (src/app.ts) over HTTP with supertest against a
 * real PostgreSQL test database — no mocks. `tests/setup.ts` forces
 * DATABASE_URL to TEST_DATABASE_URL before anything is imported.
 */
import request from 'supertest';
import type { Response } from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/lib/prisma';

export const PASSWORD = 'Sup3rSecret!';

/** The app under test. Importing src/app never binds a port. */
export function api() {
  return request(app);
}

/**
 * Empties every table except Prisma's own bookkeeping. CASCADE handles the FK
 * graph, so this stays correct as the schema grows.
 */
export async function resetDatabase(): Promise<void> {
  const tables: { tablename: string }[] = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );
  if (!tables.length) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Pulls the auth cookie out of a response so later calls can replay it. */
export function cookieFrom(res: Response): string {
  const header = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(header) ? header : header ? [header] : [];
  const auth = cookies.find((c) => c.startsWith('skillswap_token='));
  if (!auth) throw new Error('No skillswap_token cookie in response');
  return auth.split(';')[0] as string;
}

export interface Session {
  userId: string;
  email: string;
  cookie: string;
  token: string;
}

export async function signup(
  email: string,
  displayName = 'Test User',
  password = PASSWORD
): Promise<Session> {
  const res = await api()
    .post('/api/auth/signup')
    .send({ email, password, displayName })
    .expect(200);

  return {
    userId: res.body.data.user.id,
    email: res.body.data.user.email,
    cookie: cookieFrom(res),
    token: res.body.data.token,
  };
}

export async function login(email: string, password = PASSWORD): Promise<Session> {
  const res = await api().post('/api/auth/login').send({ email, password }).expect(200);

  return {
    userId: res.body.data.user.id,
    email: res.body.data.user.email,
    cookie: cookieFrom(res),
    token: res.body.data.token,
  };
}

/** Promotes directly in the database — `requireAdmin` re-reads isAdmin per request. */
export async function makeAdmin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { isAdmin: true } });
}

export async function createSkill(name: string, category = 'Technology'): Promise<string> {
  const skill = await prisma.skill.create({
    data: { name, category, description: `${name} (test)`, isActive: true },
  });
  return skill.id;
}

/** Creates a user row without going through HTTP (for fixtures/admin targets). */
export async function createDbUser(email: string, displayName = 'DB User') {
  return prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash: '$2a$10$unused.unused.unused.unused.unused.unused.unused.unu',
      profile: { create: {} },
    },
    select: { id: true, email: true, isActive: true, tokenVersion: true },
  });
}

export { prisma };
