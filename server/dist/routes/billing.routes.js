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
const zod_1 = require("zod");
const asyncHandler_1 = require("../utils/asyncHandler");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const subscriptionService = __importStar(require("../services/subscription.service"));
const entitlementsService = __importStar(require("../services/entitlements.service"));
const responses_1 = require("../utils/responses");
const router = (0, express_1.Router)();
router.get('/subscription', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sub = await subscriptionService.getMySubscription(req.user.userId);
    (0, responses_1.ok)(res, sub);
}));
const webUpgradeSchema = zod_1.z.object({
    productKey: zod_1.z.enum(['WEB_MONTHLY', 'WEB_YEARLY']),
});
router.post('/subscription/web', auth_1.requireAuth, (0, validate_1.validate)(webUpgradeSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sub = await subscriptionService.upgradeWeb(req.user.userId, req.body.productKey);
    (0, responses_1.ok)(res, sub);
}));
const androidPurchaseSchema = zod_1.z.object({
    productId: zod_1.z.string(),
    purchaseToken: zod_1.z.string().min(5),
    orderId: zod_1.z.string().optional(),
});
router.post('/subscription/android', auth_1.requireAuth, (0, validate_1.validate)(androidPurchaseSchema), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { verifyPlayPurchase } = await Promise.resolve().then(() => __importStar(require('../services/playBillingVerifier')));
    const verification = await verifyPlayPurchase(req.body);
    if (!verification.valid) {
        return res.status(400).json({
            success: false,
            error: { code: 'INVALID_PURCHASE', message: verification.reason || 'Purchase not valid' },
        });
    }
    const sub = await subscriptionService.activateAndroidPurchase({
        userId: req.user.userId,
        ...req.body,
    });
    (0, responses_1.ok)(res, sub);
}));
router.post('/subscription/cancel', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sub = await subscriptionService.cancelSubscription(req.user.userId);
    (0, responses_1.ok)(res, sub);
}));
router.post('/subscription/restore', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await subscriptionService.restorePurchases(req.user.userId);
    (0, responses_1.ok)(res, result);
}));
router.post('/boost', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const boost = await subscriptionService.activateBoost(req.user.userId);
    (0, responses_1.ok)(res, boost);
}));
router.get('/profile-views', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await entitlementsService.listProfileViewers(req.user.userId);
    (0, responses_1.ok)(res, result);
}));
exports.default = router;
//# sourceMappingURL=billing.routes.js.map