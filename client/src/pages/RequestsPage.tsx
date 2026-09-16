import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { FrameAvatar, EmptyState, Skeleton } from '../components/ui';
import { Check, X, Ban } from 'lucide-react';
import type { ExchangeRequest } from '../types';

export default function RequestsPage() {
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const qc = useQueryClient();
  const toast = useToast();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['requests', tab],
    queryFn: () => api.get<ExchangeRequest[]>(`/exchange-requests?type=${tab}`),
  });

  const accept = useMutation({
    mutationFn: (id: string) => api.post(`/exchange-requests/${id}/accept`),
    onSuccess: () => {
      toast.push({ type: 'success', title: 'Request accepted!', body: 'Exchange started.' });
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['exchanges'] });
    },
    onError: (e: any) => toast.push({ type: 'error', title: 'Failed to accept', body: e.message }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/exchange-requests/${id}/reject`),
    onSuccess: () => {
      toast.push({ type: 'info', title: 'Request rejected' });
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/exchange-requests/${id}/cancel`),
    onSuccess: () => {
      toast.push({ type: 'info', title: 'Request cancelled' });
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  return (
    <div>
      <h1 className="font-display font-bold text-3xl text-ink-900 mb-2">Exchange requests</h1>
      <div className="flex gap-1 border-b border-ink-100 mb-6">
        {(['received', 'sent'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize -mb-px border-b-2 transition-colors ${
              tab === t ? 'border-coral-500 text-ink-900' : 'border-transparent text-ink-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-32" />}

      {!isLoading && requests.length === 0 && (
        <EmptyState
          title={tab === 'received' ? 'No received requests' : 'No sent requests'}
          body={tab === 'received' ? 'When people want to learn from you, their requests will show up here.' : 'Send a request from the Discover page.'}
        />
      )}

      <div className="space-y-3">
        {requests.map((req) => (
          <RequestCard
            key={req.id}
            request={req}
            perspective={tab}
            onAccept={() => accept.mutate(req.id)}
            onReject={() => reject.mutate(req.id)}
            onCancel={() => cancel.mutate(req.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RequestCard({
  request,
  perspective,
  onAccept,
  onReject,
  onCancel,
}: {
  request: ExchangeRequest;
  perspective: 'received' | 'sent';
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const other = perspective === 'received' ? request.sender : request.receiver;
  const isPending = request.status === 'PENDING';
  const statusColor = {
    PENDING: 'chip-cream',
    ACCEPTED: 'chip-mint',
    REJECTED: 'chip-coral',
    CANCELLED: 'chip-cream',
  }[request.status];

  return (
    <div className="card p-5">
      <div className="flex items-start gap-4">
        <FrameAvatar frame={other?.profile?.avatarFrame || 'default'} src={other?.profile?.avatarUrl} alt={other?.displayName || ''} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-ink-900 truncate">{other?.displayName}</div>
            <span className={statusColor}>{request.status}</span>
          </div>
          <p className="text-sm text-ink-700 mt-1">
            {perspective === 'received' ? (
              <>
                {other?.displayName} wants to learn{' '}
                <span className="chip-coral">{request.requestedSkill?.name}</span> from you.
              </>
            ) : (
              <>
                You requested{' '}
                <span className="chip-coral">{request.requestedSkill?.name}</span> from {other?.displayName}.
              </>
            )}
          </p>
          <p className="text-sm text-ink-700 mt-1">
            {perspective === 'received' ? (
              <>
                They can teach you: <span className="chip-mint">{request.offeredSkill?.name}</span>
              </>
            ) : (
              <>
                You offer: <span className="chip-mint">{request.offeredSkill?.name}</span>
              </>
            )}
          </p>
          <p className="text-sm text-ink-600 mt-2 italic">"{request.message}"</p>

          {isPending && (
            <div className="mt-3 flex gap-2">
              {perspective === 'received' ? (
                <>
                  <button onClick={onAccept} className="btn-coral text-sm">
                    <Check className="w-4 h-4" /> Accept
                  </button>
                  <button onClick={onReject} className="btn-outline text-sm">
                    <X className="w-4 h-4" /> Reject
                  </button>
                </>
              ) : (
                <button onClick={onCancel} className="btn-outline text-sm">
                  <Ban className="w-4 h-4" /> Cancel request
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}