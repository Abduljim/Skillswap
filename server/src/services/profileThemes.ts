/**
 * Profile look catalogue — server copy.
 *
 * Mirrors client/src/profileThemes.ts. A "look" is the colour field behind the
 * profile header; a "card" (profileCards.ts) is the ring around the avatar. The
 * two are stored separately — `bannerStyle` and `avatarFrame` — and gated
 * separately, because they used to be one choice driving both and the profile
 * and the profile card were therefore identical by construction.
 *
 * There is exactly ONE free look and FIVE Pro looks. The client locks them in
 * the picker, and updateProfile() enforces the same rule so a modified client
 * cannot save a premium look on a free account.
 *
 * The free id is 'cream', which is the Prisma column default and the value every
 * existing row already holds, so introducing looks changes nobody's appearance.
 */

export const FREE_LOOK_ID = 'cream';

export const PRO_LOOK_IDS = ['terracotta', 'verdant', 'cobalt', 'mulberry', 'copper'] as const;

export const PROFILE_LOOK_IDS = [FREE_LOOK_ID, ...PRO_LOOK_IDS] as const;

export type ProfileLookId = (typeof PROFILE_LOOK_IDS)[number];

/**
 * bannerStyle values an older build could hold: the field existed as an unused
 * nine-colour enum before looks shipped. They are accepted on the way in and
 * normalised to the free look rather than rejected, so an outdated APK does not
 * start failing profile saves with a 400.
 */
const LEGACY_LOOK_IDS = new Set([
  'purple', 'blue', 'teal', 'orange', 'pink', 'gold', 'indigo', 'green',
]);

export function isProfileLookId(value: unknown): value is ProfileLookId {
  return typeof value === 'string' && (PROFILE_LOOK_IDS as readonly string[]).includes(value);
}

export function isProLookId(value: unknown): boolean {
  return typeof value === 'string' && (PRO_LOOK_IDS as readonly string[]).includes(value);
}

/** Legacy colour name → free look; anything already valid passes through. */
export function normalizeLookId(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (LEGACY_LOOK_IDS.has(value)) return FREE_LOOK_ID;
  return value;
}
