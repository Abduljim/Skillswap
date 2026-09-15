import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Avatar, EmptyState, ProficiencyBadge, Skeleton } from '../components/ui';
import { Plus, Trash2, Save } from 'lucide-react';
import type { Skill, LearningFormat, Weekday, TimeOfDay } from '../types';

const WEEKDAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const TIMES: TimeOfDay[] = ['MORNING', 'AFTERNOON', 'EVENING'];

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api.get<any>('/profile'),
  });
  const { data: skillsList = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<Skill[]>('/skills'),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  const startEdit = () => {
    setForm({
      displayName: user?.displayName || '',
      university: profile?.university || '',
      department: profile?.department || '',
      yearLevel: profile?.yearLevel || '',
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card p-6 md:p-8">
        <div className="flex items-start gap-4">
          <Avatar src={profile?.avatarUrl} alt={user?.displayName || ''} size={80} />
          <div className="flex-1">
            {!editing ? (
              <>
                <h1 className="font-display font-bold text-2xl text-ink-900">{user?.displayName}</h1>
                <p className="text-sm text-ink-600">{profile?.email}</p>
                {profile?.university && <p className="text-sm text-ink-700 mt-1">{profile.university} · {profile.department}</p>}
                {profile?.bio && <p className="text-sm text-ink-700 mt-3">{profile.bio}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="chip-cream">Format: {profile?.learningFormat?.toLowerCase()}</span>
                  {profile?.availabilities?.length > 0 && (
                    <span className="chip-cream">{profile.availabilities.length} availability slots</span>
                  )}
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
                    <label className="label">Avatar URL</label>
                    <input className="input" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} />
                  </div>
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
                  <div>
                    <label className="label">Format</label>
                    <select className="input" value={form.learningFormat} onChange={(e) => setForm({ ...form, learningFormat: e.target.value as LearningFormat })}>
                      <option value="ONLINE">Online</option>
                      <option value="IN_PERSON">In person</option>
                      <option value="EITHER">Either</option>
                    </select>
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
                  <button onClick={() => saveMutation.mutate(form)} className="btn-primary">
                    <Save className="w-4 h-4" /> Save
                  </button>
                  <button onClick={() => setEditing(false)} className="btn-outline">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
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
                {s.skill?.name} · {s.proficiency.toLowerCase()}
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