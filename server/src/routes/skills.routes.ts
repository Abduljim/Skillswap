import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  addUserSkillSchema,
  createSkillSchema,
  updateSkillSchema,
} from '../validators/schemas';
import * as skillService from '../services/skill.service';
import { ok } from '../utils/responses';
import { BadRequestError } from '../utils/errors';

const router = Router();

// Public-ish listing
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const category = req.query.category as string | undefined;
    const skills = await skillService.listSkills(category);
    ok(res, skills);
  })
);

// Add a skill to the current user
router.post(
  '/:id/add',
  requireAuth,
  validate(addUserSkillSchema),
  asyncHandler(async (req: any, res) => {
    if (req.params.id !== req.body.skillId) throw new BadRequestError('Skill ID mismatch');
    const created = await skillService.addUserSkill(
      req.user!.userId,
      req.body.skillId,
      req.body.type,
      req.body.proficiency
    );
    ok(res, created);
  })
);

// Remove a skill from the current user
router.delete(
  '/:id/remove',
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const type = (req.query.type as 'TEACH' | 'WANT') || 'TEACH';
    await skillService.removeUserSkill(req.user!.userId, req.params.id, type);
    ok(res, { removed: true });
  })
);

// Admin: create skill
router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate(createSkillSchema),
  asyncHandler(async (req, res) => {
    const created = await skillService.createSkill(req.body);
    ok(res, created);
  })
);

// Admin: update skill
router.put(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(updateSkillSchema),
  asyncHandler(async (req, res) => {
    const updated = await skillService.updateSkill(req.params.id, req.body);
    ok(res, updated);
  })
);

export default router;