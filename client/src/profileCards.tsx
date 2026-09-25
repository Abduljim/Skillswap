/**
 * Profile cards — the ring + gradient treatment around a user's avatar.
 *
 * Replaces the old 12 PNG frames (client/public/frames/frame_*.png). Everything
 * here is inline SVG/CSS: no binary assets, crisp at any size, animatable, and
 * it works offline inside the APK.
 *
 * Tiering: exactly ONE free card ("Linen", deliberately understated) and FIVE
 * Pro cards. The server enforces the same list — see
 * server/src/services/profileCards.ts and updateProfile() in profile.service.ts.
 */
import { useId } from 'react';

export type CardTier = 'FREE' | 'PRO';

export interface ProfileCard {
  id: string;
  label: string;
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
    label: 'Linen',
    tagline: 'Simple cream ring',
    tier: 'FREE',
    cardCls: 'profile-card-linen',
    cardDark: false,
  },
  {
    id: 'aurum',
    label: 'Aurum',
    tagline: 'Molten gold, gem studs',
    tier: 'PRO',
    cardCls: 'profile-card-aurum',
    cardDark: true,
  },
  {
    id: 'diamond',
    label: 'Diamond',
    tagline: 'Faceted crystal ring',
    tier: 'PRO',
    cardCls: 'profile-card-diamond',
    cardDark: true,
  },
  {
    id: 'nova',
    label: 'Nova',
    tagline: 'Rotating neon halo',
    tier: 'PRO',
    cardCls: 'profile-card-nova',
    cardDark: true,
  },
  {
    id: 'inferno',
    label: 'Inferno',
    tagline: 'Ember ring, rising sparks',
    tier: 'PRO',
    cardCls: 'profile-card-inferno',
    cardDark: true,
  },
  {
    id: 'sovereign',
    label: 'Sovereign',
    tagline: 'Dark chrome + crown',
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

/** Legacy PNG frame values still stored on profiles and sent by older APKs. */
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

// ---------------------------------------------------------------------------
// Individual card artworks
// ---------------------------------------------------------------------------

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

function AurumArt({ uid }: { uid: string }) {
  const studs = [0, 90, 180, 270];
  const laurels = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff6cf" />
          <stop offset="28%" stopColor="#f3c14b" />
          <stop offset="55%" stopColor="#a86d09" />
          <stop offset="78%" stopColor="#ffe9a3" />
          <stop offset="100%" stopColor="#c98f16" />
        </linearGradient>
        <radialGradient id={`${uid}-gem`} cx="35%" cy="30%">
          <stop offset="0%" stopColor="#fffdf3" />
          <stop offset="60%" stopColor="#ffd76a" />
          <stop offset="100%" stopColor="#b57b0c" />
        </radialGradient>
      </defs>

      {/* laurel ticks */}
      {laurels.map((deg) => {
        const a = polar(50, 50, 46.5, deg);
        const b = polar(50, 50, 43.5, deg);
        return (
          <line
            key={deg}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={`url(#${uid}-gold)`}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.85"
          />
        );
      })}

      <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="5" />
      <circle cx="50" cy="50" r="38.8" fill="none" stroke="#fff8dc" strokeWidth="1.1" opacity="0.85" />

      {/* shimmer sweep */}
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke="#fffef6"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="10 254"
        opacity="0.75"
        className="pc-spin"
        style={{ transformOrigin: '50% 50%' }}
      />

      {/* gem studs */}
      {studs.map((deg) => {
        const p = polar(50, 50, 42, deg);
        return (
          <g key={deg}>
            <circle cx={p.x} cy={p.y} r="3.4" fill={`url(#${uid}-gem)`} stroke="#7c5206" strokeWidth="0.5" />
            <circle cx={p.x - 1} cy={p.y - 1.2} r="0.9" fill="#fffdf2" opacity="0.9" />
          </g>
        );
      })}
    </svg>
  );
}

function DiamondArt({ uid }: { uid: string }) {
  const facets = Array.from({ length: 24 }, (_, i) => i * 15);
  const tones = ['#ffffff', '#dff1ff', '#a9d9f5', '#eaf7ff'];
  const sparkles = [
    { deg: 30, r: 44, s: 1, delay: '0s' },
    { deg: 165, r: 46, s: 0.75, delay: '0.9s' },
    { deg: 255, r: 43, s: 0.9, delay: '1.7s' },
  ];
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-ice`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#bfe6ff" />
          <stop offset="100%" stopColor="#6fb4de" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#${uid}-ice)`} strokeWidth="6" />

      {/* faceted band */}
      {facets.map((deg, i) => {
        const a1 = polar(50, 50, 45.2, deg);
        const a2 = polar(50, 50, 45.2, deg + 15);
        const b1 = polar(50, 50, 38.8, deg + 7.5);
        return (
          <path
            key={deg}
            d={`M ${a1.x} ${a1.y} L ${a2.x} ${a2.y} L ${b1.x} ${b1.y} Z`}
            fill={tones[i % tones.length]}
            opacity={i % 2 ? 0.55 : 0.85}
            stroke="#8fc7e8"
            strokeWidth="0.25"
          />
        );
      })}

      <circle cx="50" cy="50" r="38.6" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.9" />

      {sparkles.map((s) => {
        const p = polar(50, 50, s.r, s.deg);
        const k = 3.2 * s.s;
        return (
          <path
            key={s.deg}
            d={`M ${p.x} ${p.y - k} L ${p.x + k * 0.32} ${p.y - k * 0.32} L ${p.x + k} ${p.y} L ${p.x + k * 0.32} ${p.y + k * 0.32} L ${p.x} ${p.y + k} L ${p.x - k * 0.32} ${p.y + k * 0.32} L ${p.x - k} ${p.y} L ${p.x - k * 0.32} ${p.y - k * 0.32} Z`}
            fill="#ffffff"
            className="pc-twinkle"
            style={{ animationDelay: s.delay, transformOrigin: `${p.x}px ${p.y}px` }}
          />
        );
      })}
    </svg>
  );
}

function InfernoArt({ uid }: { uid: string }) {
  const flames = Array.from({ length: 14 }, (_, i) => i * (360 / 14));
  const sparks = [
    { deg: 20, delay: '0s' },
    { deg: 95, delay: '0.7s' },
    { deg: 180, delay: '1.3s' },
    { deg: 250, delay: '0.4s' },
    { deg: 315, delay: '1.9s' },
  ];
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-ember`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8f1503" />
          <stop offset="40%" stopColor="#ff6b1a" />
          <stop offset="75%" stopColor="#ffb347" />
          <stop offset="100%" stopColor="#ffe08a" />
        </linearGradient>
      </defs>

      {/* flame tongues */}
      {flames.map((deg, i) => {
        const base = polar(50, 50, 41, deg);
        const tip = polar(50, 50, 48.5, deg + 5);
        const side = polar(50, 50, 41.5, deg + 9);
        return (
          <path
            key={deg}
            d={`M ${base.x} ${base.y} Q ${tip.x} ${tip.y} ${side.x} ${side.y} Z`}
            fill={`url(#${uid}-ember)`}
            className="pc-flicker"
            style={{ animationDelay: `${(i % 5) * 0.22}s`, transformOrigin: `${base.x}px ${base.y}px` }}
            opacity="0.9"
          />
        );
      })}

      <circle cx="50" cy="50" r="41.5" fill="none" stroke={`url(#${uid}-ember)`} strokeWidth="5" />
      <circle cx="50" cy="50" r="38.6" fill="none" stroke="#ffd9a0" strokeWidth="1" opacity="0.7" />

      {sparks.map((s) => {
        const p = polar(50, 50, 46, s.deg);
        return (
          <circle
            key={s.deg}
            cx={p.x}
            cy={p.y}
            r="1.1"
            fill="#fff1c2"
            className="pc-rise"
            style={{ animationDelay: s.delay, transformOrigin: `${p.x}px ${p.y}px` }}
          />
        );
      })}
    </svg>
  );
}

function SovereignArt({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-chrome`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="30%" stopColor="#6b7280" />
          <stop offset="55%" stopColor="#111827" />
          <stop offset="80%" stopColor="#9ca3af" />
          <stop offset="100%" stopColor="#374151" />
        </linearGradient>
      </defs>

      {/* rotating dashed orbit */}
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="0.9"
        strokeDasharray="3 6"
        opacity="0.75"
        className="pc-spin-slow"
        style={{ transformOrigin: '50% 50%' }}
      />

      <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#${uid}-chrome)`} strokeWidth="5.4" />
      <circle cx="50" cy="50" r="38.7" fill="none" stroke="#0b0d12" strokeWidth="1.2" opacity="0.9" />

      {/* crown crest */}
      <g>
        <path
          d="M 38 12 L 42.5 5.5 L 46.5 10.5 L 50 3.5 L 53.5 10.5 L 57.5 5.5 L 62 12 L 60 16.5 L 40 16.5 Z"
          fill={`url(#${uid}-chrome)`}
          stroke="#0b0d12"
          strokeWidth="0.6"
        />
        <circle cx="50" cy="6.6" r="1.5" fill="#f43f5e" />
        <circle cx="42.6" cy="9.4" r="1.15" fill="#22d3ee" />
        <circle cx="57.4" cy="9.4" r="1.15" fill="#22d3ee" />
      </g>
    </svg>
  );
}

/**
 * Nova is the one card that needs CSS rather than SVG: a conic gradient ring,
 * which SVG cannot express natively. Built with a masked div so it stays a
 * crisp ring at any size.
 */
function NovaArt() {
  return (
    <>
      <div
        className="pc-nova-ring pc-spin absolute inset-0 rounded-full"
        aria-hidden="true"
        style={{ transformOrigin: '50% 50%' }}
      />
      <div className="pc-nova-glow absolute inset-0 rounded-full" aria-hidden="true" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="50" cy="50" r="38.6" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.55" />
      </svg>
    </>
  );
}

const ART: Record<string, (p: { uid: string }) => JSX.Element> = {
  linen: LinenArt,
  aurum: AurumArt,
  diamond: DiamondArt,
  nova: NovaArt as unknown as (p: { uid: string }) => JSX.Element,
  inferno: InfernoArt,
  sovereign: SovereignArt,
};

/**
 * Renders the card artwork for a given card id. `uid` namespaces gradient ids so
 * several cards can sit on one page without colliding.
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
