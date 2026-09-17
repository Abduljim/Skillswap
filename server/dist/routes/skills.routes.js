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
const validate_1 = require("../middleware/validate");
const schemas_1 = require("../validators/schemas");
const skillService = __importStar(require("../services/skill.service"));
const responses_1 = require("../utils/responses");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
// Public-ish listing
router.get('/', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const category = req.query.category;
    const skills = await skillService.listSkills(category);
    (0, responses_1.ok)(res, skills);
}));
// Add a skill to the current user
router.post('/:id/add', auth_1.requireAuth, (0, validate_1.validate)(schemas_1.addUserSkillSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (req.params.id !== req.body.skillId)
        throw new errors_1.BadRequestError('Skill ID mismatch');
    const created = await skillService.addUserSkill(req.user.userId, req.body.skillId, req.body.type, req.body.proficiency);
    (0, responses_1.ok)(res, created);
}));
// Remove a skill from the current user
router.delete('/:id/remove', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const type = req.query.type || 'TEACH';
    await skillService.removeUserSkill(req.user.userId, req.params.id, type);
    (0, responses_1.ok)(res, { removed: true });
}));
// Admin: create skill
router.post('/', auth_1.requireAuth, auth_1.requireAdmin, (0, validate_1.validate)(schemas_1.createSkillSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const created = await skillService.createSkill(req.body);
    (0, responses_1.ok)(res, created);
}));
// Admin: update skill
router.put('/:id', auth_1.requireAuth, auth_1.requireAdmin, (0, validate_1.validate)(schemas_1.updateSkillSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const updated = await skillService.updateSkill(req.params.id, req.body);
    (0, responses_1.ok)(res, updated);
}));
exports.default = router;
//# sourceMappingURL=skills.routes.js.map