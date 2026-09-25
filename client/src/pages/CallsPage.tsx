import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useCalls } from '../contexts/CallsContext';
import { EmptyState, Skeleton, FrameAvatar } from '../components/ui';
import { allLogs, deleteLog } from '../lib/call-logs';
import type { CallLog, Conversation } from '../types';
import type { Peer } from '../components/CallOverlay';
import {
  Search,
  Plus,
  Phone,
  Video,
  PhoneCall,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  PhoneMissed,
  PhoneOff,
  X,
  MessageSquare,
  Trash2,
  Check,
  ChevronLeft,
} from 'lucide-react';

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

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h} hr ${m} min`;
  if (m > 0) return `${m} min ${rem} sec`;
  return `${rem} sec`;
}

function toPeer(c: Conversation): Peer {
  return {
    id: c.partner.id,
    displayName: c.partner.displayName,
    avatarUrl: c.partner.profile?.avatarUrl ?? null,
    avatarFrame: c.partner.profile?.avatarFrame ?? null,
  };
}

interface HistoryRow {
  id: string;
  exchangeId: string;
  peer: Peer;
  outgoing: boolean;
  type: CallLog['type'];
  outcome: CallLog['outcome'];
  createdAt: string;
  durationSec: number;
}

// ── New call sheet ───────────────────────────────────────────────────────────
function NewCallSheet({
  open,
  contacts,
  onClose,
  onStart,
  onGroup,
}: {
  open: boolean;
  contacts: Conversation[];
  onClose: () => void;
  onStart: (contact: Conversation, video: boolean) => void;
  onGroup: (video: boolean) => void;
}) {
  const [q, setQ] = useState('');
  if (!open) return null;
  const list = contacts.filter((c) => c.partner.displayName.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex flex-col calls-shell animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-cream-200">
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-700" aria-label="Back">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="font-display font-bold text-lg text-ink-900">New call</h2>
      </div>

      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts"
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-white border border-cream-200 text-sm text-ink-900 outline-none focus:border-coral-400"
          />
        </div>
      </div>

      <div className="px-4 py-3 flex gap-2">
        <button
          onClick={() => onGroup(false)}
          className="flex-1 h-11 rounded-xl bg-white border border-cream-200 text-sm font-medium text-ink-800 flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          <Users className="w-4 h-4 text-coral-500" /> Group voice
        </button>
        <button
          onClick={() => onGroup(true)}
          className="flex-1 h-11 rounded-xl bg-white border border-cream-200 text-sm font-medium text-ink-800 flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          <Users className="w-4 h-4 text-coral-500" /> Group video
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {list.length === 0 && <p className="text-sm text-ink-500 py-8 text-center">No contacts found.</p>}
        {list.map((c) => (
          <div key={c.exchangeId} className="flex items-center gap-3 py-3 border-b border-cream-100 last:border-0">
            <FrameAvatar
              frame={c.partner.profile?.avatarFrame ?? undefined}
              src={c.partner.profile?.avatarUrl ?? undefined}
              alt={c.partner.displayName}
              size={44}
            />
            <span className="flex-1 min-w-0 font-medium text-sm text-ink-900 truncate">{c.partner.displayName}</span>
            <button
              onClick={() => onStart(c, false)}
              className="w-10 h-10 rounded-full bg-cream-100 text-ink-800 flex items-center justify-center active:scale-95"
              aria-label={`Voice call ${c.partner.displayName}`}
            >
              <Phone className="w-4 h-4" />
            </button>
            <button
              onClick={() => onStart(c, true)}
              className="w-10 h-10 rounded-full bg-cream-100 text-ink-800 flex items-center justify-center active:scale-95"
              aria-label={`Video call ${c.partner.displayName}`}
            >
              <Video className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Group participant picker ─────────────────────────────────────────────────
function GroupSheet({
  open,
  video,
  contacts,
  onClose,
  onStart,
}: {
  open: boolean;
  video: boolean;
  contacts: Conversation[];
  onClose: () => void;
  onStart: (members: Conversation[]) => void;
}) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  if (!open) return null;
  const list = contacts.filter((c) => c.partner.displayName.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectedContacts = contacts.filter((c) => selected.includes(c.partner.id));
  return (
    <div className="fixed inset-0 z-50 flex flex-col calls-shell animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-cream-200">
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-700" aria-label="Back">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="font-display font-bold text-lg text-ink-900">
          New {video ? 'video' : 'voice'} group call
        </h2>
      </div>

      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts"
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-white border border-cream-200 text-sm text-ink-900 outline-none focus:border-coral-400"
          />
        </div>
      </div>

      {selectedContacts.length > 0 && (
        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {selectedContacts.map((c) => (
            <button
              key={c.partner.id}
              onClick={() => toggle(c.partner.id)}
              className="h-8 pl-2 pr-3 rounded-full bg-white border border-cream-200 flex items-center gap-1.5 text-xs text-ink-800"
            >
              <FrameAvatar
                frame={c.partner.profile?.avatarFrame ?? undefined}
                src={c.partner.profile?.avatarUrl ?? undefined}
                alt={c.partner.displayName}
                size={20}
              />
              {c.partner.displayName}
              <X className="w-3 h-3 text-ink-400" />
            </button>
          ))}
        </div>
      )}

      <p className="px-4 pt-3 text-xs text-ink-500">
        {selected.length} selected · pick at least 2 people
      </p>

      <div className="flex-1 overflow-y-auto px-4 py-2 pb-28">
        {list.map((c) => {
          const on = selected.includes(c.partner.id);
          return (
            <button
              key={c.exchangeId}
              onClick={() => toggle(c.partner.id)}
              className="w-full flex items-center gap-3 py-3 border-b border-cream-100 last:border-0 text-left"
            >
              <FrameAvatar
                frame={c.partner.profile?.avatarFrame ?? undefined}
                src={c.partner.profile?.avatarUrl ?? undefined}
                alt={c.partner.displayName}
                size={44}
              />
              <span className="flex-1 min-w-0 font-medium text-sm text-ink-900 truncate">
                {c.partner.displayName}
              </span>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  on ? 'bg-[#00a884] text-white' : 'bg-cream-100 text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="absolute bottom-0 inset-x-0 p-4 calls-shell border-t border-cream-200 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          disabled={selected.length < 2}
          onClick={() => onStart(selectedContacts)}
          className="w-full h-12 rounded-xl bg-[#00a884] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]"
        >
          {video ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          Start group call
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CallsPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const calls = useCalls();
  const [q, setQ] = useState('');
  const [nonce, setNonce] = useState(0);
  const [newCall, setNewCall] = useState(false);
  const [groupVideo, setGroupVideo] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<HistoryRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/messages/conversations'),
  });
  const contacts = data || [];
  const byExchange = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const c of contacts) map.set(c.exchangeId, c);
    return map;
  }, [contacts]);

  const rows: HistoryRow[] = useMemo(() => {
    void nonce;
    return allLogs().map(({ exchangeId, log }) => {
      const convo = byExchange.get(exchangeId);
      const outgoing = log.callerId === user?.id;
      const started = log.startedAt ? new Date(log.startedAt).getTime() : 0;
      const ended = log.endedAt ? new Date(log.endedAt).getTime() : started;
      return {
        id: log.id,
        exchangeId,
        peer: convo
          ? toPeer(convo)
          : {
              id: outgoing ? log.calleeId : log.callerId,
              displayName: outgoing ? log.calleeName : log.callerName,
              avatarUrl: null,
              avatarFrame: null,
            },
        outgoing,
        type: log.type,
        outcome: log.outcome,
        createdAt: log.createdAt || log.endedAt || log.startedAt,
        durationSec: started && ended ? Math.max(0, Math.round((ended - started) / 1000)) : 0,
      };
    });
  }, [byExchange, user?.id, nonce]);

  const filtered = rows.filter((r) => r.peer.displayName.toLowerCase().includes(q.toLowerCase()));

  const beginCall = (contact: Conversation, video: boolean) => {
    setNewCall(false);
    setGroupVideo(null);
    void calls.startCall(toPeer(contact), contact.exchangeId, video);
  };

  const beginGroup = (members: Conversation[]) => {
    setNewCall(false);
    setGroupVideo(null);
    void calls.startGroupCall(members.map(toPeer), groupVideo === true);
  };

  const openConversation = (exchangeId: string) => {
    setSheet(null);
    nav(`/messages/${exchangeId}`);
  };

  const removeRow = (row: HistoryRow) => {
    deleteLog(row.exchangeId, row.id);
    setSheet(null);
    setNonce((n) => n + 1);
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-ink-900">Calls</h1>
          <p className="text-sm text-ink-500 mt-1">Recent voice and video calls.</p>
        </div>
        <button
          onClick={() => setNewCall(true)}
          className="h-10 px-3 rounded-full bg-[#00a884] text-white text-sm font-semibold flex items-center gap-1.5 active:scale-95"
        >
          <Plus className="w-4 h-4" /> New call
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search call history"
          className="w-full h-11 pl-9 pr-3 rounded-xl bg-white border border-cream-200 text-sm text-ink-900 outline-none focus:border-coral-400"
        />
      </div>

      {isLoading && <Skeleton className="h-32" />}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<PhoneCall className="w-5 h-5" />}
          title="No calls yet"
          body="Start a voice or video call with someone you are exchanging skills with."
        />
      )}

      <div className="space-y-2">
        {filtered.map((r) => {
          const missed = r.outcome !== 'COMPLETED';
          const Icon = missed
            ? PhoneMissed
            : r.outgoing
              ? ArrowUpRight
              : ArrowDownLeft;
          const iconTone = missed ? 'text-[#ff3b30]' : 'text-[#00a884]';
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSheet(r)}
              className="card w-full p-4 text-left hover:shadow-soft transition-shadow flex items-center gap-3 active:scale-[0.99]"
            >
              <FrameAvatar
                frame={r.peer.avatarFrame ?? undefined}
                src={r.peer.avatarUrl ?? undefined}
                alt={r.peer.displayName}
                size={48}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-semibold text-sm truncate ${missed ? 'text-[#ff3b30]' : 'text-ink-900'}`}>
                    {r.peer.displayName}
                  </span>
                  <span className="text-xs text-ink-500 shrink-0">{timeAgo(r.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-sm text-ink-500">
                  <Icon className={`w-3.5 h-3.5 ${iconTone}`} />
                  {r.type === 'VIDEO' ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                  <span className="truncate">
                    {missed ? 'Missed' : r.outgoing ? 'Outgoing' : 'Incoming'}
                    {r.durationSec > 0 ? ` · ${formatDuration(r.durationSec)}` : ''}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <NewCallSheet
        open={newCall}
        contacts={contacts}
        onClose={() => setNewCall(false)}
        onStart={beginCall}
        onGroup={(v) => {
          setNewCall(false);
          setGroupVideo(v);
        }}
      />

      <GroupSheet
        open={groupVideo !== null}
        video={groupVideo === true}
        contacts={contacts}
        onClose={() => setGroupVideo(null)}
        onStart={beginGroup}
      />

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in" onClick={() => setSheet(null)}>
          <div
            className="w-full max-w-md calls-shell rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-cream-300 mx-auto mb-4" />
            <div className="flex items-center gap-3 mb-4">
              <FrameAvatar
                frame={sheet.peer.avatarFrame ?? undefined}
                src={sheet.peer.avatarUrl ?? undefined}
                alt={sheet.peer.displayName}
                size={48}
              />
              <div className="min-w-0">
                <p className="font-semibold text-ink-900 truncate">{sheet.peer.displayName}</p>
                <p className="text-xs text-ink-500">
                  {sheet.type === 'VIDEO' ? 'Video call' : 'Voice call'} · {timeAgo(sheet.createdAt)}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => {
                  const row = sheet;
                  setSheet(null);
                  void calls.startCall(row.peer, row.exchangeId, false);
                }}
                className="w-full h-12 rounded-xl bg-white border border-cream-200 flex items-center gap-3 px-4 text-sm font-medium text-ink-800 active:scale-[0.99]"
              >
                <Phone className="w-4 h-4 text-[#00a884]" /> Call back
              </button>
              <button
                onClick={() => {
                  const row = sheet;
                  setSheet(null);
                  void calls.startCall(row.peer, row.exchangeId, true);
                }}
                className="w-full h-12 rounded-xl bg-white border border-cream-200 flex items-center gap-3 px-4 text-sm font-medium text-ink-800 active:scale-[0.99]"
              >
                <Video className="w-4 h-4 text-[#00a884]" /> Video call
              </button>
              <button
                onClick={() => openConversation(sheet.exchangeId)}
                className="w-full h-12 rounded-xl bg-white border border-cream-200 flex items-center gap-3 px-4 text-sm font-medium text-ink-800 active:scale-[0.99]"
              >
                <MessageSquare className="w-4 h-4 text-ink-500" /> Message
              </button>
              <button
                onClick={() => removeRow(sheet)}
                className="w-full h-12 rounded-xl bg-white border border-cream-200 flex items-center gap-3 px-4 text-sm font-medium text-[#ff3b30] active:scale-[0.99]"
              >
                <Trash2 className="w-4 h-4" /> Delete from history
              </button>
            </div>
            <button
              onClick={() => setSheet(null)}
              className="w-full h-11 mt-2 rounded-xl text-sm font-medium text-ink-500 flex items-center justify-center gap-2"
            >
              <PhoneOff className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
