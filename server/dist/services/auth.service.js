"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signup = signup;
exports.login = login;
exports.getMe = getMe;
exports.requestPasswordReset = requestPasswordReset;
exports.changePassword = changePassword;
exports.resetPassword = resetPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../utils/errors");
const crypto_1 = require("crypto");
const env_1 = require("../config/env");
const email_service_1 = require("./email.service");
const entitlements_service_1 = require("./entitlements.service");
const streak_service_1 = require("./streak.service");
// Bootstrap admin: when ADMIN_EMAIL is set, that account is granted admin on
// signup and on every login, so the very first real account can run the admin
// panel without any manual database access.
async function ensureAdminRole(email) {
    if (!env_1.env.ADMIN_EMAIL || email !== env_1.env.ADMIN_EMAIL)
        return false;
    await prisma_1.prisma.user.updateMany({
        where: { email, isAdmin: false },
        data: { isAdmin: true },
    });
    return true;
}
async function signup(input) {
    const existing = await prisma_1.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing)
        throw new errors_1.ConflictError('Email already registered');
    const passwordHash = await bcryptjs_1.default.hash(input.password, 10);
    const user = await prisma_1.prisma.user.create({
        data: {
            email: input.email.toLowerCase(),
            passwordHash,
            displayName: input.displayName,
            profile: { create: {} },
        },
        select: { id: true, email: true, displayName: true, isAdmin: true },
    });
    await ensureAdminRole(user.email);
    return { user, token: (0, auth_1.signToken)({ userId: user.id, email: user.email }) };
}
async function login(input) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !user.isActive)
        throw new errors_1.UnauthorizedError('Incorrect email or password');
    const ok = await bcryptjs_1.default.compare(input.password, user.passwordHash);
    if (!ok)
        throw new errors_1.UnauthorizedError('Incorrect email or password');
    await ensureAdminRole(user.email);
    const [tierResult, streak] = await Promise.all([
        (0, entitlements_service_1.getUserTier)(user.id),
        (0, streak_service_1.touchStreak)(user.id).catch(() => ({ streak: 0, maxStreak: 0 })),
    ]);
    return {
        user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            isAdmin: user.isAdmin,
            tier: tierResult.tier,
            streak: streak.streak,
            maxStreak: streak.maxStreak,
        },
        token: (0, auth_1.signToken)({ userId: user.id, email: user.email }),
    };
}
async function getMe(userId) {
    const [user, tierResult, streak] = await Promise.all([
        prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                displayName: true,
                isAdmin: true,
                isActive: true,
                createdAt: true,
                profile: {
                    select: {
                        id: true,
                        university: true,
                        department: true,
                        yearLevel: true,
                        occupation: true,
                        jobTitle: true,
                        company: true,
                        gender: true,
                        bio: true,
                        avatarUrl: true,
                        avatarFrame: true,
                        bannerStyle: true,
                        learningFormat: true,
                        availabilities: {
                            select: { id: true, weekday: true, timeOfDay: true },
                        },
                    },
                },
            },
        }),
        (0, entitlements_service_1.getUserTier)(userId),
        (0, streak_service_1.touchStreak)(userId).catch(() => ({ streak: 0, maxStreak: 0 })),
    ]);
    if (!user)
        throw new errors_1.NotFoundError('User not found');
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        tier: tierResult.tier,
        streak: streak.streak,
        maxStreak: streak.maxStreak,
        profile: user.profile,
    };
}
async function requestPasswordReset(email) {
    const user = await prisma_1.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true },
    });
    if (!user)
        return;
    const raw = (0, crypto_1.randomBytes)(32).toString('hex');
    const tokenHash = (0, crypto_1.createHash)('sha256').update(raw).digest('hex');
    await prisma_1.prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    });
    const resetUrl = env_1.env.RESET_URL
        ? `${env_1.env.RESET_URL.replace(/\/$/, '')}?token=${raw}`
        : `${env_1.env.CLIENT_URL.replace(/\/$/, '')}/reset-password?token=${raw}`;
    await (0, email_service_1.sendPasswordResetEmail)(user.email, resetUrl).catch(() => undefined);
}
async function changePassword(input) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user)
        throw new errors_1.NotFoundError('User not found');
    const ok = await bcryptjs_1.default.compare(input.currentPassword, user.passwordHash);
    if (!ok)
        throw new errors_1.UnauthorizedError('Current password is incorrect');
    const passwordHash = await bcryptjs_1.default.hash(input.newPassword, 10);
    await prisma_1.prisma.user.update({ where: { id: input.userId }, data: { passwordHash } });
}
async function resetPassword(token, newPassword) {
    const tokenHash = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    const record = await prisma_1.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
        throw new errors_1.BadRequestError('Invalid or expired reset token');
    }
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
        prisma_1.prisma.passwordResetToken.update({
            where: { id: record.id },
            data: { usedAt: new Date() },
        }),
    ]);
}
//# sourceMappingURL=auth.service.js.map