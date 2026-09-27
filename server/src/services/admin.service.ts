import { prisma } from '../lib/prisma';
import { env, playVerificationEnabled } from '../config/env';
import { fcmDiagnostics } from './fcm.service';
import { resetLinkBase } from './auth.service';
import { emailDiagnostics } from './email.service';
import { storageConfigured, missingStorageConfig } from './supabase.service';

export async function getStats() {
  const [
    userCount,
    activeUserCount,
    activeExchanges,
    completedExchanges,
    openReports,
    skills,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.exchange.count({ where: { status: 'ACTIVE' } }),
    prisma.exchange.count({ where: { status: 'COMPLETED' } }),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.skill.count(),
  ]);

  // Popular skills (most taught)
  const popularSkills = await prisma.userSkill.groupBy({
    by: ['skillId'],
    where: { type: 'TEACH' },
    _count: { skillId: true },
    orderBy: { _count: { skillId: 'desc' } },
    take: 10,
  });
  const popularSkillIds = popularSkills.map((p) => p.skillId);
  const skillInfo = await prisma.skill.findMany({
    where: { id: { in: popularSkillIds } },
    select: { id: true, name: true, category: true },
  });
  const skillMap = new Map(skillInfo.map((s) => [s.id, s]));

  // Most requested (most wanted)
  const mostRequested = await prisma.userSkill.groupBy({
    by: ['skillId'],
    where: { type: 'WANT' },
    _count: { skillId: true },
    orderBy: { _count: { skillId: 'desc' } },
    take: 10,
  });
  const requestedIds = mostRequested.map((p) => p.skillId);
  const reqInfo = await prisma.skill.findMany({
    where: { id: { in: requestedIds } },
    select: { id: true, name: true, category: true },
  });
  const reqMap = new Map(reqInfo.map((s) => [s.id, s]));

  return {
    userCount,
    activeUserCount,
    activeExchanges,
    completedExchanges,
    openReports,
    skillsCount: skills,
    popularSkills: popularSkills.map((p) => ({
      ...skillMap.get(p.skillId),
      teacherCount: p._count.skillId,
    })),
    mostRequested: mostRequested.map((p) => ({
      ...reqMap.get(p.skillId),
      learnerCount: p._count.skillId,
    })),
  };
}

export async function listUsers(opts: { page: number; pageSize: number; q?: string }) {
  const where: any = {};
  if (opts.q) {
    where.OR = [
      { displayName: { contains: opts.q, mode: 'insensitive' } },
      { email: { contains: opts.q, mode: 'insensitive' } },
    ];
  }
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        isAdmin: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { users, total };
}

export async function updateUser(
  id: string,
  input: { isActive?: boolean; isAdmin?: boolean }
) {
  // Deactivating an account must also kill its live sessions and sockets;
  // otherwise a banned user keeps a valid token for up to a year.
  const data: { isActive?: boolean; isAdmin?: boolean; tokenVersion?: { increment: number } } = {
    ...input,
  };
  if (input.isActive === false) data.tokenVersion = { increment: 1 };

  return prisma.user.update({ where: { id }, data });
}

export async function listReports(opts: { status?: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED' }) {
  return prisma.report.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      reporter: { select: { id: true, displayName: true, email: true } },
      reportedUser: { select: { id: true, displayName: true, email: true } },
    },
  });
}

export async function updateReport(
  id: string,
  input: { status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED' }
) {
  return prisma.report.update({
    where: { id },
    data: {
      status: input.status,
      resolvedAt: input.status === 'RESOLVED' || input.status === 'DISMISSED' ? new Date() : null,
    },
  });
}

/**
 * Live health of every external integration, for GET /api/admin/diagnostics.
 *
 * Each check contacts the real service rather than reporting whether an
 * environment variable is non-empty: a pasted key that is truncated, from the
 * wrong project, or stripped of its newlines by a dashboard looks perfectly
 * "configured" and then fails silently at 2am. Values are redacted — this
 * response is meant to be safe to paste into a chat or an issue.
 */
export async function getDiagnostics() {
  const [push, email, deviceTokens, users, messages, exchanges] = await Promise.all([
    fcmDiagnostics(),
    emailDiagnostics(),
    prisma.pushToken.count(),
    prisma.user.count(),
    prisma.message.count(),
    prisma.exchange.count(),
  ]);

  let supabaseHost = '';
  try {
    supabaseHost = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).host : '';
  } catch {
    supabaseHost = 'SUPABASE_URL is not a valid URL';
  }

  return {
    generatedAt: new Date().toISOString(),
    push: {
      ...push,
      deviceTokens,
      legacyServerKeySet: Boolean(env.FCM_SERVER_KEY),
      hint:
        push.oauth === 'ok' && deviceTokens === 0
          ? 'Credentials work, but no device has registered a token yet. Install the app, sign in, then send that account a message.'
          : push.oauth === 'ok'
            ? 'Credentials work and devices are registered.'
            : 'Fix the credential problem in "error" before expecting any notification.',
    },
    // The base password-reset links are built from, without a token. Worth
    // reporting because a wildcard or a localhost default here produces emails
    // that are delivered, log nothing wrong, and cannot be clicked.
    email: { ...email, resetLinkBase: resetLinkBase() },
    media: {
      configured: storageConfigured(),
      missing: missingStorageConfig(),
      bucket: env.SUPABASE_MEDIA_BUCKET,
      supabaseHost,
    },
    billing: {
      playVerificationEnabled,
      playServiceAccountSet: Boolean(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON),
      hint: playVerificationEnabled
        ? 'Android Pro purchases are verified against Google Play.'
        : 'PLAY_BILLING_VERIFY is not "true", so the server rejects every Android Pro purchase. Revenue is off.',
    },
    database: { users, messages, exchanges },
  };
}
