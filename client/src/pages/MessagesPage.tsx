import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { EmptyState, Skeleton, FrameAvatar } from '../components/ui';
import { MessageSquare } from 'lucide-react';
import type { Conversation } from '../types';

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function preview(m: Conversation['lastMessage']): string {
  if (!m) return 'Say hi to start the conversation';
  if (m.type === 'IMAGE') return 'Sent an image';
  if (m.type === 'STICKER') return 'Sent a sticker';
  return m.body;
}

export default function MessagesPage() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/messages/conversations'),
  });

  const conversations = data || [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display font-bold text-3xl text-ink-900">Messages</h1>
        <p className="text-sm text-ink-500 mt-1">Everyone you are exchanging skills with.</p>
      </div>

      {isLoading && <Skeleton className="h-32" />}

      {!isLoading && conversations.length === 0 && (
        <EmptyState
          icon={<MessageSquare className="w-5 h-5" />}
          title="No conversations yet"
          body="Ask on Discover or send an exchange request to start chatting with a match."
        />
      )}

      <div className="space-y-2">
        {conversations.map((c) => {
          const unread = c.unreadCount > 0;
          return (
            <button
              key={c.exchangeId}
              type="button"
              onClick={() => nav(`/messages/${c.exchangeId}`)}
              className="card w-full p-4 text-left hover:shadow-soft transition-shadow flex items-center gap-3 active:scale-[0.99]"
            >
              <FrameAvatar
                frame={c.partner.profile?.avatarFrame ?? undefined}
                src={c.partner.profile?.avatarUrl ?? undefined}
                alt={c.partner.displayName}
                size={48}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-semibold text-sm truncate ${
                      unread ? 'text-ink-900' : 'text-ink-800'
                    }`}
                  >
                    {c.partner.displayName}
                  </span>
                  <span className="text-xs text-ink-500 shrink-0">{timeAgo(c.updatedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span
                    className={`text-sm truncate ${
                      unread ? 'text-ink-800 font-medium' : 'text-ink-500'
                    }`}
                  >
                    {preview(c.lastMessage)}
                  </span>
                  {unread && (
                    <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-coral-500 text-white text-[11px] font-bold flex items-center justify-center">
                      {c.unreadCount > 9 ? '9+' : c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}