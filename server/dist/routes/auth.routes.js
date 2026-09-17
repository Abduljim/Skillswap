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
const schemas_1 = require("../validators/schemas");
const validate_1 = require("../middleware/validate");
const authService = __importStar(require("../services/auth.service"));
const asyncHandler_1 = require("../utils/asyncHandler");
const auth_1 = require("../middleware/auth");
const responses_1 = require("../utils/responses");
const router = (0, express_1.Router)();
router.post('/signup', (0, validate_1.validate)(schemas_1.signupSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await authService.signup(req.body);
    (0, auth_1.setAuthCookie)(res, result.token);
    (0, responses_1.ok)(res, { user: result.user, token: result.token });
}));
router.post('/login', (0, validate_1.validate)(schemas_1.loginSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await authService.login(req.body);
    (0, auth_1.setAuthCookie)(res, result.token);
    (0, responses_1.ok)(res, { user: result.user, token: result.token });
}));
router.post('/logout', (_req, res) => {
    (0, auth_1.clearAuthCookie)(res);
    (0, responses_1.ok)(res, { loggedOut: true });
});
router.get('/me', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const me = await authService.getMe(req.user.userId);
    (0, responses_1.ok)(res, me);
}));
router.post('/forgot-password', (0, validate_1.validate)(schemas_1.forgotPasswordSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await authService.requestPasswordReset(req.body.email).catch(() => undefined);
    (0, responses_1.ok)(res, { message: 'If an account exists for that email, you will receive a password reset link.' });
}));
router.post('/reset-password', (0, validate_1.validate)(schemas_1.resetPasswordSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.password);
    (0, responses_1.ok)(res, { message: 'Password reset successfully' });
}));
router.post('/change-password', auth_1.requireAuth, (0, validate_1.validate)(schemas_1.changePasswordSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await authService.changePassword({
        userId: req.user.userId,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
    });
    (0, responses_1.ok)(res, { message: 'Password changed successfully' });
}));
exports.default = router;
//# sourceMappingURL=auth.routes.js.map