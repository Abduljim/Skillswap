import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { EmptyState, Skeleton, FrameAvatar, AVATAR_FRAMES, BANNER_STYLES, resolveBannerColor, isDarkBanner } from '../components/ui';
import { BadgesRow, ProBadge } from '../components/Badges';
import { BadgesLegend } from '../components/BadgesLegend';
import { Plus, Trash2, Save, Camera, X, Crown, Star, Repeat, CalendarDays, Sparkles, Flame } from 'lucide-react';
import type { Skill, LearningFormat, Weekday, TimeOfDay } from '../types';
import { STREAK_MILESTONES } from '../streaks';

const WEEKDAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const TIMES: TimeOfDay[] = ['MORNING', 'AFTERNOON', 'EVENING'];
const CARD_COLORS = BANNER_STYLES.map((b) => ({ value: b.value, label: b.label, cls: b.cls }));

const OCCUPATIONS: { value: string; label: string }[] = [
  { value: 'student', label: 'Student' },
  { value: 'employed', label: 'Employed' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'other', label: 'Other' },
];

const GENDERS: { value: string; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

const AVATAR_SIZE = 256;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB source cap — client downscales to 256px

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not a valid image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api.get<any>('/profile'),
  });
  const { data: skillsList = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<Skill[]>('/skills'),
  });
  const { data: subData } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<{ tier: 'FREE' | 'PRO' }>('/subscription'),
  });
  const isPro = subData ? subData.tier === 'PRO' : (user as any)?.tier === 'PRO';

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const startEdit = () => {
    setForm({
      displayName: user?.displayName || '',
      university: profile?.university || '',
      department: profile?.department || '',
      yearLevel: profile?.yearLevel || '',
      occupation: profile?.occupation || '',
      jobTitle: profile?.jobTitle || '',
      company: profile?.company || '',
      gender: profile?.gender || '',
      bio: profile?.bio || '',
      avatarUrl: profile?.avatarUrl || '',
      learningFormat: profile?.learningFormat || 'EITHER',
      availabilities: profile?.availabilities || [],
    });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/profile', data),
    onSuccess: () => {
      toast.push({ type: 'success', title: 'Profile updated' });
      refresh();
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      setEditing(false);
    },
  });

  const looksMutation = useMutation({
    mutationFn: (data: any) => api.put('/profile', data),
    onSuccess: () => {
      toast.push({ type: 'success', title: 'Look saved' });
      qc.invalidateQueries({ queryKey: ['my-profile'] });
    },
  });

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.push({ type: 'error', title: 'Please choose an image file' });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.push({ type: 'error', title: 'Image too large', body: 'Max 5MB before resizing.' });
      return;
    }
    setUploadingAvatar(true);
    try {
      const dataUrl = await resizeImage(file);
      setForm({ ...form, avatarUrl: dataUrl });
    } catch (err: any) {
      toast.push({ type: 'error', title: 'Could not load image', body: err.message });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const addSkill = async (skillId: string, type: 'TEACH' | 'WANT') => {
    try {
      await api.post(`/skills/${skillId}/add`, { skillId, type, proficiency: 'INTERMEDIATE' });
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      toast.push({ type: 'success', title: 'Skill added' });
    } catch (e: any) {
      toast.push({ type: 'error', title: 'Could not add skill', body: e.message });
    }
  };

  const removeSkill = async (skillId: string, type: 'TEACH' | 'WANT') => {
    try {
      await api.delete(`/skills/${skillId}/remove?type=${type}`);
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      toast.push({ type: 'info', title: 'Skill removed' });
    } catch (e: any) {
      toast.push({ type: 'error', title: 'Could not remove skill', body: e.message });
    }
  };

  if (isLoading) return <Skeleton className="h-32" />;

  const teaching = profile?.userSkills?.filter((s: any) => s.type === 'TEACH') || [];
  const wanting = profile?.userSkills?.filter((s: any) => s.type === 'WANT') || [];
  const joined = profile?.user?.createdAt ? new Date(profile.user.createdAt) : null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Profile header */}
      <div className="card overflow-hidden relative">
        <div className={`p-6 md:p-8 relative card-color-${resolveBannerColor(profile?.bannerStyle)} ${isDarkBanner(profile?.bannerStyle) ? 'card-dark' : ''}`}>
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="relative flex items-start gap-4 md:gap-6">
          <div className="relative shrink-0">
            <FrameAvatar frame={editing ? 'default' : profile?.avatarFrame || 'default'} src={editing ? form?.avatarUrl : profile?.avatarUrl} alt={user?.displayName || ''} size={88} className="shadow-soft" />
            {editing && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-ink-900 text-cream-50 flex items-center justify-center border-2 border-white hover:bg-ink-700"
                  title="Upload photo"
                >
                  {uploadingAvatar ? (
                    <span className="w-3 h-3 border-2 border-cream-50 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                </button>
                {form?.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, avatarUrl: '' })}
                    className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-white text-ink-700 flex items-center justify-center border border-ink-200 hover:text-coral-600"
                    title="Remove photo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFile}
                />
              </>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {!editing ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display font-bold text-2xl text-ink-900">{user?.displayName}</h1>
                  {profile?.user?.isAdmin && (
                    <span className="chip-cream text-xs">Admin</span>
                  )}
                  {isPro && <ProBadge />}
                </div>
                <p className="text-sm text-ink-600">{user?.email}</p>
                {(() => {
                  if (profile?.occupation === 'student') {
                    return (profile?.university || profile?.department) ? (
                      <p className="text-sm text-ink-700 mt-1 font-medium">
                        Student{profile.university || profile.department ? ` at ${[profile.university, profile.department].filter(Boolean).join(' · ')}` : ''}
                      </p>
                    ) : null;
                  }
                  if (profile?.occupation === 'employed' || profile?.occupation === 'self_employed') {
                    const title = profile?.jobTitle || profile?.company;
                    return title ? (
                      <p className="text-sm text-ink-700 mt-1 font-medium">
                        <span className="capitalize">{profile.occupation.replace('_', '-')}</span>{' '}
                        {profile.jobTitle ? `· ${profile.jobTitle}` : ''}
                        {profile.company ? ` at ${profile.company}` : ''}
                      </p>
                    ) : null;
                  }
                  return null;
                })()}
                {profile?.bio && <p className="text-sm text-ink-700 mt-3 leading-relaxed">{profile.bio}</p>}

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="chip-cream flex items-center gap-1">
                    <Crown className="w-3 h-3" /> {isPro ? 'Pro' : 'Free'}
                  </span>
                  <span className="chip-cream">Format: {profile?.learningFormat?.toLowerCase()}</span>
                  {profile?.gender && (
                    <span className="chip-cream capitalize">{profile.gender === 'unspecified' ? 'Prefer not to say' : profile.gender}</span>
                  )}
                  {profile?.availabilities?.length > 0 && (
                    <span className="chip-cream">{profile.availabilities.length} time slots</span>
                  )}
                  {joined && (
                    <span className="chip-cream flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" /> Joined {joined.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <BadgesRow badges={profile?.badges} size="md" />
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink-600">
                  <span className="flex items-center gap-1.5">
                    <Repeat className="w-4 h-4 text-coral-500" />
                    <strong className="text-ink-900">{teaching.length}</strong> skills taught
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-coral-500" />
                    <strong className="text-ink-900">{wanting.length}</strong> skills to learn
                  </span>
                </div>

                <button onClick={startEdit} className="btn-outline mt-4">Edit profile</button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Display name</label>
                    <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Occupation</label>
                    <select className="input" value={form.occupation || ''} onChange={(e) => setForm({ ...form, occupation: e.target.value })}>
                      <option value="">Select…</option>
                      {OCCUPATIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Gender</label>
                    <select className="input" value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                      <option value="">Select…</option>
                      {GENDERS.map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                  {form.occupation !== 'student' && (
                    <>
                      <div>
                        <label className="label">Job title</label>
                        <input className="input" value={form.jobTitle || ''} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Company</label>
                        <input className="input" value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                      </div>
                    </>
                  )}
                  {form.occupation === 'student' && (
                    <>
                      <div>
                        <label className="label">University</label>
                        <input className="input" value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Department</label>
                        <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Year</label>
                        <input className="input" value={form.yearLevel} onChange={(e) => setForm({ ...form, yearLevel: e.target.value })} />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="label">Format</label>
                    <select className="input" value={form.learningFormat} onChange={(e) => setForm({ ...form, learningFormat: e.target.value as LearningFormat })}>
                      <option value="ONLINE">Online</option>
                      <option value="IN_PERSON">In person</option>
                      <option value="EITHER">Either</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Profile photo</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => fileRef.current?.click()} className="btn-outline text-xs px-3 py-1.5">
                        <Camera className="w-3 h-3" /> {form?.avatarUrl ? 'Change photo' : 'Upload photo'}
                      </button>
                      {form?.avatarUrl && (
                        <button type="button" onClick={() => setForm({ ...form, avatarUrl: '' })} className="btn-ghost text-xs px-3 py-1.5 text-ink-500">
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-500 mt-1">Photos are resized to 256px before saving.</p>
                  </div>
                </div>
                <div>
                  <label className="label">Bio</label>
                  <textarea className="input min-h-[80px]" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                </div>
                <div>
                  <label className="label">Availability</label>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {WEEKDAYS.map((d) => (
                          <tr key={d}>
                            <td className="text-xs uppercase text-ink-500 py-1 w-16">{d.slice(0, 3)}</td>
                            {TIMES.map((t) => {
                              const active = form.availabilities?.some((a: any) => a.weekday === d && a.timeOfDay === t);
                              return (
                                <td key={t} className="py-1 px-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const arr = form.availabilities || [];
                                      if (active) {
                                        setForm({ ...form, availabilities: arr.filter((a: any) => !(a.weekday === d && a.timeOfDay === t)) });
                                      } else {
                                        setForm({ ...form, availabilities: [...arr, { weekday: d, timeOfDay: t }] });
                                      }
                                    }}
                                    className={`w-full h-8 rounded text-xs font-medium ${active ? 'bg-ink-900 text-cream-50' : 'bg-cream-100 text-ink-700'}`}
                                  >
                                    {t.slice(0, 3)}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
                    <Save className="w-4 h-4" /> {saveMutation.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditing(false)} className="btn-outline">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Member status */}
      <div className={`card p-5 flex items-center justify-between gap-3 ${isPro ? 'bg-gradient-to-br from-ink-900 to-ink-800 text-cream-50' : ''}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isPro ? 'bg-coral-500/20 text-coral-300' : 'bg-cream-100 text-ink-600'}`}>
            <Crown className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-semibold ${isPro ? 'text-cream-50' : 'text-ink-900'}`}>
              {isPro ? 'Pro plan' : 'Free plan'}
            </div>
            <div className={`text-xs mt-0.5 ${isPro ? 'text-cream-300' : 'text-ink-500'}`}>
              {isPro
                ? 'Unlimited requests, boosts, who-viewed-me & Pro badge.'
                : 'Upgrade to Pro for unlimited requests, boosts & more.'}
            </div>
          </div>
        </div>
        {!isPro && (
          <Link to="/membership" className="btn-coral text-xs px-3 py-2 shrink-0">Upgrade</Link>
        )}
        {isPro && (
          <Link to="/membership" className="btn-ghost text-xs px-3 py-2 shrink-0 text-cream-100">Manage</Link>
        )}
      </div>

      {/* Day streak */}
      <div className="card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-coral-500/10 text-coral-600 flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Day streak</div>
              <div className="text-xs text-ink-500">Check in daily to keep it growing.</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-display font-bold text-2xl text-coral-600">
              {profile?.streak ?? 0}
              <span className="text-sm text-ink-500 ml-1">days</span>
            </div>
            <div className="text-xs text-ink-500">Best: {profile?.maxStreak ?? 0}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {STREAK_MILESTONES.map((m, i) => {
            const streak = profile?.streak ?? 0;
            const reached = streak >= m;
            const isNext = streak < m && streak >= (STREAK_MILESTONES[i - 1] ?? 0);
            return (
              <div
                key={m}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold ${
                  reached ? 'bg-coral-500/15 text-coral-700' : isNext ? 'bg-coral-500/5 text-coral-600 ring-1 ring-coral-500/40' : 'bg-cream-100 text-ink-500'
                }`}
              >
                <Flame className={`w-3 h-3 ${reached ? 'text-coral-500' : 'opacity-40'}`} />
                {m}
              </div>
            );
          })}
        </div>
      </div>

      {/* Customize your profile */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg text-ink-900 flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-coral-500" /> Customize your profile
        </h2>
        <p className="text-xs text-ink-500 mb-5">
          Free gets Cream. Unlock every gradient card color and a matching avatar frame with Pro.
        </p>

        {isPro && (
          <>
            <div className="text-sm font-semibold text-ink-700 mb-3">Avatar frame</div>
            <div className="flex flex-wrap gap-2 mb-6">
              {Object.entries(AVATAR_FRAMES).map(([key, def]) => {
                const active = (profile?.avatarFrame || 'default') === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => looksMutation.mutate({ avatarFrame: key })}
                    className={`rounded-full p-1 transition-all ${
                      active ? 'ring-2 ring-coral-500 scale-105' : 'hover:ring-2 hover:ring-ink-200'
                    }`}
                    title={def.label}
                  >
                    <FrameAvatar frame={key} src={profile?.avatarUrl} alt="" size={44} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="text-sm font-semibold text-ink-700 mb-3">
          {isPro ? 'Profile card color' : 'Profile card color (Cream is free)'}
        </div>
        <div className="flex flex-wrap gap-2">
          {CARD_COLORS.map((c) => {
            const active = resolveBannerColor(profile?.bannerStyle) === c.value;
            const locked = !isPro && c.value !== 'cream';
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  if (locked) {
                    toast.push({
                      type: 'info',
                      title: 'Pro perk',
                      body: 'Upgrade to Pro to use this card color.',
                    });
                    return;
                  }
                  looksMutation.mutate({ bannerStyle: c.value });
                }}
                className={`rounded-lg p-1 transition-all ${
                  active ? 'ring-2 ring-coral-500' : 'hover:ring-2 hover:ring-ink-200'
                }`}
                title={locked ? `${c.label} (Pro)` : c.label}
              >
                <div className={`h-9 w-14 rounded-md ${c.cls} border border-ink-900/10 ${locked ? 'opacity-50' : ''}`} />
                <div className="text-[11px] text-center mt-1 text-ink-500 inline-flex items-center gap-0.5">
                  {c.label}
                  {locked && <Crown className="w-3 h-3 text-ink-400" />}
                </div>
              </button>
            );
          })}
        </div>
        {looksMutation.isPending && (
          <div className="text-xs text-ink-500 mt-3">Saving your look…</div>
        )}
      </div>

      {/* Badges */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg text-ink-900 mb-1">Badges</h2>
        <p className="text-xs text-ink-500 mb-4">
          Badges show what you've achieved. Locked badges show how to earn more.
        </p>
        <BadgesLegend earned={profile?.badges?.map((b: any) => b.code) || []} />
      </div>

      {/* Teaching skills */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg text-ink-900">Skills I teach</h2>
          <SkillAdder
            onAdd={(id) => addSkill(id, 'TEACH')}
            excludeIds={teaching.map((s: any) => s.skillId)}
            skills={skillsList}
            label="Add"
          />
        </div>
        {teaching.length === 0 ? (
          <EmptyState title="No teaching skills yet" body="Add skills you can teach to start finding matches." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {teaching.map((s: any) => (
              <div key={s.id} className="chip-ink">
                {s.skill?.name}
                <ProficiencyPill level={s.proficiency} />
                <button onClick={() => removeSkill(s.skillId, 'TEACH')} className="ml-2 opacity-60 hover:opacity-100">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wanting skills */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg text-ink-900">Skills I want to learn</h2>
          <SkillAdder
            onAdd={(id) => addSkill(id, 'WANT')}
            excludeIds={wanting.map((s: any) => s.skillId)}
            skills={skillsList}
            label="Add"
          />
        </div>
        {wanting.length === 0 ? (
          <EmptyState title="No learning goals yet" body="Add skills you want to learn to find people who can teach you." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {wanting.map((s: any) => (
              <div key={s.id} className="chip-coral">
                {s.skill?.name}
                <button onClick={() => removeSkill(s.skillId, 'WANT')} className="ml-2 opacity-60 hover:opacity-100">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProficiencyPill({ level }: { level: string }) {
  return (
    <span className="ml-2 text-[10px] uppercase tracking-wide bg-cream-100 text-ink-500 rounded px-1.5 py-0.5">
      {level.toLowerCase()}
    </span>
  );
}

function SkillAdder({
  onAdd,
  excludeIds,
  skills,
  label,
}: {
  onAdd: (id: string) => void;
  excludeIds: string[];
  skills: Skill[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = skills.filter((s) => !excludeIds.includes(s.id) && s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn-outline text-xs px-3 py-1.5">
        <Plus className="w-3 h-3" /> {label}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 card p-3 z-20">
          <input className="input" placeholder="Search skills" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 max-h-48 overflow-y-auto">
            {filtered.slice(0, 30).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onAdd(s.id);
                  setOpen(false);
                  setQ('');
                }}
                className="w-full text-left p-2 text-sm rounded hover:bg-cream-100"
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-ink-500">{s.category}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-xs text-ink-500 p-2">No skills match.</div>}
          </div>
        </div>
      )}
    </div>
  );
}