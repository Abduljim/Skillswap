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
const safetyService = __importStar(require("../services/safety.service"));
const responses_1 = require("../utils/responses");
const router = (0, express_1.Router)();
router.post('/reports', auth_1.requireAuth, (0, validate_1.validate)(schemas_1.createReportSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const report = await safetyService.reportUser(req.user.userId, req.body);
    (0, responses_1.ok)(res, report);
}));
router.post('/users/:id/block', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await safetyService.blockUser(req.user.userId, req.params.id);
    (0, responses_1.ok)(res, result);
}));
router.delete('/users/:id/block', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await safetyService.unblockUser(req.user.userId, req.params.id);
    (0, responses_1.ok)(res, result);
}));
exports.default = router;
//# sourceMappingURL=safety.routes.js.map