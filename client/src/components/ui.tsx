import { ReactNode } from 'react';
import clsx from 'clsx';
import { CardArt, useCardUid, resolveCard, CARD_OUTER_RATIO } from '../profileCards';

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

/**
 * Avatar with its profile card (ring artwork) drawn around it.
 *
 * The card art is inline SVG/CSS, so the outer box is a fixed ratio of the
 * avatar size and stays crisp at any scale — no PNG assets, no per-frame scale
 * table. Unknown or retired frame ids fall back to the free card.
 */
export function FrameAvatar({
  frame = 'linen',
  size = 40,
  ...avatarProps
}: {
  frame?: string;
  size?: number;
} & Omit<Parameters<typeof Avatar>[0], 'size'>) {
  const card = resolveCard(frame);
  const uid = useCardUid();
  const outer = size * CARD_OUTER_RATIO;
  const inset = (outer - size) / 2;

  return (
    <div className="relative shrink-0" style={{ width: outer, height: outer }}>
      <div className="absolute" style={{ left: inset, top: inset }}>
        <Avatar {...avatarProps} size={size} />
      </div>
      <CardArt card={card.id} uid={uid} />
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