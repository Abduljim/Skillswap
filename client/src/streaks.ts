export const STREAK_MILESTONES = [1, 3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 300, 400, 500];

export function nextStreakMilestone(streak: number): number {
  return STREAK_MILESTONES.find((m) => streak < m) ?? streak;
}