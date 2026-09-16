import { prisma } from '../lib/prisma';

// Daily login streaks. Milestones ladder spaced so early wins feel easy
// (every couple of days) and the far end stretches to 500 for the dedicated.
export const STREAK_MILESTONES = [
  1, 3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 300, 400, 500,
];

function dayKey(d: Date) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function isYesterday(d: Date) {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - 1);
  return dayKey(d) === dayKey(t);
}

export async function touchStreak(
  userId: string
): Promise<{ streak: number; maxStreak: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastLoginAt: true, loginStreak: true, maxStreak: true },
  });
  if (!user) return { streak: 0, maxStreak: 0 };

  // Already checked in today — don't bump twice.
  if (user.lastLoginAt && dayKey(user.lastLoginAt) === dayKey(new Date())) {
    return { streak: user.loginStreak, maxStreak: user.maxStreak };
  }

  let next = 1;
  if (user.lastLoginAt && isYesterday(user.lastLoginAt)) next = user.loginStreak + 1;
  const maxStreak = Math.max(user.maxStreak, next);

  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), loginStreak: next, maxStreak },
  });
  return { streak: next, maxStreak };
}

export async function readStreak(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loginStreak: true, maxStreak: true },
  });
  if (!user) return { streak: 0, maxStreak: 0 };
  return { streak: user.loginStreak, maxStreak: user.maxStreak };
}