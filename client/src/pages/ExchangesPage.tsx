import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { FrameAvatar, EmptyState, Skeleton } from '../components/ui';
import type { Exchange } from '../types';
import { Repeat, MessageSquare } from 'lucide-react';

export default function ExchangesPage() {
  const [tab, setTab] = useState<'active' | 'completed' | 'cancelled'>('active');
  const { data: exchanges = [], isLoading } = useQuery({
    queryKey: ['exchanges'],
    queryFn: () => api.get<Exchange[]>('/exchanges'),
  });

  const filtered = exchanges.filter((e) =>
    tab === 'active' ? e.status === 'ACTIVE' : tab === 'completed' ? e.status === 'COMPLETED' : e.status === 'CANCELLED'
  );

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-ink-900 mb-2">Exchanges</h1>
      <div className="flex gap-1 border-b border-ink-100 mb-6">
        {(['active', 'completed', 'cancelled'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize -mb-px border-b-2 transition-colors ${
              tab === t ? 'border-coral-500 text-ink-900' : 'border-transparent text-ink-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-32" />}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<Repeat className="w-5 h-5" />}
          title={`No ${tab} exchanges`}
          body={tab === 'active' ? 'Your first exchange is waiting.' : undefined}
          action={
            tab === 'active' ? (
              <Link to="/discover" className="btn-coral">Find someone</Link>
            ) : undefined
          }
        />
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {filtered.map((e) => (
          <ExchangeCard key={e.id} exchange={e} />
        ))}
      </div>
    </div>
  );
}

function ExchangeCard({ exchange }: { exchange: Exchange }) {
  return (
    <Link to={`/exchanges/${exchange.id}`} className="card p-5 hover:shadow-soft-lg transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className={`chip ${
          exchange.status === 'ACTIVE' ? 'bg-mint-100 text-mint-700' :
          exchange.status === 'COMPLETED' ? 'bg-cream-100 text-ink-700' :
          'bg-coral-100 text-coral-700'
        }`}>{exchange.status}</span>
        <div className="flex items-center gap-1 text-xs text-ink-500">
          <MessageSquare className="w-3 h-3" /> {exchange.messageCount}
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 my-4">
        <FrameAvatar frame={exchange.userA.profile?.avatarFrame || 'default'} src={exchange.userA.profile?.avatarUrl} alt={exchange.userA.displayName} size={48} />
        <div className="text-ink-400 text-2xl">↔</div>
        <FrameAvatar frame={exchange.userB.profile?.avatarFrame || 'default'} src={exchange.userB.profile?.avatarUrl} alt={exchange.userB.displayName} size={48} />
      </div>
      <div className="text-center">
        <div className="font-semibold text-ink-900">
          {exchange.userA.displayName} ↔ {exchange.userB.displayName}
        </div>
        <div className="text-sm text-ink-600 mt-1">
          <span className="chip-coral">{exchange.skillA?.name}</span>
          <span className="mx-2 text-ink-400">↔</span>
          <span className="chip-mint">{exchange.skillB?.name}</span>
        </div>
      </div>
    </Link>
  );
}