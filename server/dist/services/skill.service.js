"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSkills = listSkills;
exports.addUserSkill = addUserSkill;
exports.removeUserSkill = removeUserSkill;
exports.getUserSkills = getUserSkills;
exports.createSkill = createSkill;
exports.updateSkill = updateSkill;
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
async function listSkills(category, includeInactive = false) {
    return prisma_1.prisma.skill.findMany({
        where: {
            isActive: includeInactive ? undefined : true,
            ...(category ? { category } : {}),
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
}
async function addUserSkill(userId, skillId, type, proficiency) {
    const skill = await prisma_1.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill || !skill.isActive)
        throw new errors_1.NotFoundError('Skill not found');
    const existing = await prisma_1.prisma.userSkill.findUnique({
        where: { userId_skillId_type: { userId, skillId, type } },
    });
    if (existing)
        throw new errors_1.ConflictError('Skill already added to your profile');
    return prisma_1.prisma.userSkill.create({
        data: { userId, skillId, type, proficiency },
        include: { skill: true },
    });
}
async function removeUserSkill(userId, skillId, type) {
    const existing = await prisma_1.prisma.userSkill.findUnique({
        where: { userId_skillId_type: { userId, skillId, type } },
    });
    if (!existing)
        throw new errors_1.NotFoundError('Skill not on profile');
    await prisma_1.prisma.userSkill.delete({ where: { id: existing.id } });
}
async function getUserSkills(userId) {
    return prisma_1.prisma.userSkill.findMany({
        where: { userId },
        include: { skill: true },
        orderBy: [{ type: 'asc' }, { skill: { name: 'asc' } }],
    });
}
async function createSkill(input) {
    const exists = await prisma_1.prisma.skill.findUnique({ where: { name: input.name } });
    if (exists)
        throw new errors_1.ConflictError('Skill already exists');
    return prisma_1.prisma.skill.create({ data: input });
}
async function updateSkill(id, input) {
    return prisma_1.prisma.skill.update({ where: { id }, data: input });
}
//# sourceMappingURL=skill.service.js.map