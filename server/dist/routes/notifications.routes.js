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
const notifService = __importStar(require("../services/notification.service"));
const prisma_1 = require("../lib/prisma");
const responses_1 = require("../utils/responses");
const router = (0, express_1.Router)();
// Register a Firebase Cloud Messaging device token for this user so incoming
// calls can ring even when the app isn't open (Android native push).
router.post('/push-token', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token || token.length < 20 || token.length > 512) {
        return res.status(400).json({ error: 'A valid push token is required.' });
    }
    const platform = typeof req.body?.platform === 'string' ? req.body.platform.slice(0, 20) : 'android';
    await prisma_1.prisma.pushToken.upsert({
        where: { token },
        create: { token, userId: req.user.userId, platform },
        update: { userId: req.user.userId, platform, updatedAt: new Date() },
    });
    (0, responses_1.ok)(res, { registered: true });
}));
router.delete('/push-token', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (token) {
        await prisma_1.prisma.pushToken.deleteMany({ where: { token, userId: req.user.userId } });
    }
    (0, responses_1.ok)(res, { unregistered: true });
}));
router.get('/', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const list = await notifService.listNotifications(req.user.userId);
    const unreadCount = list.filter((n) => !n.isRead).length;
    (0, responses_1.ok)(res, { notifications: list, unreadCount });
}));
router.post('/:id/read', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const updated = await notifService.markRead(req.user.userId, req.params.id);
    (0, responses_1.ok)(res, updated);
}));
router.post('/read-all', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await notifService.markAllRead(req.user.userId);
    (0, responses_1.ok)(res, { updated: result.count });
}));
exports.default = router;
//# sourceMappingURL=notifications.routes.js.map