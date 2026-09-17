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
const profileService = __importStar(require("../services/profile.service"));
const responses_1 = require("../utils/responses");
const validate_1 = require("../middleware/validate");
const schemas_1 = require("../validators/schemas");
const router = (0, express_1.Router)();
router.get('/', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const profile = await profileService.getProfile(req.user.userId);
    (0, responses_1.ok)(res, profile);
}));
router.put('/', auth_1.requireAuth, (0, validate_1.validate)(schemas_1.updateProfileSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const profile = await profileService.updateProfile(req.user.userId, req.body);
    (0, responses_1.ok)(res, profile);
}));
exports.default = router;
//# sourceMappingURL=profile.routes.js.map