"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const asyncHandler_1 = require("../utils/asyncHandler");
const auth_1 = require("../middleware/auth");
const adminService = __importStar(require("../services/admin.service"));
const skillService = __importStar(require("../services/skill.service"));
const responses_1 = require("../utils/responses");
const validate_1 = require("../middleware/validate");
const schemas_1 = require("../validators/schemas");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth, auth_1.requireAdmin);
router.get('/stats', (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const stats = await adminService.getStats();
    (0, responses_1.ok)(res, stats);
}));
router.get('/users', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const page = parseInt(req.query.page || '1');
    const pageSize = parseInt(req.query.pageSize || '20');
    const q = req.query.q;
    const result = await adminService.listUsers({ page, pageSize, q });
    (0, responses_1.ok)(res, result);
}));
router.put('/users/:id', (0, validate_1.validate)(schemas_1.adminUpdateUserSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const updated = await adminService.updateUser(req.params.id, req.body);
    (0, responses_1.ok)(res, updated);
}));
router.get('/skills', (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const skills = await skillService.listSkills(undefined, true);
    (0, responses_1.ok)(res, skills);
}));
router.get('/reports', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const status = req.query.status;
    const reports = await adminService.listReports({ status });
    (0, responses_1.ok)(res, reports);
}));
router.put('/reports/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const updated = await adminService.updateReport(req.params.id, req.body);
    (0, responses_1.ok)(res, updated);
}));
exports.default = router;
//# sourceMappingURL=admin.routes.js.map