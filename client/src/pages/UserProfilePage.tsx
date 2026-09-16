import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { EmptyState, Skeleton, FrameAvatar, resolveBannerColor } from '../components/ui';
import { BadgesRow, ProBadge } from '../components/Badges';
import { BadgesLegend } from '../components/BadgesLegend';
import { ArrowLeft, Star, Medal } from 'lucide-react';

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => api.get<any>(`/users/${id}`),
    enabled: !!id,
  });
  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews', id],
    queryFn: () => api.get<any[]>(`/users/${id}/reviews`),
    enabled: !!id,
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (!user) {
    return (
      <EmptyState
        title="User not found"
        action={<Link to="/discover" className="btn-primary">Back to Discover</Link>}
      />
    );
  }

  const isPro = user.tier === 'PRO';

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/discover" className="btn-ghost text-sm -ml-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="card overflow-hidden">
        <div className={`p-6 md:p-8 ${user.bannerStyle ? `card-color-${resolveBannerColor(user.bannerStyle)} card-dark` : 'bg-gradient-to-br from-cream-50/60 via-white/40 to-mint-50/50'}`}>
        <div className="flex flex-col md:flex-row items-start gap-5">
          <FrameAvatar frame={user.avatarFrame} src={user.avatarUrl} alt={user.displayName} size={96} />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display font-bold text-3xl text-ink-900">{user.displayName}</h1>
              {isPro && <ProBadge />}
            </div>
            {user.occupation && (
              <p className="text-ink-700 mt-1">
                <span className="capitalize">{user.occupation.replace('_', '-')}</span>
                {user.occupation === 'student' && (user.university || user.department) && (
                  <> at {[user.university, user.department].filter(Boolean).join(' · ')}</>
                )}
                {user.occupation !== 'student' && (user.jobTitle || user.company) && (
                  <>
                    {' '}· {[user.jobTitle, user.company].filter(Boolean).join(' at ')}
                  </>
                )}
              </p>
            )}
            {!user.occupation && user.university && (
              <p className="text-ink-700 mt-1">
                {user.university} · {user.department} {user.yearLevel && `· ${user.yearLevel}`}
              </p>
            )}
            {user.bio && <p className="text-ink-700 mt-3">{user.bio}</p>}
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {user.rating != null && (
                <span className="chip-cream flex items-center gap-1">
                  <Star className="w-3 h-3 fill-coral-400 text-coral-400" /> {user.rating} ({user.reviewsCount} reviews)
                </span>
              )}
              <span className="chip-cream">{user.completedExchanges} exchanges completed</span>
              {user.learningFormat && (
                <span className="chip-cream">{user.learningFormat.toLowerCase()}</span>
              )}
            </div>
            {user.badges && user.badges.length > 0 && (
              <div className="mt-3">
                <BadgesRow badges={user.badges} size="sm" />
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Link to={`/matches/${user.id}`} className="btn-coral">Start Exchange Request</Link>
            </div>
          </div>
        </div>
        </div>
      </div>

      {user.teachingSkills?.length > 0 && (
        <div className="card p-6">
          <h2 className="font-display font-bold text-lg text-ink-900 mb-3">Teaches</h2>
          <div className="flex flex-wrap gap-2">
            {user.teachingSkills.map((s: any) => (
              <span key={s.id} className="chip-mint">
                {s.name} · {s.proficiency.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {user.wantedSkills?.length > 0 && (
        <div className="card p-6">
          <h2 className="font-display font-bold text-lg text-ink-900 mb-3">Wants to learn</h2>
          <div className="flex flex-wrap gap-2">
            {user.wantedSkills.map((s: any) => (
              <span key={s.id} className="chip-coral">{s.name}</span>
            ))}
          </div>
        </div>
      )}

      {user.badges && user.badges.length > 0 && (
        <div className="card p-6">
          <h2 className="font-display font-bold text-lg text-ink-900 flex items-center gap-2 mb-4">
            <Medal className="w-4 h-4 text-coral-500" /> Badges
          </h2>
          <BadgesLegend earned={user.badges.map((b: any) => b.code)} />
        </div>
      )}

      {reviews.length > 0 && (
        <div className="card p-6">
          <h2 className="font-display font-bold text-lg text-ink-900 mb-3">Reviews</h2>
          <div className="space-y-4">
            {reviews.map((r: any) => (
              <div key={r.id} className="border-b border-ink-100 last:border-0 pb-4 last:pb-0">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm text-ink-900">{r.reviewer?.displayName}</div>
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i < r.rating ? 'fill-coral-400 text-coral-400' : 'text-ink-200'}`}
                      />
                    ))}
                  </div>
                </div>
                {r.comment && <p className="text-sm text-ink-700 mt-1">{r.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}