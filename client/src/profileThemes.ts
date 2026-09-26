/**
 * Profile looks — the colour field behind a profile header.
 *
 * Why this file exists separately from profileCards.tsx
 * -----------------------------------------------------
 * A **card** is the ring and artwork around the avatar. A **look** is the field
 * behind the whole header. They used to be one choice: `resolveCard()` supplied
 * both the header gradient and the ring, so "my profile" and "my profile card"
 * were literally the same design in two places, and picking one changed both.
 * They are separate now — separate pickers, separate storage, separate families.
 *
 * Three families, three deliberately different kinds of colour:
 *   wallpapers (Settings)     soft, matte, low contrast  — the app background
 *   profile looks (here)      bold, solid, earthy blocks — the header field
 *   profile cards             metallic, faceted, animated — the avatar ring
 *
 * Tiering: exactly ONE free look and FIVE Pro looks, mirroring cards and
 * wallpapers. The free id is 'cream' — the value every existing profile row
 * already stores, so the split changes nobody's saved appearance. The server
 * enforces the same list (server/src/services/profileThemes.ts) and
 * updateProfile() rejects a Pro look on a free account, so the locked picker is
 * a convenience, not the boundary.
 */

export type LookTier = 'FREE' | 'PRO';

export interface ProfileLook {
  id: string;
  label: string;
  tagline: string;
  tier: LookTier;
  /** CSS class painting the header field (defined in index.css). */
  heroCls: string;
  /** Whether that field needs light text on top. */
  heroDark: boolean;
}

export const PROFILE_LOOKS: ProfileLook[] = [
  {
    id: 'cream',
    label: 'Canvas',
    tagline: 'Warm off-white — free',
    tier: 'FREE',
    heroCls: 'profile-look-canvas',
    heroDark: false,
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    tagline: 'Burnt clay red',
    tier: 'PRO',
    heroCls: 'profile-look-terracotta',
    heroDark: true,
  },
  {
    id: 'verdant',
    label: 'Verdant',
    tagline: 'Deep leaf green',
    tier: 'PRO',
    heroCls: 'profile-look-verdant',
    heroDark: true,
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    tagline: 'Electric blue',
    tier: 'PRO',
    heroCls: 'profile-look-cobalt',
    heroDark: true,
  },
  {
    id: 'mulberry',
    label: 'Mulberry',
    tagline: 'Purple-red velvet',
    tier: 'PRO',
    heroCls: 'profile-look-mulberry',
    heroDark: true,
  },
  {
    id: 'copper',
    label: 'Copper',
    tagline: 'Golden burnished brown',
    tier: 'PRO',
    heroCls: 'profile-look-copper',
    heroDark: true,
  },
];

export const FREE_LOOK = PROFILE_LOOKS[0]!;
export const PRO_LOOK_IDS = PROFILE_LOOKS.filter((l) => l.tier === 'PRO').map((l) => l.id);
export const LOOK_IDS = PROFILE_LOOKS.map((l) => l.id);

export const LOOK_BY_ID: Record<string, ProfileLook> = Object.fromEntries(
  PROFILE_LOOKS.map((l) => [l.id, l])
);

/**
 * bannerStyle values written by older builds, when the field was an unused
 * nine-colour enum. Accepted on the way in and normalised to the free look, so
 * an old APK cannot fail a profile save with a 400.
 */
export const LEGACY_LOOK_IDS = [
  'purple', 'blue', 'teal', 'orange', 'pink', 'gold', 'indigo', 'green',
];

export function resolveLook(style?: string | null): ProfileLook {
  if (style && LOOK_BY_ID[style]) return LOOK_BY_ID[style]!;
  return FREE_LOOK;
}

export function isProLook(style?: string | null): boolean {
  return resolveLook(style).tier === 'PRO';
}
