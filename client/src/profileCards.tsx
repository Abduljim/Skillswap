/**
 * Profile Rings & Profile Cards catalogue — v1.16 "Peak" set.
 *
 * Six families, exactly as designed: ONE free (Basic Ring / Default Card) and
 * FIVE Pro (Frost, Shadow, Golden, Void, Cosmic). Each family drives both the
 * avatar RING (CardArt, inline SVG in the outer band of a 100-unit viewBox)
 * and the profile CARD surface (cardCls gradient in index.css).
 *
 * Ids are stable on purpose (linen/aurum/diamond/nova/inferno/sovereign) so
 * profiles saved by older builds keep their look — only the art and names
 * changed. The server mirror (services/profileCards.ts) is id-only, so it
 * needs no change.
 */
import { useId } from 'react';

export type CardTier = 'FREE' | 'PRO';

export interface ProfileCard {
  id: string;
  /** Ring name (avatar frame picker). */
  label: string;
  /** Card name (profile card picker); falls back to the ring name. */
  cardLabel?: string;
  tagline: string;
  tier: CardTier;
  /** Gradient applied behind the profile header. */
  cardCls: string;
  /** Whether that gradient needs light text on top. */
  cardDark: boolean;
}

export const PROFILE_CARDS: ProfileCard[] = [
  {
    id: 'linen',
    label: 'Basic Ring',
    cardLabel: 'Default Card',
    tagline: 'Clean. Simple. Standard.',
    tier: 'FREE',
    cardCls: 'profile-card-linen',
    cardDark: false,
  },
  {
    id: 'diamond',
    label: 'Frost Crown',
    cardLabel: 'Frost Monarch',
    tagline: 'Cold. Sharp. Elite.',
    tier: 'PRO',
    cardCls: 'profile-card-diamond',
    cardDark: true,
  },
  {
    id: 'inferno',
    label: 'Shadow Flame',
    cardLabel: 'Shadow Reign',
    tagline: 'Dark. Powerful. Fearless.',
    tier: 'PRO',
    cardCls: 'profile-card-inferno',
    cardDark: true,
  },
  {
    id: 'aurum',
    label: 'Golden Apex',
    cardLabel: 'Golden Sovereign',
    tagline: 'Rare. Bold. Supreme.',
    tier: 'PRO',
    cardCls: 'profile-card-aurum',
    cardDark: true,
  },
  {
    id: 'nova',
    label: 'Void Serpent',
    cardLabel: 'Void Dragon',
    tagline: 'Silent. Deadly. Infinite.',
    tier: 'PRO',
    cardCls: 'profile-card-nova',
    cardDark: true,
  },
  {
    id: 'sovereign',
    label: 'Cosmic Zenith',
    cardLabel: 'Cosmic Legend',
    tagline: 'Beyond. Unmatched. Peak.',
    tier: 'PRO',
    cardCls: 'profile-card-sovereign',
    cardDark: true,
  },
];

export const FREE_CARD = PROFILE_CARDS[0]!;
export const PRO_CARD_IDS = PROFILE_CARDS.filter((c) => c.tier === 'PRO').map((c) => c.id);
export const CARD_IDS = PROFILE_CARDS.map((c) => c.id);

export const CARD_BY_ID: Record<string, ProfileCard> = Object.fromEntries(
  PROFILE_CARDS.map((c) => [c.id, c])
);

/**
 * Values written by older builds (the retired PNG frames). They are accepted
 * on the way in and normalised to the free card, so an outdated APK does not
 * start failing profile saves with a 400.
 */
export const LEGACY_CARD_IDS = [
  'default',
  'frame_0', 'frame_1', 'frame_2', 'frame_3', 'frame_4', 'frame_5',
  'frame_6', 'frame_7', 'frame_8', 'frame_9', 'frame_10', 'frame_11',
];

export function resolveCard(frame?: string | null): ProfileCard {
  if (frame && CARD_BY_ID[frame]) return CARD_BY_ID[frame]!;
  return FREE_CARD;
}

export function isProCard(frame?: string | null): boolean {
  return resolveCard(frame).tier === 'PRO';
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** The avatar occupies 76 of the 100 viewBox units; art lives in the outer band. */
const AVATAR_UNITS = 76;
export const CARD_OUTER_RATIO = 100 / AVATAR_UNITS; // ≈ 1.316

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const pt = (p: { x: number; y: number }) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/** Four-point sparkle star centred at (x, y). */
const star = (x: number, y: number, s: number) =>
  `M ${x} ${y - s} L ${x + s * 0.28} ${y - s * 0.28} L ${x + s} ${y} L ${x + s * 0.28} ${y + s * 0.28} ` +
  `L ${x} ${y + s} L ${x - s * 0.28} ${y + s * 0.28} L ${x - s} ${y} L ${x - s * 0.28} ${y - s * 0.28} Z`;

// ---------------------------------------------------------------------------
// Individual ring artworks
// ---------------------------------------------------------------------------

/** Free: one clean silver band, one hairline inside. Nothing louder. */
function LinenArt({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <circle cx="50" cy="50" r="41.5" fill="none" stroke={`url(#${uid}-linen)`} strokeWidth="2.6" />
      <circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
      <defs>
        <linearGradient id={`${uid}-linen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0e6d2" />
          <stop offset="50%" stopColor="#d9c9a8" />
          <stop offset="100%" stopColor="#efe4cd" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Pro 1: faceted ice band crowned with crystal shards. */
function DiamondArt({ uid }: { uid: string }) {
  const shards = [-64, -32, 0, 32, 64].map((a) => {
    const tip = polar(50, 50, a === 0 ? 55 : Math.abs(a) === 32 ? 52 : 49, a);
    return { a, tip };
  });
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <circle cx="50" cy="50" r="40.5" fill="none" stroke={`url(#${uid}-ice)`} strokeWidth="3" />
      <circle cx="50" cy="50" r="38.4" fill="none" stroke="#e0f2fe" strokeWidth="0.9" opacity="0.65" />
      {shards.map(({ a, tip }) => (
        <polygon
          key={a}
          points={`${pt(polar(50, 50, 39.5, a - 5))} ${pt(tip)} ${pt(polar(50, 50, 39.5, a + 5))}`}
          fill={`url(#${uid}-ice)`}
          opacity="0.95"
        />
      ))}
      {[-90, 90, 180].map((a) => (
        <polygon
          key={a}
          points={`${pt(polar(50, 50, 39, a - 4))} ${pt(polar(50, 50, 45, a))} ${pt(polar(50, 50, 39, a + 4))} ${pt(polar(50, 50, 36, a))}`}
          fill="#7dd3fc"
          opacity="0.8"
        />
      ))}
      <path d={star(20, 26, 2.6)} fill="#ffffff" opacity="0.9" />
      <path d={star(81, 68, 2)} fill="#e0f2fe" opacity="0.8" />
      <defs>
        <linearGradient id={`${uid}-ice`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0f9ff" />
          <stop offset="45%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Pro 2: violet-magenta flame tongues licking up around a dark band. */
function InfernoArt({ uid }: { uid: string }) {
  const tongues = Array.from({ length: 14 }, (_, i) => i * (360 / 14));
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <circle cx="50" cy="50" r="40" fill="none" stroke={`url(#${uid}-flame)`} strokeWidth="3.2" />
      <circle cx="50" cy="50" r="38.2" fill="none" stroke="#f0abfc" strokeWidth="1" opacity="0.4" />
      {tongues.map((a, i) => {
        const len = 47 + (i % 3) * 3.2;
        return (
          <path
            key={a}
            d={`M ${pt(polar(50, 50, 39.6, a - 6))} Q ${pt(polar(50, 50, len - 2, a - 2))} ${pt(polar(50, 50, len, a))} Q ${pt(polar(50, 50, len - 2, a + 2))} ${pt(polar(50, 50, 39.6, a + 6))} Z`}
            fill={`url(#${uid}-flame)`}
            opacity={0.55 + (i % 3) * 0.15}
          />
        );
      })}
      <path d={star(76, 24, 2.2)} fill="#fdf4ff" opacity="0.85" />
      <defs>
        <linearGradient id={`${uid}-flame`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#701a75" />
          <stop offset="50%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#f0abfc" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Pro 3: molten-gold band with a crown of spikes and gem studs. */
function AurumArt({ uid }: { uid: string }) {
  const spikes = [-48, -24, 0, 24, 48];
  const lower = [150, 180, 210];
  const studs = [45, 135, 225, 315];
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <circle cx="50" cy="50" r="40.8" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="3.4" />
      <circle cx="50" cy="50" r="38.5" fill="none" stroke="#fff7d6" strokeWidth="0.9" opacity="0.55" />
      {spikes.map((a) => (
        <polygon
          key={a}
          points={`${pt(polar(50, 50, 40, a - 6))} ${pt(polar(50, 50, a === 0 ? 54 : 50, a))} ${pt(polar(50, 50, 40, a + 6))}`}
          fill={`url(#${uid}-gold)`}
        />
      ))}
      {lower.map((a) => (
        <polygon
          key={a}
          points={`${pt(polar(50, 50, 40, a - 5))} ${pt(polar(50, 50, 47, a))} ${pt(polar(50, 50, 40, a + 5))}`}
          fill={`url(#${uid}-gold)`}
          opacity="0.9"
        />
      ))}
      {studs.map((a) => (
        <circle key={a} cx={polar(50, 50, 40.8, a).x} cy={polar(50, 50, 40.8, a).y} r="1.7" fill="#fef3c7" />
      ))}
      <defs>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Pro 4: a serpent of swirling blue-violet arcs coiling around the avatar. */
function NovaArt({ uid }: { uid: string }) {
  const arcs = [0, 90, 180, 270].map((a0, i) => ({
    a0,
    r: 40 + (i % 2) * 2.4,
    w: 4.2 - i * 0.55,
    g: i % 2,
  }));
  const head = polar(50, 50, 40, 24);
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="none" stroke="#6366f1" strokeWidth="0.8" opacity="0.3" />
      {arcs.map(({ a0, r, w, g }) => {
        const s = polar(50, 50, r, a0);
        const e = polar(50, 50, r + 1.6, a0 + 74);
        return (
          <path
            key={a0}
            d={`M ${pt(s)} A ${r} ${r} 0 0 1 ${pt(e)}`}
            fill="none"
            stroke={g ? `url(#${uid}-void2)` : `url(#${uid}-void1)`}
            strokeWidth={w}
            strokeLinecap="round"
            opacity="0.92"
          />
        );
      })}
      <circle cx={head.x} cy={head.y} r="2.4" fill="#a5f3fc" />
      <circle cx={head.x} cy={head.y} r="0.9" fill="#0f172a" />
      <path d={star(24, 76, 2)} fill="#c7d2fe" opacity="0.8" />
      <defs>
        <linearGradient id={`${uid}-void1`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id={`${uid}-void2`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Pro 5: pink cosmic band with two crossed orbit rings and starbursts. */
function SovereignArt({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <circle cx="50" cy="50" r="40.6" fill="none" stroke={`url(#${uid}-cosmic)`} strokeWidth="3" />
      <ellipse
        cx="50" cy="50" rx="48" ry="13.5"
        fill="none" stroke="#f472b6" strokeWidth="1.5" opacity="0.85"
        transform="rotate(24 50 50)"
      />
      <ellipse
        cx="50" cy="50" rx="46" ry="11"
        fill="none" stroke="#c084fc" strokeWidth="1.1" opacity="0.6"
        transform="rotate(-34 50 50)"
      />
      <path d={star(50, 4, 4)} fill="#fdf2f8" opacity="0.95" />
      <path d={star(12, 62, 2.4)} fill="#fbcfe8" opacity="0.85" />
      <path d={star(88, 40, 2)} fill="#e9d5ff" opacity="0.8" />
      <defs>
        <linearGradient id={`${uid}-cosmic`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbcfe8" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#86198f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const ART: Record<string, (p: { uid: string }) => JSX.Element | null> = {
  linen: LinenArt,
  aurum: AurumArt,
  diamond: DiamondArt,
  inferno: InfernoArt,
  nova: NovaArt,
  sovereign: SovereignArt,
};

/**
 * Renders the ring artwork for a given card id. `uid` namespaces gradient ids
 * so several rings can sit on one page without colliding.
 */
export function CardArt({ card, uid }: { card: string; uid: string }) {
  const Art = ART[resolveCard(card).id];
  if (!Art) return null;
  return <Art uid={uid} />;
}

/** Hook-safe unique id for SVG gradient references (React's useId contains ':'). */
export function useCardUid() {
  return useId().replace(/:/g, '');
}
