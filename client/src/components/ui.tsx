import { ReactNode } from 'react';
import clsx from 'clsx';

export const AVATAR_FRAMES: Record<string, { src: string; label: string }> = {
  default: { src: '', label: 'Default' },
  frame_0: { src: '/frames/frame_0.png', label: 'Copper' },
  frame_1: { src: '/frames/frame_1.png', label: 'Slate' },
  frame_2: { src: '/frames/frame_2.png', label: 'Orchid' },
  frame_3: { src: '/frames/frame_3.png', label: 'Gold' },
  frame_4: { src: '/frames/frame_4.png', label: 'Teal' },
  frame_5: { src: '/frames/frame_5.png', label: 'Ember' },
  frame_6: { src: '/frames/frame_6.png', label: 'Sage' },
  frame_7: { src: '/frames/frame_7.png', label: 'Rose' },
  frame_8: { src: '/frames/frame_8.png', label: 'Sand' },
  frame_9: { src: '/frames/frame_9.png', label: 'Ocean' },
  frame_10: { src: '/frames/frame_10.png', label: 'Wine' },
  frame_11: { src: '/frames/frame_11.png', label: 'Pearl' },
};

// Each frame PNG (512x512) has a central transparent hole the photo fills.
// The PNG must be rendered larger than the avatar so the photo exactly fills
// the hole: scale = 512 / hole diameter (measured in the source assets).
const FRAME_SCALE: Record<string, number> = {
  frame_0: 512 / 330,
  frame_1: 512 / 326,
  frame_2: 512 / 314,
  frame_3: 512 / 333,
  frame_4: 512 / 346,
  frame_5: 512 / 303,
  frame_6: 512 / 341,
  frame_7: 512 / 348,
  frame_8: 512 / 330,
  frame_9: 512 / 315,
  frame_10: 512 / 298,
  frame_11: 512 / 318,
};

export const BANNER_STYLES = [
  { value: 'gold',     label: 'Gold',      cls: 'card-color-gold',     dark: false, free: true },
  { value: 'silver',   label: 'Silver',    cls: 'card-color-silver',   dark: false },
  { value: 'mint',     label: 'Mint',      cls: 'card-color-mint',     dark: false },
  { value: 'coral',    label: 'Coral',     cls: 'card-color-coral',    dark: false },
  { value: 'sky',      label: 'Sky Blue',  cls: 'card-color-sky',      dark: true },
  { value: 'ocean',    label: 'Ocean',     cls: 'card-color-ocean',    dark: true },
  { value: 'rose',     label: 'Rose',      cls: 'card-color-rose',     dark: true },
  { value: 'violet',   label: 'Violet',    cls: 'card-color-violet',   dark: true },
  { value: 'indigo',   label: 'Indigo',    cls: 'card-color-indigo',   dark: true },
  { value: 'midnight', label: 'Midnight',  cls: 'card-color-midnight', dark: true },
  { value: 'espresso', label: 'Espresso',  cls: 'card-color-espresso', dark: true },
  { value: 'forest',   label: 'Forest',    cls: 'card-color-forest',   dark: true },
] as const;

const BANNER_VALUE_SET = new Set(BANNER_STYLES.map((b) => b.value));

const LEGACY_BANNER_MAP: Record<string, string> = {
  cream: 'gold',
  coral: 'coral',
  mint: 'mint',
  ocean: 'ocean',
  forest: 'forest',
  sunset: 'gold',
  midnight: 'midnight',
  indigo: 'indigo',
  teal: 'ocean',
  rust: 'coral',
  eclipse: 'midnight',
  petrol: 'sky',
  burgundy: 'rose',
};

export function resolveBannerColor(v?: string | null): string {
  if (!v) return 'gold';
  if (BANNER_VALUE_SET.has(v as any)) return v;
  return LEGACY_BANNER_MAP[v] || 'gold';
}

export function isDarkBanner(v?: string | null): boolean {
  return BANNER_STYLES.find((b) => b.value === resolveBannerColor(v))?.dark ?? false;
}

export function Avatar({
  src,
  alt,
  size = 40,
  className,
}: {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'rounded-full overflow-hidden bg-cream-200 flex items-center justify-center text-ink-700 font-semibold shrink-0',
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <span>{alt.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

export function FrameAvatar({
  frame = 'default',
  size = 40,
  ...avatarProps
}: {
  frame?: string;
  size?: number;
} & Omit<Parameters<typeof Avatar>[0], 'size'>) {
  const def = AVATAR_FRAMES[frame] || AVATAR_FRAMES.default;
  if (!def.src) return <Avatar {...avatarProps} size={size} />;
  const scale = FRAME_SCALE[frame] ?? 512 / 330;
  const outer = size * scale;
  const inset = (outer - size) / 2;
  return (
    <div className="relative shrink-0" style={{ width: outer, height: outer }}>
      <div className="absolute" style={{ left: inset, top: inset }}>
        <Avatar {...avatarProps} size={size} />
      </div>
      <img
        src={def.src}
        alt=""
        className="absolute inset-0 w-full h-full pointer-events-none"
        draggable={false}
        style={frame !== 'default' ? { filter: 'drop-shadow(0 0 6px rgba(255, 185, 80, 0.5))' } : undefined}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton h-4', className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card p-10 text-center">
      {icon && <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-cream-100 flex items-center justify-center text-ink-500">{icon}</div>}
      <h3 className="font-display font-bold text-lg text-ink-900">{title}</h3>
      {body && <p className="text-sm text-ink-600 mt-1 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('chip-cream', className)}>{children}</span>
  );
}

export function ProficiencyBadge({ level }: { level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' }) {
  const map = {
    BEGINNER: 'chip-cream',
    INTERMEDIATE: 'chip-lavender',
    ADVANCED: 'chip-mint',
    EXPERT: 'chip-coral',
  };
  return <span className={map[level]}>{level}</span>;
}

export function MatchScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-coral-500 text-white'
      : score >= 60
      ? 'bg-mint-500 text-white'
      : 'bg-ink-700 text-cream-50';
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold', color)}>
      {score}% match
    </span>
  );
}