import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { Check, ChevronRight, SkipForward } from 'lucide-react';
import clsx from 'clsx';
import type { Skill, LearningFormat, Weekday, TimeOfDay } from '../types';

const STEPS = [
  'Introduce yourself',
  'What can you teach?',
  'What do you want to learn?',
  'How do you want to learn?',
  'When are you available?',
  'Your matches',
];

const WEEKDAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const TIMES: TimeOfDay[] = ['MORNING', 'AFTERNOON', 'EVENING'];

export default function OnboardingPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);

  const [profile, setProfile] = useState({
    university: '',
    department: '',
    yearLevel: '',
    bio: '',
    learningFormat: 'EITHER' as LearningFormat,
    availabilities: [] as { weekday: Weekday; timeOfDay: TimeOfDay }[],
  });
  const [teachSkills, setTeachSkills] = useState<{ id: string; name: string }[]>([]);
  const [wantSkills, setWantSkills] = useState<{ id: string; name: string }[]>([]);

  const { data: skills = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<Skill[]>('/skills'),
  });

  const profileMutation = useMutation({
    mutationFn: (input: any) => api.put('/profile', input),
  });

  const addSkillMutation = useMutation({
    mutationFn: (input: { skillId: string; type: 'TEACH' | 'WANT' }) =>
      api.post(`/skills/${input.skillId}/add`, { ...input, proficiency: 'INTERMEDIATE' }),
  });

  const skip = async () => {
    setStep((s) => s + 1);
  };

  const next = async () => {
    try {
      if (step === 0) {
        await api.put('/profile', profile);
      } else if (step === 1) {
        for (const s of teachSkills) {
          await addSkillMutation.mutateAsync({ skillId: s.id, type: 'TEACH' });
        }
      } else if (step === 2) {
        for (const s of wantSkills) {
          await addSkillMutation.mutateAsync({ skillId: s.id, type: 'WANT' });
        }
      } else if (step === 3) {
        await api.put('/profile', { learningFormat: profile.learningFormat });
      } else if (step === 4) {
        await api.put('/profile', { availabilities: profile.availabilities });
      } else if (step === 5) {
        nav('/dashboard');
        return;
      }
      setStep((s) => s + 1);
    } catch (err) {
      if (err instanceof ApiError) toast.push({ type: 'error', title: 'Could not save', body: err.message });
    }
  };

  const filteredSkills = (q: string) => skills.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={clsx(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                i < step
                  ? 'bg-mint-500 text-white'
                  : i === step
                  ? 'bg-ink-900 text-cream-50'
                  : 'bg-ink-100 text-ink-500'
              )}
            >
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={clsx('text-xs whitespace-nowrap', i === step ? 'text-ink-900 font-semibold' : 'text-ink-500')}>
              {label}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-ink-300" />}
          </div>
        ))}
      </div>

      <div className="card p-6 md:p-8">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-display font-bold text-2xl text-ink-900">Introduce yourself</h2>
            <p className="text-sm text-ink-600">A few quick details to help people get to know you.</p>
            <div>
              <label className="label">University</label>
              <input
                className="input"
                value={profile.university}
                onChange={(e) => setProfile({ ...profile, university: e.target.value })}
                placeholder="e.g. University of Lagos"
              />
            </div>
            <div>
              <label className="label">Department</label>
              <input
                className="input"
                value={profile.department}
                onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                placeholder="e.g. Computer Science"
              />
            </div>
            <div>
              <label className="label">Year</label>
              <input
                className="input"
                value={profile.yearLevel}
                onChange={(e) => setProfile({ ...profile, yearLevel: e.target.value })}
                placeholder="e.g. 3rd Year"
              />
            </div>
            <div>
              <label className="label">Short bio (optional)</label>
              <textarea
                className="input min-h-[100px]"
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="A sentence or two about you"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <SkillPicker
            title="What can you teach?"
            subtitle="Pick skills you're confident in. You can edit these later."
            selected={teachSkills}
            onChange={setTeachSkills}
            skills={skills}
            filterFn={(q) => filteredSkills(q)}
          />
        )}

        {step === 2 && (
          <SkillPicker
            title="What do you want to learn?"
            subtitle="Skills you'd like to pick up."
            selected={wantSkills}
            onChange={setWantSkills}
            skills={skills}
            filterFn={(q) => filteredSkills(q)}
          />
        )}

        {step === 3 && (
          <div>
            <h2 className="font-display font-bold text-2xl text-ink-900">How do you want to learn?</h2>
            <p className="text-sm text-ink-600 mt-1">Pick what works best for you.</p>
            <div className="mt-6 grid gap-3">
              {(['ONLINE', 'IN_PERSON', 'EITHER'] as LearningFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setProfile({ ...profile, learningFormat: f })}
                  className={clsx(
                    'card p-5 text-left flex items-center gap-3 transition-all',
                    profile.learningFormat === f && 'ring-2 ring-ink-900'
                  )}
                >
                  <div
                    className={clsx(
                      'w-5 h-5 rounded-full border-2',
                      profile.learningFormat === f ? 'bg-ink-900 border-ink-900' : 'border-ink-300'
                    )}
                  />
                  <div>
                    <div className="font-semibold text-ink-900">
                      {f === 'ONLINE' ? 'Online' : f === 'IN_PERSON' ? 'In person' : 'Either works'}
                    </div>
                    <div className="text-xs text-ink-600">
                      {f === 'ONLINE'
                        ? 'Video calls and screensharing'
                        : f === 'IN_PERSON'
                        ? 'Meet on campus or locally'
                        : 'Open to both formats'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="font-display font-bold text-2xl text-ink-900">When are you available?</h2>
            <p className="text-sm text-ink-600 mt-1">Select all the slots that work.</p>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-xs uppercase text-ink-500 py-2"></th>
                    {TIMES.map((t) => (
                      <th key={t} className="text-center text-xs uppercase text-ink-500 py-2 px-2">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map((d) => (
                    <tr key={d}>
                      <td className="text-xs uppercase text-ink-500 py-2">{d.slice(0, 3)}</td>
                      {TIMES.map((t) => {
                        const active = profile.availabilities.some((a) => a.weekday === d && a.timeOfDay === t);
                        return (
                          <td key={t} className="py-1 px-1 text-center">
                            <button
                              onClick={() => {
                                if (active) {
                                  setProfile({
                                    ...profile,
                                    availabilities: profile.availabilities.filter(
                                      (a) => !(a.weekday === d && a.timeOfDay === t)
                                    ),
                                  });
                                } else {
                                  setProfile({
                                    ...profile,
                                    availabilities: [...profile.availabilities, { weekday: d, timeOfDay: t }],
                                  });
                                }
                              }}
                              className={clsx(
                                'w-full h-9 rounded-lg text-xs font-medium transition-colors',
                                active ? 'bg-ink-900 text-cream-50' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'
                              )}
                            >
                              {active ? <Check className="w-3.5 h-3.5 mx-auto" /> : '—'}
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
        )}

        {step === 5 && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-mint-100 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-mint-600" />
            </div>
            <h2 className="font-display font-bold text-2xl text-ink-900">You're all set!</h2>
            <p className="text-sm text-ink-600 mt-2">
              SkillSwap has calculated your first matches. Let's see who you can exchange with.
            </p>
            <button onClick={next} className="btn-coral mt-6 px-6 py-3">
              See my matches
            </button>
          </div>
        )}

        {step < 5 && (
          <div className="mt-8 flex items-center justify-between">
            <button onClick={skip} className="btn-ghost text-sm">
              <SkipForward className="w-4 h-4" /> Skip
            </button>
            <button onClick={next} className="btn-primary">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SkillPicker({
  title,
  subtitle,
  selected,
  onChange,
  skills,
  filterFn,
}: {
  title: string;
  subtitle: string;
  selected: { id: string; name: string }[];
  onChange: (s: { id: string; name: string }[]) => void;
  skills: Skill[];
  filterFn: (q: string) => Skill[];
}) {
  const [q, setQ] = useState('');
  const filtered = filterFn(q);
  return (
    <div>
      <h2 className="font-display font-bold text-2xl text-ink-900">{title}</h2>
      <p className="text-sm text-ink-600 mt-1">{subtitle}</p>

      {selected.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {selected.map((s) => (
            <button
              key={s.id}
              onClick={() => onChange(selected.filter((x) => x.id !== s.id))}
              className="chip-ink"
            >
              {s.name} <span className="ml-1 opacity-60">×</span>
            </button>
          ))}
        </div>
      )}

      <input
        className="input mt-4"
        placeholder="Search skills…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="mt-3 max-h-72 overflow-y-auto space-y-1">
        {filtered.map((s) => {
          const isSelected = selected.some((x) => x.id === s.id);
          return (
            <button
              key={s.id}
              onClick={() => {
                if (isSelected) onChange(selected.filter((x) => x.id !== s.id));
                else onChange([...selected, { id: s.id, name: s.name }]);
              }}
              className={clsx(
                'w-full text-left p-3 rounded-xl transition-colors flex items-center justify-between',
                isSelected ? 'bg-ink-900 text-cream-50' : 'hover:bg-cream-100'
              )}
            >
              <div>
                <div className="font-medium">{s.name}</div>
                <div className={clsx('text-xs', isSelected ? 'text-cream-300' : 'text-ink-500')}>{s.category}</div>
              </div>
              {isSelected && <Check className="w-4 h-4" />}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-8">No skills match "{q}"</div>
        )}
      </div>
    </div>
  );
}