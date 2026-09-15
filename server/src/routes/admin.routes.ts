import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import * as adminService from '../services/admin.service';
import * as skillService from '../services/skill.service';
import { ok } from '../utils/responses';
import { validate } from '../middleware/validate';
import { adminUpdateUserSchema } from '../validators/schemas';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const stats = await adminService.getStats();
    ok(res, stats);
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const page = parseInt((req.query.page as string) || '1');
    const pageSize = parseInt((req.query.pageSize as string) || '20');
    const q = req.query.q as string | undefined;
    const result = await adminService.listUsers({ page, pageSize, q });
    ok(res, result);
  })
);

router.put(
  '/users/:id',
  validate(adminUpdateUserSchema),
  asyncHandler(async (req, res) => {
    const updated = await adminService.updateUser(req.params.id, req.body);
    ok(res, updated);
  })
);

router.get(
  '/skills',
  asyncHandler(async (_req, res) => {
    const skills = await skillService.listSkills(undefined, true);
    ok(res, skills);
  })
);

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const status = req.query.status as any;
    const reports = await adminService.listReports({ status });
    ok(res, reports);
  })
);

router.put(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    const updated = await adminService.updateReport(req.params.id, req.body);
    ok(res, updated);
  })
);

export default router;