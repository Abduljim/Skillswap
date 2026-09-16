export interface BadgeDef {
  code: string;
  label: string;
  icon: string;
  description: string;
  tier: 'BASIC' | 'PRO';
}

export const BADGE_DEFS: BadgeDef[] = [
  {
    code: 'EARLY_BIRD',
    label: 'Early Adopter',
    icon: 'Bird',
    description: 'One of the first members of SkillSwap.',
    tier: 'BASIC',
  },
  {
    code: 'SWAPPER',
    label: 'Connector',
    icon: 'Repeat',
    description: 'Completed your first exchange, a real skill swap.',
    tier: 'BASIC',
  },
  {
    code: 'PRO_CROWN',
    label: 'Pro Member',
    icon: 'Crown',
    description: 'Pro membership is active on your account.',
    tier: 'PRO',
  },
  {
    code: 'TOP_TRADER',
    label: 'Skill Master',
    icon: 'Award',
    description: 'Active skill exchanger on the platform.',
    tier: 'PRO',
  },
  {
    code: 'DIAMOND',
    label: 'Supporter',
    icon: 'Gem',
    description: 'Premium supporter of SkillSwap.',
    tier: 'PRO',
  },
];