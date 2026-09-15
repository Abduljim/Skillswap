import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { Avatar, Skeleton } from '../components/ui';

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, q],
    queryFn: () => api.get<any>(`/admin/users?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/admin/users/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.push({ type: 'success', title: 'User updated' });
    },
  });

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-ink-900 mb-4">Users</h1>
      <input
        className="input mb-4"
        placeholder="Search by name or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {isLoading && <Skeleton className="h-32" />}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">User</th>
              <th className="text-left px-4 py-3 font-semibold">Email</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.users?.map((u: any) => (
              <tr key={u.id} className="border-t border-ink-100">
                <td className="px-4 py-3 font-medium">{u.displayName}</td>
                <td className="px-4 py-3 text-ink-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={u.isActive ? 'chip-mint' : 'chip-coral'}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-600">{u.isAdmin ? 'Admin' : 'Member'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggle.mutate({ id: u.id, isActive: !u.isActive })}
                    className="text-xs text-coral-600 hover:underline"
                  >
                    {u.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.total > 20 && (
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} className="btn-outline" disabled={page === 1}>Previous</button>
          <span className="text-sm text-ink-600">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} className="btn-outline" disabled={page * 20 >= data.total}>Next</button>
        </div>
      )}
    </div>
  );
}