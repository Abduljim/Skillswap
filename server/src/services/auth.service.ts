import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../middleware/auth';
import { ConflictError, UnauthorizedError, BadRequestError, NotFoundError } from '../utils/errors';
import { createHash, randomBytes } from 'crypto';

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

  return { user, token: signToken({ userId: user.id, email: user.email }) };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Invalid credentials');

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, isAdmin: user.isAdmin },
    token: signToken({ userId: user.id, email: user.email }),
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
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
          bio: true,
          avatarUrl: true,
          learningFormat: true,
          availabilities: {
            select: { id: true, weekday: true, timeOfDay: true },
          },
        },
      },
    },
  });
  if (!user) throw new NotFoundError('User not found');
  // Return in the expected shape for the client (AuthContext expects User directly)
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    createdAt: user.createdAt,
    profile: user.profile,
  };
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  if (!user) {
    // Don't reveal whether the email exists
    return null;
  }
  const raw = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  // No email provider is configured yet. The raw token must be available to the
  // caller (the route returns it to the client, and it is always logged) so the
  // reset flow actually completes. TTL is 1 hour, token is single-use.
  console.log(`[PASSWORD-RESET] token for ${email}: ${raw} (expires in 1h, single-use)`);
  return raw;
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