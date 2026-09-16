// Badge system — badges are derived from tier + on-profile activity so they are
// always live and need no extra tables.

export interface Badge {
  code: string;
  label: string;
  emoji: string;
  description: string;
  tier: 'BASIC' | 'PRO';
}

export const BADGES: Record<string, Badge> = {
  EARLY_BIRD: {
    code: 'EARLY_BIRD',
    label: 'Early Bird',
    emoji: '🐦',
    description: 'One of the first members',
    tier: 'BASIC',
  },
  SWAPPER: {
    code: 'SWAPPER',
    label: 'Swapper',
    emoji: '🔄',
    description: 'Completed an exchange',
    tier: 'BASIC',
  },
  PRO_CROWN: {
    code: 'PRO_CROWN',
    label: 'Premium Crown',
    emoji: '👑',
    description: 'Pro membership active',
    tier: 'PRO',
  },
  TOP_TRADER: {
    code: 'TOP_TRADER',
    label: 'Top Trader',
    emoji: '🏆',
    description: 'Premium skill trader',
    tier: 'PRO',
  },
  DIAMOND: {
    code: 'DIAMOND',
    label: 'Diamond Supporter',
    emoji: '💎',
    description: 'Premium supporter of SkillSwap',
    tier: 'PRO',
  },
};

export function computeBadges(opts: {
  tier: 'FREE' | 'PRO';
  completedExchanges?: number;
  ageDays?: number;
}): Badge[] {
  const badges: Badge[] = [];
  const joinedDays = opts.ageDays ?? 0;
  const completed = opts.completedExchanges ?? 0;

  if (joinedDays <= 60) {
    badges.push(BADGES.EARLY_BIRD);
  }
  if (completed >= 1) {
    badges.push(BADGES.SWAPPER);
  }

  if (opts.tier === 'PRO') {
    badges.push(BADGES.PRO_CROWN, BADGES.TOP_TRADER, BADGES.DIAMOND);
  }

  return badges;
}