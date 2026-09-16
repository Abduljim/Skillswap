import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../middleware/auth';
import { ConflictError, UnauthorizedError, BadRequestError, NotFoundError } from '../utils/errors';
import { createHash, randomBytes } from 'crypto';
import { env } from '../config/env';
import { sendPasswordResetEmail } from './email.service';
import { getUserTier } from './entitlements.service';
import { touchStreak } from './streak.service';

// Bootstrap admin: when ADMIN_EMAIL is set, that account is granted admin on
// signup and on every login, so the very first real account can run the admin
// panel without any manual database access.
async function ensureAdminRole(email: string): Promise<boolean> {
  if (!env.ADMIN_EMAIL || email !== env.ADMIN_EMAIL) return false;
  await prisma.user.updateMany({
    where: { email, isAdmin: false },
    data: { isAdmin: true },
  });
  return true;
}

export async function signup(input: {
  email: string;
  password: string;
  displayName: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      displayName: input.displayName,
      profile: { create: {} },
    },
    select: { id: true, email: true, displayName: true, isAdmin: true },
  });

  await ensureAdminRole(user.email);

  return { user, token: signToken({ userId: user.id, email: user.email }) };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Invalid credentials');

  await ensureAdminRole(user.email);

  const [tierResult, streak] = await Promise.all([
    getUserTier(user.id),
    touchStreak(user.id).catch(() => ({ streak: 0, maxStreak: 0 })),
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
    token: signToken({ userId: user.id, email: user.email }),
  };
}

export async function getMe(userId: string) {
  const [user, tierResult, streak] = await Promise.all([
    prisma.user.findUnique({
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
    getUserTier(userId),
    touchStreak(userId).catch(() => ({ streak: 0, maxStreak: 0 })),
  ]);
  if (!user) throw new NotFoundError('User not found');
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

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true },
  });
  if (!user) return;
  const raw = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const resetUrl = env.RESET_URL
    ? `${env.RESET_URL.replace(/\/$/, '')}?token=${raw}`
    : `${env.CLIENT_URL.replace(/\/$/, '')}/reset-password?token=${raw}`;

  await sendPasswordResetEmail(user.email, resetUrl).catch(() => undefined);
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new NotFoundError('User not found');

  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Current password is incorrect');

  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.user.update({ where: { id: input.userId }, data: { passwordHash } });
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new BadRequestError('Invalid or expired reset token');
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
}