import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { EmptyState, Skeleton } from '../components/ui';
import { Bell, Check } from 'lucide-react';
import type { Notification } from '../types';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications: Notification[]; unreadCount: number }>('/notifications'),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.push({ type: 'info', title: 'All notifications marked read' });
    },
  });

  const notifications = data?.notifications || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display font-bold text-3xl text-ink-900">Notifications</h1>
        {data?.unreadCount ? (
          <button onClick={() => markAll.mutate()} className="btn-outline text-sm">
            <Check className="w-4 h-4" /> Mark all read
          </button>
        ) : null}
      </div>

      {isLoading && <Skeleton className="h-32" />}

      {!isLoading && notifications.length === 0 && (
        <EmptyState
          icon={<Bell className="w-5 h-5" />}
          title="You're all caught up"
          body="We'll let you know when something happens."
        />
      )}

      <div className="space-y-2">
        {notifications.map((n) => {
          const link = linkFor(n);
          const content = (
            <div className={`card p-4 ${!n.isRead ? 'border-l-4 border-l-coral-500' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-ink-900">{n.title}</div>
                  <div className="text-sm text-ink-600">{n.body}</div>
                  <div className="text-xs text-ink-500 mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      markRead.mutate(n.id);
                    }}
                    className="text-xs text-coral-600 font-semibold shrink-0"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          );
          return link ? (
            <Link key={n.id} to={link}>{content}</Link>
          ) : (
            <div key={n.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

function linkFor(n: Notification): string | null {
  if (!n.payload) return null;
  if (n.payload.exchangeId) return `/exchanges/${n.payload.exchangeId}`;
  if (n.payload.requestId) return '/requests';
  return null;
}