import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { Skeleton } from '../components/ui';
import { Plus } from 'lucide-react';

export default function AdminSkillsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['admin-skills'],
    queryFn: () => api.get<any[]>('/admin/skills'),
  });

  const [form, setForm] = useState({ name: '', category: '', description: '' });

  const create = useMutation({
    mutationFn: () => api.post('/skills', form),
    onSuccess: () => {
      toast.push({ type: 'success', title: 'Skill created' });
      qc.invalidateQueries({ queryKey: ['admin-skills'] });
      setForm({ name: '', category: '', description: '' });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/skills/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-skills'] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display font-bold text-3xl text-ink-900">Skills</h1>

      <div className="card p-5">
        <h2 className="font-display font-bold text-lg mb-3">Create skill</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input className="input" placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <button
          onClick={() => create.mutate()}
          disabled={!form.name || !form.category || create.isPending}
          className="btn-coral mt-3"
        >
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      {isLoading && <Skeleton className="h-32" />}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Category</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s: any) => (
              <tr key={s.id} className="border-t border-ink-100">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-ink-600">{s.category}</td>
                <td className="px-4 py-3">
                  <span className={s.isActive ? 'chip-mint' : 'chip-coral'}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}
                    className="text-xs text-coral-600 hover:underline"
                  >
                    {s.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}