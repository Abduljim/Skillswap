import type { Badge } from '../types';

export function BadgesRow({
  badges,
  max = 5,
  size = 'md',
}: {
  badges?: Badge[] | null;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!badges || badges.length === 0) return null;
  const shown = badges.slice(0, max);
  const sizes = {
    sm: 'h-7 w-7 text-sm',
    md: 'h-9 w-9 text-base',
    lg: 'h-11 w-11 text-lg',
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((b) => (
        <div
          key={b.code}
          className="group relative"
          title={`${b.label} — ${b.description}`}
        >
          <div
            className={`flex ${sizes[size]} items-center justify-center rounded-full bg-gradient-to-br ${
              b.tier === 'PRO'
                ? 'from-amber-300 via-amber-200 to-coral-300 shadow-soft'
                : 'from-cream-200 to-mint-100 border border-ink-100'
            }`}
          >
            <span>{b.emoji}</span>
          </div>
          {/* Tooltip on hover */}
          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-[11px] font-medium text-cream-50 shadow-soft group-hover:block">
            {b.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-coral-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-soft-sm">
      👑 Pro
    </span>
  );
}