import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { MatchScoreBadge, FrameAvatar, EmptyState } from '../components/ui';
import { Users, ArrowRight, Repeat, CheckCircle2, Star, Plus, MessageSquare, Crown, Sparkles } from 'lucide-react';
import type { Match, ExchangeRequest, Exchange, Notification } from '../types';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: matchesData } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.get<{ matches: Match[]; total: number }>('/matches?pageSize=3'),
  });
  const { data: receivedRequests } = useQuery({
    queryKey: ['requests', 'received'],
    queryFn: () => api.get<ExchangeRequest[]>('/exchange-requests?type=received'),
  });
  const { data: exchanges } = useQuery({
    queryKey: ['exchanges'],
    queryFn: () => api.get<Exchange[]>('/exchanges'),
  });
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications: Notification[]; unreadCount: number }>('/notifications'),
  });
  const { data: subData } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<{ tier: 'FREE' | 'PRO' }>('/subscription'),
  });

  const bestMatches = matchesData?.matches || [];
  const pending = receivedRequests?.filter((r) => r.status === 'PENDING') || [];
  const activeExchanges = exchanges?.filter((e) => e.status === 'ACTIVE') || [];
  const completed = exchanges?.filter((e) => e.status === 'COMPLETED') || [];
  const isPro = subData ? subData.tier === 'PRO' : (user as any)?.tier === 'PRO';
  const greeting = greetingFor();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-sm text-ink-500">{greeting},</div>
        <h1 className="font-display font-bold text-3xl text-ink-900">{user?.displayName}</h1>
      </div>

      {/* Best match feature card */}
      {bestMatches[0] && <BestMatchHero match={bestMatches[0]} />}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Matches"
          value={matchesData?.total ?? 0}
          icon={<Users className="w-4 h-4" />}
        />
        <StatCard
          label="Requests"
          value={pending.length}
          icon={<MessageSquare className="w-4 h-4" />}
          accent="coral"
        />
        <StatCard
          label="Active"
          value={activeExchanges.length}
          icon={<Repeat className="w-4 h-4" />}
          accent="mint"
        />
        <StatCard
          label="Completed"
          value={completed.length}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
      </div>

      {/* Upgrade teaser (shown only on Free tier) */}
      {!isPro && <MembershipTeaser />}

      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-ink-900">Pending requests</h2>
            <Link to="/requests" className="text-xs text-coral-600 font-semibold hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {pending.slice(0, 3).map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3 bg-cream-50 rounded-xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FrameAvatar
                    frame={req.sender?.profile?.avatarFrame || 'default'}
                    src={req.sender?.profile?.avatarUrl}
                    alt={req.sender?.displayName || 'User'}
                    size={40}
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-ink-900 truncate">
                      {req.sender?.displayName}
                    </div>
                    <div className="text-xs text-ink-600 truncate">
                      Wants to learn {req.requestedSkill?.name}
                    </div>
                  </div>
                </div>
                <Link to="/requests" className="btn-coral text-xs px-3 py-1.5">
                  Review
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best matches */}
      {bestMatches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-ink-900">Best matches</h2>
            <Link to="/discover" className="text-xs text-coral-600 font-semibold hover:underline flex items-center gap-1">
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bestMatches.map((m) => (
              <Link
                key={m.userId}
                to={`/matches/${m.userId}`}
                className="card p-5 hover:shadow-soft-lg transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <MatchScoreBadge score={m.score} />
                  {m.rating != null && (
                    <span className="text-xs text-ink-500 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-coral-400 text-coral-400" /> {m.rating}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <FrameAvatar frame={m.avatarFrame || 'default'} src={m.avatarUrl} alt={m.displayName || 'User'} size={48} />
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-900 truncate">{m.displayName}</div>
                    <div className="text-xs text-ink-500 truncate">{m.university}</div>
                  </div>
                </div>
                {m.matchedSkills.theyCanTeachMe.length > 0 && (
                  <div className="mt-3 text-xs">
                    <span className="text-ink-500">Teaches you:</span>{' '}
                    <span className="text-ink-900 font-medium">
                      {m.matchedSkills.theyCanTeachMe.map((s) => s.name).join(', ')}
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {bestMatches.length === 0 && (
        <EmptyState
          icon={<Users className="w-5 h-5" />}
          title="Your skill circle is still forming"
          body="Add another skill you can teach or want to learn to discover more people."
          action={
            <Link to="/skills" className="btn-coral">
              <Plus className="w-4 h-4" /> Add a skill
            </Link>
          }
        />
      )}

      {/* Active exchanges */}
      {activeExchanges.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-ink-900">Active exchanges</h2>
            <Link to="/exchanges" className="text-xs text-coral-600 font-semibold hover:underline">
              View all
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {activeExchanges.slice(0, 4).map((e) => (
              <Link
                key={e.id}
                to={`/exchanges/${e.id}`}
                className="card p-4 hover:shadow-soft-lg transition-all flex items-center gap-3"
              >
                <div className="flex -space-x-2">
                  <FrameAvatar frame={e.userA.profile?.avatarFrame || 'default'} src={e.userA.profile?.avatarUrl} alt={e.userA.displayName} size={36} className="border-2 border-white" />
                  <FrameAvatar frame={e.userB.profile?.avatarFrame || 'default'} src={e.userB.profile?.avatarUrl} alt={e.userB.displayName} size={36} className="border-2 border-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-ink-900 truncate">
                    {e.userA.displayName} ↔ {e.userB.displayName}
                  </div>
                  <div className="text-xs text-ink-500 truncate">
                    {e.skillA?.name} ↔ {e.skillB?.name}
                  </div>
                </div>
                <span className="chip-mint">{e.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BestMatchHero({ match }: { match: Match }) {
  return (
    <Link
      to={`/matches/${match.userId}`}
      className="block card p-6 md:p-8 bg-gradient-to-br from-ink-900 to-ink-800 text-cream-50 hover:shadow-soft-lg transition-shadow relative overflow-hidden"
    >
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-coral-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-mint-500/20 rounded-full blur-3xl" />
      <div className="relative">
        <div className="text-xs uppercase tracking-widest text-coral-300 font-semibold mb-2">
          Your strongest match
        </div>
        <div className="grid sm:grid-cols-3 items-center gap-6">
          <div className="text-center">
            <div className="text-xs uppercase text-cream-300 mb-1">They teach you</div>
            <div className="flex flex-wrap gap-1 justify-center">
              {match.matchedSkills.theyCanTeachMe.slice(0, 2).map((s) => (
                <span key={s.id} className="chip bg-mint-500/30 text-mint-200">
                  {s.name}
                </span>
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-3">
              <FrameAvatar frame={match.avatarFrame || 'default'} src={match.avatarUrl} alt={match.displayName || 'User'} size={56} />
              <div className="font-display font-bold text-3xl text-coral-300">{match.score}%</div>
            </div>
            <div className="mt-1 text-sm font-semibold">{match.displayName}</div>
            <div className="text-xs text-cream-300">{match.university}</div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase text-cream-300 mb-1">You teach them</div>
            <div className="flex flex-wrap gap-1 justify-center">
              {match.matchedSkills.iCanTeachThem.slice(0, 2).map((s) => (
                <span key={s.id} className="chip bg-coral-500/30 text-coral-200">
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 text-center text-xs text-cream-300">
          View match details <ArrowRight className="w-3 h-3 inline" />
        </div>
      </div>
    </Link>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent = 'ink',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: 'ink' | 'coral' | 'mint';
}) {
  const accentClass =
    accent === 'coral'
      ? 'bg-coral-100 text-coral-700'
      : accent === 'mint'
      ? 'bg-mint-100 text-mint-700'
      : 'bg-cream-100 text-ink-700';
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-ink-500 uppercase tracking-wide font-medium">{label}</div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentClass}`}>{icon}</div>
      </div>
      <div className="mt-1 text-2xl font-display font-bold text-ink-900">{value}</div>
    </div>
  );
}

function greetingFor() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function MembershipTeaser() {
  return (
    <Link
      to="/membership"
      className="block card p-6 bg-gradient-to-br from-coral-500 to-coral-600 text-white hover:shadow-soft-lg transition-shadow relative overflow-hidden"
    >
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
      <div className="relative flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-lg leading-tight">
            Go Pro, skip the limits
          </div>
          <div className="text-sm text-coral-100 mt-0.5">
            Unlimited requests, who-viewed-me, boosts &amp; a Pro badge.
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-sm font-semibold bg-white/20 rounded-lg px-3 py-2">
          Upgrade <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}