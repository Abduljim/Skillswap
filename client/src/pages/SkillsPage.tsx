import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { EmptyState, Skeleton } from '../components/ui';
import type { Skill } from '../types';
import { Link } from 'react-router-dom';

export default function SkillsPage() {
  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get<Skill[]>('/skills'),
  });

  const grouped = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl text-ink-900">Skills catalogue</h1>
          <p className="text-sm text-ink-600 mt-1">Browse all the skills people are teaching and learning.</p>
        </div>
        <Link to="/profile" className="btn-coral text-sm">Add to my profile</Link>
      </div>

      {isLoading && <Skeleton className="h-32" />}
      {Object.keys(grouped).length === 0 && !isLoading && <EmptyState title="No skills available" />}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="card p-5">
            <h3 className="font-display font-bold text-ink-900 mb-3">{category}</h3>
            <div className="flex flex-wrap gap-1.5">
              {items.map((s) => (
                <span key={s.id} className="chip-cream">{s.name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}