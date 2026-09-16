import { ReactNode } from 'react';
import clsx from 'clsx';

export const AVATAR_FRAMES: Record<string, { ring: string; label: string }> = {
  default: { ring: '', label: 'Default' },
  gold: { ring: 'p-[3px] bg-gradient-to-br from-amber-400 via-amber-300 to-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.35)]', label: 'Gold' },
  neon: { ring: 'p-[3px] bg-gradient-to-br from-coral-500 via-coral-400 to-pink-500 shadow-[0_0_14px_rgba(251,79,29,0.4)]', label: 'Neon' },
  royal: { ring: 'p-[3px] bg-gradient-to-br from-violet-500 via-violet-400 to-purple-600 shadow-[0_0_14px_rgba(139,92,246,0.4)]', label: 'Royal' },
  emerald: { ring: 'p-[3px] bg-gradient-to-br from-emerald-500 via-emerald-400 to-green-600 shadow-[0_0_12px_rgba(16,185,129,0.35)]', label: 'Emerald' },
  flame: { ring: 'p-[3px] bg-gradient-to-br from-orange-500 via-red-500 to-amber-500 shadow-[0_0_14px_rgba(249,115,22,0.4)]', label: 'Flame' },
};

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
  ...avatarProps
}: {
  frame?: string;
} & Parameters<typeof Avatar>[0]) {
  const def = AVATAR_FRAMES[frame] || AVATAR_FRAMES.default;
  if (!def.ring) return <Avatar {...avatarProps} />;
  return (
    <div className={clsx('rounded-full shrink-0', def.ring)}>
      <Avatar {...avatarProps} />
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