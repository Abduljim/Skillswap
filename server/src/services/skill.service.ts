import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError } from '../utils/errors';

export async function listSkills(category?: string, includeInactive = false) {
  return prisma.skill.findMany({
    where: {
      isActive: includeInactive ? undefined : true,
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

export async function addUserSkill(
  userId: string,
  skillId: string,
  type: 'TEACH' | 'WANT',
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'
) {
  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill || !skill.isActive) throw new NotFoundError('Skill not found');

  const existing = await prisma.userSkill.findUnique({
    where: { userId_skillId_type: { userId, skillId, type } },
  });
  if (existing) throw new ConflictError('Skill already added to your profile');

  return prisma.userSkill.create({
    data: { userId, skillId, type, proficiency },
    include: { skill: true },
  });
}

export async function removeUserSkill(userId: string, skillId: string, type: 'TEACH' | 'WANT') {
  const existing = await prisma.userSkill.findUnique({
    where: { userId_skillId_type: { userId, skillId, type } },
  });
  if (!existing) throw new NotFoundError('Skill not on profile');
  await prisma.userSkill.delete({ where: { id: existing.id } });
}

export async function getUserSkills(userId: string) {
  return prisma.userSkill.findMany({
    where: { userId },
    include: { skill: true },
    orderBy: [{ type: 'asc' }, { skill: { name: 'asc' } }],
  });
}

export async function createSkill(input: { name: string; category: string; description?: string }) {
  const exists = await prisma.skill.findUnique({ where: { name: input.name } });
  if (exists) throw new ConflictError('Skill already exists');
  return prisma.skill.create({ data: input });
}

export async function updateSkill(
  id: string,
  input: { name?: string; category?: string; description?: string; isActive?: boolean }
) {
  return prisma.skill.update({ where: { id }, data: input });
}