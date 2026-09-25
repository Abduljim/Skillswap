/**
 * Profile card catalogue — server copy.
 *
 * Mirrors client/src/profileCards.tsx. There is exactly ONE free card and FIVE
 * Pro cards; the client locks them in the picker, and updateProfile() enforces
 * the same rule so a modified client cannot save a premium card on a free
 * account.
 */

export const FREE_CARD_ID = 'linen';

export const PRO_CARD_IDS = ['aurum', 'diamond', 'nova', 'inferno', 'sovereign'] as const;

export const PROFILE_CARD_IDS = [FREE_CARD_ID, ...PRO_CARD_IDS] as const;

export type ProfileCardId = (typeof PROFILE_CARD_IDS)[number];

/**
 * Values written by older builds (the retired PNG frames). They are accepted on
 * the way in and normalised to the free card, so an outdated APK does not start
 * failing profile saves with a 400.
 */
const LEGACY_CARD_IDS = new Set([
  'default',
  'frame_0', 'frame_1', 'frame_2', 'frame_3', 'frame_4', 'frame_5',
  'frame_6', 'frame_7', 'frame_8', 'frame_9', 'frame_10', 'frame_11',
]);

export function isProfileCardId(value: unknown): value is ProfileCardId {
  return typeof value === 'string' && (PROFILE_CARD_IDS as readonly string[]).includes(value);
}

export function isProCardId(value: unknown): boolean {
  return typeof value === 'string' && (PRO_CARD_IDS as readonly string[]).includes(value);
}

/** Legacy id → free card; anything already valid passes through untouched. */
export function normalizeCardId(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (LEGACY_CARD_IDS.has(value)) return FREE_CARD_ID;
  return value;
}
