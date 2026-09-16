import clsx from 'clsx';
import { Bird, Repeat, Crown, Award, Gem, type LucideIcon } from 'lucide-react';
import { BADGE_DEFS } from '../lib/badges';

const ICONS: Record<string, LucideIcon> = { Bird, Repeat, Crown, Award, Gem };

export function BadgesLegend({ earned }: { earned?: string[] }) {
  const owned = new Set(earned || []);
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {BADGE_DEFS.map((b) => {
        const has = owned.has(b.code);
        const Icon = ICONS[b.icon] || Award;
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
                'w-10 h-10 shrink-0 rounded-xl flex items-center justify-center',
                has
                  ? b.tier === 'PRO'
                    ? 'bg-gradient-to-br from-amber-300 via-amber-200 to-coral-300 shadow-soft'
                    : 'bg-gradient-to-br from-cream-200 to-mint-100 border border-ink-100'
                  : 'bg-cream-100 grayscale'
              )}
            >
              <Icon size={18} className={has && b.tier === 'PRO' ? 'text-amber-800' : 'text-ink-600'} />
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