import { prisma } from '../lib/prisma';

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
  return prisma.user.update({ where: { id }, data: input });
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