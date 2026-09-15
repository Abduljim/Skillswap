import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { Avatar, MatchScoreBadge, EmptyState, Skeleton } from '../components/ui';
import { ArrowLeft, Send, Check, X, Shield, Ban, Crown } from 'lucide-react';
import PaywallModal from '../components/PaywallModal';
import type { Match, Skill } from '../types';

export default function MatchDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: match, isLoading } = useQuery({
    queryKey: ['match', userId],
    queryFn: () => api.get<Match | null>(`/matches/${userId}`),
    enabled: !!userId,
  });

  const { data: profile } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.get<any>(`/users/${userId}`),
    enabled: !!userId,
  });

  const { data: skills = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<Skill[]>('/skills'),
  });

  const [offeredSkillId, setOfferedSkillId] = useState<string>('');
  const [requestedSkillId, setRequestedSkillId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);

  const mySkills = match ? match.matchedSkills.iCanTeachThem : [];
  const theirSkills = match ? match.matchedSkills.theyCanTeachMe : [];

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post('/exchange-requests', {
        receiverId: userId,
        offeredSkillId,
        requestedSkillId,
        message,
      }),
    onSuccess: () => {
      toast.push({ type: 'success', title: 'Request sent!', body: 'They will be notified.' });
      qc.invalidateQueries({ queryKey: ['requests'] });
      nav('/requests');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'FORBIDDEN' && err.message.toLowerCase().includes('pro')) {
          setShowPaywall(true);
        } else {
          toast.push({ type: 'error', title: 'Failed to send request', body: err.message });
        }
      }
    },
  });
  const [showPaywall, setShowPaywall] = useState(false);

  const blockMutation = useMutation({
    mutationFn: () => api.post(`/users/${userId}/block`),
    onSuccess: () => {
      toast.push({ type: 'info', title: 'User blocked' });
      nav('/discover');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!match || !profile) {
    return (
      <EmptyState
        title="Match not found"
        body="This user may have been deactivated or removed."
        action={<Link to="/discover" className="btn-primary">Back to Discover</Link>}
      />
    );
  }

  const openForm = () => {
    if (mySkills.length > 0) setOfferedSkillId(mySkills[0].id);
    if (theirSkills.length > 0) setRequestedSkillId(theirSkills[0].id);
    setMessage(
      `Hi ${profile.displayName}, I noticed you can teach ${theirSkills[0]?.name ?? 'a skill'}, and I'm currently learning it. I can teach you ${mySkills[0]?.name ?? 'a skill'} in return. Would you like to exchange skills?`
    );
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Free limit reached"
        reason="You've reached the free plan limit for pending requests. Upgrade to Pro for unlimited exchanges."
      />
      <button onClick={() => nav(-1)} className="btn-ghost text-sm -ml-2">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="card p-6 md:p-8 bg-gradient-to-br from-ink-900 to-ink-800 text-cream-50 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-coral-500/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-mint-500/20 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <Avatar src={profile.avatarUrl} alt={profile.displayName} size={96} />
          <div className="flex-1 text-center md:text-left">
            <div className="text-xs uppercase tracking-widest text-coral-300 font-semibold mb-1">
              You two have something to trade
            </div>
            <h1 className="font-display font-bold text-3xl">{profile.displayName}</h1>
            <div className="text-sm text-cream-200 mt-1">{profile.university} · {profile.department}</div>
            {profile.bio && <p className="text-cream-100 mt-3 max-w-lg">{profile.bio}</p>}
          </div>
          <div className="text-center">
            <div className="text-5xl font-display font-extrabold text-coral-300">{match.score}%</div>
            <div className="text-xs uppercase text-cream-300">Match</div>
            {match.tier === 'PRO' && (
              <span className="chip bg-coral-500 text-white text-[10px] mt-2 inline-flex">
                <Crown className="w-3 h-3" /> Pro
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The exchange */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wide text-coral-500 font-semibold mb-2">You teach them</div>
          <div className="space-y-2">
            {mySkills.length === 0 && <div className="text-sm text-ink-500">Nothing you teach matches what they want yet.</div>}
            {mySkills.map((s) => (
              <div key={s.id} className="chip-coral">{s.name}</div>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wide text-mint-600 font-semibold mb-2">They teach you</div>
          <div className="space-y-2">
{theyTeach(theirSkills).length === 0 && (
            <div className="text-sm text-ink-500">They don't teach anything you want yet.</div>
          )}
            {theyTeach(theirSkills).map((s) => (
              <div key={s.id} className="chip-mint">{s.name}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Reasons */}
      {match.reasons.length > 0 && (
        <div className="card p-6">
          <h3 className="font-display font-bold text-lg text-ink-900 mb-3">Why you match</h3>
          <ul className="space-y-2">
            {match.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                <Check className="w-4 h-4 text-mint-500 mt-0.5 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Skills they teach / want */}
      {profile.teachingSkills && profile.teachingSkills.length > 0 && (
        <div className="card p-6">
          <h3 className="font-display font-bold text-lg text-ink-900 mb-3">Skills they teach</h3>
          <div className="flex flex-wrap gap-2">
            {profile.teachingSkills.map((s: any) => (
              <span key={s.id} className="chip-cream">
                {s.name} · {s.proficiency.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action area */}
      <div className="card p-6">
        {!showForm ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={openForm} disabled={mySkills.length === 0 || theirSkills.length === 0} className="btn-coral flex-1 justify-center disabled:opacity-50">
              <Send className="w-4 h-4" /> Send Exchange Request
            </button>
            <button onClick={() => nav(`/profile/${userId}`)} className="btn-outline">View full profile</button>
            <button
              onClick={() => {
                if (confirm('Block this user? You will no longer see them in matches.')) {
                  blockMutation.mutate();
                }
              }}
              className="btn-ghost text-ink-500"
              title="Block"
            >
              <Ban className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="font-display font-bold text-lg text-ink-900">Send exchange request</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">You offer</label>
                <select
                  className="input"
                  value={offeredSkillId}
                  onChange={(e) => setOfferedSkillId(e.target.value)}
                >
                  {mySkills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">You want to learn</label>
                <select
                  className="input"
                  value={requestedSkillId}
                  onChange={(e) => setRequestedSkillId(e.target.value)}
                >
                  {theirSkills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Message</label>
              <textarea
                className="input min-h-[120px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
              />
              <div className="text-xs text-ink-500 text-right">{message.length}/1000</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending || !offeredSkillId || !requestedSkillId || message.length < 10}
                className="btn-coral flex-1"
              >
                {sendMutation.isPending ? 'Sending…' : 'Send Request'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-outline">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function theyTeach(arr: Match['matchedSkills']['theyCanTeachMe']) {
  return arr;
}