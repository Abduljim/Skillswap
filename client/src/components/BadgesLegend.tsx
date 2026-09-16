import clsx from 'clsx';
import { BADGE_DEFS } from '../lib/badges';

export function BadgesLegend({ earned }: { earned?: string[] }) {
  const owned = new Set(earned || []);
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {BADGE_DEFS.map((b) => {
        const has = owned.has(b.code);
        return (
          <div
            key={b.code}
            className={clsx(
              'flex items-center gap-3 rounded-xl border p-3',
              has ? 'border-ink-100' : 'border-ink-100/60 opacity-55'
            )}
          >
            <div
              className={clsx(
                'w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-lg',
                has
                  ? b.tier === 'PRO'
                    ? 'bg-gradient-to-br from-amber-300 via-amber-200 to-coral-300 shadow-soft'
                    : 'bg-gradient-to-br from-cream-200 to-mint-100 border border-ink-100'
                  : 'bg-cream-100 grayscale'
              )}
            >
              <span>{b.emoji}</span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-sm font-semibold text-ink-900">{b.label}</span>
                {has ? (
                  <span className="chip-mint text-[10px]">Earned</span>
                ) : (
                  <span className="chip-cream text-[10px]">Locked</span>
                )}
              </div>
              <div className="text-xs text-ink-500 leading-snug">{b.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}