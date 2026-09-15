/**
 * Matching engine — purely deterministic.
 *
 * Scoring rules (max 100):
 *  +50  User B teaches ≥1 skill User A wants.
 *  +30  User A teaches ≥1 skill User B wants.
 *  +10  Same university.
 *   +5  Compatible learning format.
 *   +5  Compatible availability (overlapping weekday+time slot).
 *
 * Excludes:
 *   - user A themselves
 *   - inactive users
 *   - users blocked by either party
 */

import type { LearningFormat, Weekday, TimeOfDay } from '@prisma/client';

export interface MatchScore {
  userId: string;
  score: number;
  matchedSkills: {
    theyCanTeachMe: { id: string; name: string; category: string }[];
    iCanTeachThem: { id: string; name: string; category: string }[];
  };
  reasons: string[];
}

export interface SkillLite {
  id: string;
  name: string;
  category: string;
}

export interface UserMatchInput {
  id: string;
  isActive: boolean;
  profile: null | null | {
    university: string | null;
    learningFormat: LearningFormat | null;
    availabilities: { weekday: Weekday; timeOfDay: TimeOfDay }[];
  };
  teachingSkills: SkillLite[];
  wantedSkills: SkillLite[];
}

export interface MatchingContext {
  userA: UserMatchInput;
  userB: UserMatchInput;
  blocksA: Set<string>; // userIds that A has blocked
  blocksB: Set<string>; // userIds that have blocked A (we still need this to filter B)
  aBlockedB: boolean;
  bBlockedA: boolean;
}

const SCORE = {
  TEACHES_I_WANT: 50,
  I_TEACH_THEY_WANT: 30,
  SAME_UNIVERSITY: 10,
  COMPATIBLE_FORMAT: 5,
  COMPATIBLE_AVAILABILITY: 5,
} as const;

export const MATCH_THRESHOLDS = {
  PERFECT: 80,
  STRONG: 60,
  POTENTIAL: 40,
} as const;

function compatibleFormat(a: LearningFormat | null, b: LearningFormat | null): boolean {
  if (!a || !b) return false;
  if (a === 'EITHER' || b === 'EITHER') return true;
  return a === b;
}

function compatibleAvailability(
  a: { weekday: Weekday; timeOfDay: TimeOfDay }[],
  b: { weekday: Weekday; timeOfDay: TimeOfDay }[]
): boolean {
  const aSet = new Set(a.map((s) => `${s.weekday}:${s.timeOfDay}`));
  return b.some((s) => aSet.has(`${s.weekday}:${s.timeOfDay}`));
}

export function calculateMatchScore(userA: UserMatchInput, userB: UserMatchInput): MatchScore {
  const theyCanTeachMe: SkillLite[] = [];
  const iCanTeachThem: SkillLite[] = [];

  for (const w of userA.wantedSkills) {
    const teaching = userB.teachingSkills.find((t) => t.id === w.id);
    if (teaching) theyCanTeachMe.push(teaching);
  }
  for (const w of userB.wantedSkills) {
    const teaching = userA.teachingSkills.find((t) => t.id === w.id);
    if (teaching) iCanTeachThem.push(teaching);
  }

  let score = 0;
  const reasons: string[] = [];

  if (theyCanTeachMe.length > 0) {
    score += SCORE.TEACHES_I_WANT;
    reasons.push(`They teach ${theyCanTeachMe.map((s) => s.name).join(', ')} — what you want`);
  }
  if (iCanTeachThem.length > 0) {
    score += SCORE.I_TEACH_THEY_WANT;
    reasons.push(`You teach ${iCanTeachThem.map((s) => s.name).join(', ')} — what they want`);
  }

  if (
    userA.profile?.university &&
    userB.profile?.university &&
    userA.profile.university.toLowerCase() === userB.profile.university.toLowerCase()
  ) {
    score += SCORE.SAME_UNIVERSITY;
    reasons.push(`Same university: ${userB.profile.university}`);
  }

  if (compatibleFormat(userA.profile?.learningFormat ?? null, userB.profile?.learningFormat ?? null)) {
    score += SCORE.COMPATIBLE_FORMAT;
    reasons.push('Compatible learning format');
  }

  if (
    userA.profile?.availabilities &&
    userB.profile?.availabilities &&
    compatibleAvailability(userA.profile.availabilities, userB.profile.availabilities)
  ) {
    score += SCORE.COMPATIBLE_AVAILABILITY;
    reasons.push('Compatible availability');
  }

  // Cap at 100
  if (score > 100) score = 100;

  return {
    userId: userB.id,
    score,
    matchedSkills: {
      theyCanTeachMe,
      iCanTeachThem,
    },
    reasons,
  };
}

export function shouldIncludeInMatches(
  viewerId: string,
  candidate: UserMatchInput,
  aBlockedB: boolean,
  bBlockedA: boolean
): boolean {
  if (candidate.id === viewerId) return false;
  if (!candidate.isActive) return false;
  if (aBlockedB || bBlockedA) return false;
  return true;
}

export function matchCategory(score: number): 'PERFECT' | 'STRONG' | 'POTENTIAL' | 'NONE' {
  if (score >= MATCH_THRESHOLDS.PERFECT) return 'PERFECT';
  if (score >= MATCH_THRESHOLDS.STRONG) return 'STRONG';
  if (score >= MATCH_THRESHOLDS.POTENTIAL) return 'POTENTIAL';
  return 'NONE';
}