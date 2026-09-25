import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { prisma } from '../lib/prisma';

export interface AuthPayload {
  userId: string;
  email: string;
  /**
   * The user's `tokenVersion` at mint time. `requireAuth` rejects a token whose
   * version is behind the database, which is how logout, password change/reset
   * and admin deactivation invalidate sessions that would otherwise live for a
   * year (JWT_EXPIRES_IN=365d).
   */
  tokenVersion: number;
}

/** What handlers see on `req.user` — identity only, never JWT claims. */
export interface RequestUser {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export const COOKIE_NAME = 'skillswap_token';

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;
    const cookieToken = (req as any).cookies?.[COOKIE_NAME];
    if (cookieToken) token = cookieToken;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    if (!token) throw new UnauthorizedError('Authentication required');

    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;

    // Confirm the user is still active and the session has not been revoked.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, isActive: true, tokenVersion: true },
    });

    if (!user || !user.isActive) throw new UnauthorizedError('Account inactive');

    // Tokens minted before `tokenVersion` existed have no claim — treat as 0 so
    // upgrading does not log everybody out at once; the first bump revokes them.
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedError('Session expired — please sign in again');
    }

    req.user = { userId: user.id, email: user.email };
    next();
  } catch (e) {
    if (e instanceof UnauthorizedError) return next(e);
    next(new UnauthorizedError('Invalid token'));
  }
};

export const requireAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const u = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!u?.isAdmin) throw new ForbiddenError('Admin access required');
    next();
  } catch (e) {
    next(e);
  }
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const cookieToken = (req as any).cookies?.[COOKIE_NAME];
    if (cookieToken) {
      const payload = jwt.verify(cookieToken, env.JWT_SECRET) as AuthPayload;
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, isActive: true, tokenVersion: true },
      });
      if (user?.isActive && (payload.tokenVersion ?? 0) === user.tokenVersion) {
        req.user = { userId: user.id, email: user.email };
      }
    }
  } catch {
    // ignore
  }
  next();
};