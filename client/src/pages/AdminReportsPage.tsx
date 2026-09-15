import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { Skeleton } from '../components/ui';

export default function AdminReportsPage() {
  const [status, setStatus] = useState('OPEN');
  const qc = useQueryClient();
  const toast = useToast();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['admin-reports', status],
    queryFn: () => api.get<any[]>(`/admin/reports?status=${status}`),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/admin/reports/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      toast.push({ type: 'success', title: 'Report updated' });
    },
  });

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-ink-900 mb-4">Reports</h1>
      <div className="flex gap-2 mb-4">
        {['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`btn-outline text-xs ${status === s ? 'bg-ink-900 text-cream-50' : ''}`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-32" />}

      <div className="space-y-3">
        {reports.map((r: any) => (
          <div key={r.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-ink-700">
                  <strong>{r.reporter.displayName}</strong> reported <strong>{r.reportedUser.displayName}</strong>
                </div>
                <div className="text-xs text-ink-500 mt-1">Reason: {r.reason}</div>
                <p className="text-sm text-ink-700 mt-2">{r.description}</p>
              </div>
              <span className="chip-cream shrink-0">{r.status}</span>
            </div>
            {r.status === 'OPEN' && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => update.mutate({ id: r.id, status: 'REVIEWING' })} className="btn-outline text-xs">Mark reviewing</button>
                <button onClick={() => update.mutate({ id: r.id, status: 'RESOLVED' })} className="btn-coral text-xs">Resolve</button>
                <button onClick={() => update.mutate({ id: r.id, status: 'DISMISSED' })} className="btn-ghost text-xs">Dismiss</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}