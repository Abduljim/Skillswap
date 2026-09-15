import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Avatar, MatchScoreBadge, EmptyState, Skeleton } from '../components/ui';
import { Search, Filter, Star, Repeat, Crown, Zap } from 'lucide-react';
import type { Match, Skill } from '../types';

export default function DiscoverPage() {
  const [page, setPage] = useState(1);
  const [minScore, setMinScore] = useState(40);
  const [skillId, setSkillId] = useState<string>('');
  const [university, setUniversity] = useState('');
  const [format, setFormat] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const { data: skills = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<Skill[]>('/skills'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['matches', { page, skillId, university, format, minScore }],
    queryFn: () =>
      api.get<{ matches: Match[]; total: number; pageSize: number }>(
        `/matches?page=${page}&pageSize=12&minScore=${minScore}${
          skillId ? `&skillId=${skillId}` : ''
        }${university ? `&university=${encodeURIComponent(university)}` : ''}${
          format ? `&format=${format}` : ''
        }`
      ),
  });

  const matches = data?.matches || [];
  const total = data?.total || 0;
  const pageSize = data?.pageSize || 12;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-ink-900">Discover</h1>
          <p className="text-sm text-ink-600 mt-1">
            {total} {total === 1 ? 'match' : 'matches'} based on what you teach and want to learn.
          </p>
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="btn-outline"
        >
          <Filter className="w-4 h-4" /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="card p-5 mb-6 grid sm:grid-cols-4 gap-3 animate-slide-up">
          <div>
            <label className="label">Min match</label>
            <select
              value={minScore}
              onChange={(e) => {
                setMinScore(parseInt(e.target.value));
                setPage(1);
              }}
              className="input"
            >
              <option value="40">40% (potential)</option>
              <option value="60">60% (strong)</option>
              <option value="80">80% (perfect)</option>
            </select>
          </div>
          <div>
            <label className="label">Skill they teach</label>
            <select
              value={skillId}
              onChange={(e) => {
                setSkillId(e.target.value);
                setPage(1);
              }}
              className="input"
            >
              <option value="">Any</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">University</label>
            <input
              className="input"
              placeholder="e.g. UNILAG"
              value={university}
              onChange={(e) => {
                setUniversity(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="label">Format</label>
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setPage(1);
              }}
              className="input"
            >
              <option value="">Any</option>
              <option value="ONLINE">Online</option>
              <option value="IN_PERSON">In person</option>
              <option value="EITHER">Either</option>
            </select>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && matches.length === 0 && (
        <EmptyState
          icon={<Search className="w-5 h-5" />}
          title="No matches yet"
          body="Try lowering the minimum score or adding more skills to your profile."
        />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {matches.map((m) => (
          <MatchCard key={m.userId} match={m} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-outline disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-sm text-ink-600">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-outline disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const theyTeach = match.matchedSkills.theyCanTeachMe;
  const iTeach = match.matchedSkills.iCanTeachThem;

  return (
    <Link
      to={`/matches/${match.userId}`}
      className="card p-5 hover:shadow-soft-lg transition-all hover:-translate-y-0.5 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-coral-100 rounded-full blur-3xl opacity-40 -translate-y-12 translate-x-12" />

      <div className="flex items-center justify-between mb-3 relative">
        <div className="flex items-center gap-1.5">
          <MatchScoreBadge score={match.score} />
          {match.tier === 'PRO' && (
            <span className="chip-coral text-[10px] py-0.5">
              <Crown className="w-3 h-3" /> Pro
            </span>
          )}
          {match.isBoosted && (
            <span className="chip-cream text-[10px] py-0.5">
              <Zap className="w-3 h-3 text-coral-500" /> Boosted
            </span>
          )}
        </div>
        {match.rating != null && (
          <span className="text-xs text-ink-600 flex items-center gap-1">
            <Star className="w-3 h-3 fill-coral-400 text-coral-400" /> {match.rating}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 relative">
        <Avatar src={match.avatarUrl} alt={match.displayName || 'User'} size={52} />
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-ink-900 truncate">{match.displayName}</div>
          <div className="text-xs text-ink-500 truncate">{match.university}</div>
          <div className="text-xs text-ink-500 truncate">
            {match.completedExchanges ?? 0} completed exchanges
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 relative">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">They teach</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {theyTeach.slice(0, 2).map((s) => (
              <span key={s.id} className="chip-mint text-[11px]">
                {s.name}
              </span>
            ))}
            {theyTeach.length === 0 && <span className="text-xs text-ink-400">—</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">You teach</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {iTeach.slice(0, 2).map((s) => (
              <span key={s.id} className="chip-coral text-[11px]">
                {s.name}
              </span>
            ))}
            {iTeach.length === 0 && <span className="text-xs text-ink-400">—</span>}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between text-xs relative">
        <span className="text-ink-500">
          {match.category === 'PERFECT' ? 'Perfect match' : match.category === 'STRONG' ? 'Strong match' : 'Potential match'}
        </span>
        <span className="text-coral-600 font-semibold flex items-center gap-1">
          <Repeat className="w-3 h-3" /> View match
        </span>
      </div>
    </Link>
  );
}