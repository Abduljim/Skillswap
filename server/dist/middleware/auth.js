"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.requireAdmin = exports.requireAuth = exports.COOKIE_MAX_AGE_MS = exports.COOKIE_NAME = void 0;
exports.signToken = signToken;
exports.setAuthCookie = setAuthCookie;
exports.clearAuthCookie = clearAuthCookie;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const errors_1 = require("../utils/errors");
const prisma_1 = require("../lib/prisma");
exports.COOKIE_NAME = 'skillswap_token';
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, { expiresIn: env_1.env.JWT_EXPIRES_IN });
}
exports.COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
function setAuthCookie(res, token) {
    res.cookie(exports.COOKIE_NAME, token, {
        httpOnly: true,
        secure: env_1.env.NODE_ENV === 'production',
        sameSite: env_1.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: exports.COOKIE_MAX_AGE_MS,
        path: '/',
    });
}
function clearAuthCookie(res) {
    res.clearCookie(exports.COOKIE_NAME, { path: '/' });
}
const requireAuth = async (req, _res, next) => {
    try {
        let token;
        const cookieToken = req.cookies?.[exports.COOKIE_NAME];
        if (cookieToken)
            token = cookieToken;
        if (!token && req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.substring(7);
        }
        if (!token)
            throw new errors_1.UnauthorizedError('Authentication required');
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        // Confirm user is still active
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, email: true, isActive: true },
        });
        if (!user || !user.isActive)
            throw new errors_1.UnauthorizedError('Account inactive');
        req.user = { userId: user.id, email: user.email };
        next();
    }
    catch (e) {
        if (e instanceof errors_1.UnauthorizedError)
            return next(e);
        next(new errors_1.UnauthorizedError('Invalid token'));
    }
};
exports.requireAuth = requireAuth;
const requireAdmin = async (req, _res, next) => {
    try {
        if (!req.user)
            throw new errors_1.UnauthorizedError();
        const u = await prisma_1.prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
        if (!u?.isAdmin)
            throw new errors_1.ForbiddenError('Admin access required');
        next();
    }
    catch (e) {
        next(e);
    }
};
exports.requireAdmin = requireAdmin;
const optionalAuth = async (req, _res, next) => {
    try {
        const cookieToken = req.cookies?.[exports.COOKIE_NAME];
        if (cookieToken) {
            const payload = jsonwebtoken_1.default.verify(cookieToken, env_1.env.JWT_SECRET);
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: payload.userId },
                select: { id: true, email: true, isActive: true },
            });
            if (user?.isActive)
                req.user = { userId: user.id, email: user.email };
        }
    }
    catch {
        // ignore
    }
    next();
};
exports.optionalAuth = optionalAuth;
//# sourceMappingURL=auth.js.map