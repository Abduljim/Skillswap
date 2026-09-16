export interface BadgeDef {
  code: string;
  emoji: string;
  label: string;
  description: string;
  tier: 'BASIC' | 'PRO';
}

export const BADGE_DEFS: BadgeDef[] = [
  {
    code: 'EARLY_BIRD',
    emoji: '🐦',
    label: 'Early Bird',
    description: 'One of the first members of SkillSwap.',
    tier: 'BASIC',
  },
  {
    code: 'SWAPPER',
    emoji: '🔄',
    label: 'Swapper',
    description: 'Completed your first exchange — a real skill swap.',
    tier: 'BASIC',
  },
  {
    code: 'PRO_CROWN',
    emoji: '👑',
    label: 'Premium Crown',
    description: 'Pro membership is active on your account.',
    tier: 'PRO',
  },
  {
    code: 'TOP_TRADER',
    emoji: '🏆',
    label: 'Top Trader',
    description: 'A premium skill trader on the platform.',
    tier: 'PRO',
  },
  {
    code: 'DIAMOND',
    emoji: '💎',
    label: 'Diamond Supporter',
    description: 'Premium supporter of SkillSwap.',
    tier: 'PRO',
  },
];