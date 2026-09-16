import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { FrameAvatar, EmptyState, Skeleton } from '../components/ui';
import { ArrowLeft, Send, Calendar, CheckCircle2, Star, Phone, Video, Smile } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { createSocket } from '../lib/socket';
import { useCall, CallOverlay } from '../components/CallOverlay';
import type { Exchange, Message, Session } from '../types';

type Tab = 'overview' | 'chat' | 'sessions';

function useExchangeSocket(exchangeId: string, userId: string) {
  const socketRef = useRef<Socket | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let s: Socket;
    let cancelled = false;
    (async () => {
      s = await createSocket();
      if (cancelled) return;
      socketRef.current = s;
      s.on('connect', () => {
        s.emit('exchange:join', exchangeId);
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setReady(false);
    };
  }, [exchangeId, userId]);

  return { socket: socketRef.current, ready };
}

export default function ExchangeWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const toast = useToast();

  const { data: exchange, isLoading } = useQuery({
    queryKey: ['exchange', id],
    queryFn: () => api.get<any>(`/exchanges/${id}`),
    enabled: !!id,
  });

  const [tab, setTab] = useState<Tab>(
    (loc.state as { defaultTab?: Tab } | null)?.defaultTab ?? 'overview'
  );

  if (isLoading) return <Skeleton className="h-64" />;
  if (!exchange) return <EmptyState title="Exchange not found" />;

  const partner = exchange.userA.id === user?.id ? exchange.userB : exchange.userA;
  const mySkills = exchange.userA.id === user?.id
    ? { teaching: exchange.skillA, learning: exchange.skillB }
    : { teaching: exchange.skillB, learning: exchange.skillA };

  return (
    <div className="space-y-4">
      <button onClick={() => nav('/exchanges')} className="btn-ghost text-sm -ml-2">
        <ArrowLeft className="w-4 h-4" /> All exchanges
      </button>

      <div className="card p-5 md:p-6 bg-gradient-to-br from-ink-900 to-ink-800 text-cream-50">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3">
            <FrameAvatar frame={exchange.userA.profile?.avatarFrame || 'default'} src={exchange.userA.profile?.avatarUrl} alt={exchange.userA.displayName} size={48} className="border-2 border-ink-900" />
            <FrameAvatar frame={exchange.userB.profile?.avatarFrame || 'default'} src={exchange.userB.profile?.avatarUrl} alt={exchange.userB.displayName} size={48} className="border-2 border-ink-900" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wide text-cream-300 font-semibold">Exchange with</div>
            <h1 className="font-display font-bold text-2xl">{partner.displayName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`chip ${
              exchange.status === 'ACTIVE' ? 'bg-mint-500/30 text-mint-200' :
              exchange.status === 'COMPLETED' ? 'bg-cream-500/30 text-cream-200' :
              'bg-coral-500/30 text-coral-200'
            }`}>{exchange.status}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <div className="bg-ink-800 rounded-xl p-3 border border-ink-700 flex-1 min-w-[200px]">
            <div className="text-xs uppercase text-coral-300 font-semibold mb-1">You teach</div>
            <div className="font-semibold">{mySkills.teaching?.name}</div>
          </div>
          <div className="bg-ink-800 rounded-xl p-3 border border-ink-700 flex-1 min-w-[200px]">
            <div className="text-xs uppercase text-mint-300 font-semibold mb-1">You learn</div>
            <div className="font-semibold">{mySkills.learning?.name}</div>
          </div>
        </div>
      </div>

      {exchange.status === 'ACTIVE' && id && (
        <WorkspaceWithCall exchangeId={id} partner={partner} tab={tab} setTab={setTab} exchange={exchange} />
      )}
      {exchange.status !== 'ACTIVE' && (
        <div>
          <TabBar tab={tab} setTab={setTab} />
          {tab === 'overview' && <OverviewTab exchange={exchange} />}
          {tab === 'sessions' && id && <SessionsTab exchangeId={id} user={user!} status={exchange.status} />}
        </div>
      )}
    </div>
  );
}

function WorkspaceWithCall({
  exchangeId,
  partner,
  tab,
  setTab,
  exchange,
}: {
  exchangeId: string;
  partner: any;
  tab: Tab;
  setTab: (t: Tab) => void;
  exchange: any;
}) {
  const { user } = useAuth();
  const { socket, ready } = useExchangeSocket(exchangeId, user!.id);
  const call = useCall(socket, exchangeId, {
    id: user!.id,
    displayName: user!.displayName,
    avatarUrl: (user as any)?.profile?.avatarUrl ?? null,
    avatarFrame: (user as any)?.profile?.avatarFrame ?? null,
  }, {
    id: partner.id,
    displayName: partner.displayName,
    avatarUrl: partner.profile?.avatarUrl ?? null,
    avatarFrame: partner.profile?.avatarFrame ?? null,
  });

  const startCall = (video: boolean) => {
    if (!socket) return;
    call.startCall(video).catch(() => {});
  };

  return (
    <>
      {/* Call buttons */}
      <div className="flex justify-end gap-2 -mt-2">
        {exchange.status === 'ACTIVE' && (
          <>
            <button onClick={() => startCall(false)} disabled={!ready} className="btn-outline text-xs px-3 py-2 disabled:opacity-40">
              <Phone className="w-4 h-4" /> Voice call
            </button>
            <button onClick={() => startCall(true)} disabled={!ready} className="btn-outline text-xs px-3 py-2 disabled:opacity-40">
              <Video className="w-4 h-4" /> Video call
            </button>
          </>
        )}
      </div>

      <TabBar tab={tab} setTab={setTab} />
      {tab === 'overview' && <OverviewTab exchange={exchange} />}
      {tab === 'chat' && <ChatTab exchangeId={exchangeId} user={user!} socket={socket} />}
      {tab === 'sessions' && <SessionsTab exchangeId={exchangeId} user={user!} status={exchange.status} />}

      <CallOverlay
        call={call.state}
        partner={call.state.peer}
        onAccept={call.acceptCall}
        onDecline={call.declineCall}
        onHangup={call.hangup}
        onToggleMic={call.toggleMic}
        onToggleCamera={call.toggleCamera}
        micMuted={call.micMuted}
        localVideoRef={call.localVideoRef}
        remoteVideoRef={call.remoteVideoRef}
      />
    </>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 border-b border-ink-100">
      {(['overview', 'chat', 'sessions'] as Tab[]).map((t) => (
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
  );
}

function OverviewTab({ exchange }: { exchange: any }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const completeMutation = useMutation({
    mutationFn: () => api.post(`/exchanges/${exchange.id}/complete`),
    onSuccess: () => {
      toast.push({ type: 'success', title: 'Completion submitted' });
      qc.invalidateQueries({ queryKey: ['exchange', exchange.id] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/exchanges/${exchange.id}/cancel`),
    onSuccess: () => {
      toast.push({ type: 'info', title: 'Exchange cancelled' });
      qc.invalidateQueries({ queryKey: ['exchange', exchange.id] });
    },
  });

  const iConfirmed = exchange.completions?.includes(user?.id);
  const bothConfirmed = exchange.completions?.length === 2;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-display font-bold text-ink-900 mb-2">Participants</h3>
          {[exchange.userA, exchange.userB].map((u: any) => (
            <div key={u.id} className="flex items-center gap-3 py-2 border-b border-ink-100 last:border-0">
              <FrameAvatar frame={u.profile?.avatarFrame || 'default'} src={u.profile?.avatarUrl} alt={u.displayName} size={36} />
              <div>
                <div className="font-semibold text-sm">{u.displayName}</div>
                <div className="text-xs text-ink-500">{u.profile?.university}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="card p-5">
          <h3 className="font-display font-bold text-ink-900 mb-2">Skills</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{exchange.userA.displayName} teaches</span>
              <span className="chip-mint">{exchange.skillA?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{exchange.userB.displayName} teaches</span>
              <span className="chip-mint">{exchange.skillB?.name}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-display font-bold text-ink-900 mb-2">Completion</h3>
        {exchange.status === 'ACTIVE' && (
          <div>
            <p className="text-sm text-ink-700 mb-3">
              When both of you mark this exchange as complete, it will close and you can leave reviews.
            </p>
            {iConfirmed ? (
              <div className="chip-mint">You've confirmed completion. Waiting for your partner.</div>
            ) : (
              <button onClick={() => completeMutation.mutate()} className="btn-coral">
                <CheckCircle2 className="w-4 h-4" /> Mark exchange as complete
              </button>
            )}
            <button onClick={() => cancelMutation.mutate()} className="btn-ghost text-coral-600 ml-2">
              Cancel exchange
            </button>
          </div>
        )}
        {exchange.status === 'COMPLETED' && (
          <div>
            <div className="chip-mint mb-3">Exchange completed</div>
            <Link to={`/profile/${exchange.userA.id === user?.id ? exchange.userB.id : exchange.userA.id}`} className="btn-coral">
              <Star className="w-4 h-4" /> Leave a review
            </Link>
          </div>
        )}
        {exchange.status === 'CANCELLED' && (
          <div className="chip-coral">This exchange was cancelled.</div>
        )}
      </div>
    </div>
  );
}

function ChatTab({
  exchangeId,
  user,
  socket: controlledSocket,
}: {
  exchangeId: string;
  user: any;
  socket?: Socket | null;
}) {
  const { data: messages = [], refetch } = useQuery({
    queryKey: ['messages', exchangeId],
    queryFn: () => api.get<Message[]>(`/exchanges/${exchangeId}/messages`),
  });
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(controlledSocket ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!controlledSocket) return;
    socketRef.current = controlledSocket;
    const onMsg = () => refetch();
    const onTyping = (data: { userId: string }) => {
      if (data.userId !== user.id) setTyping(true);
      setTimeout(() => setTyping(false), 2000);
    };
    controlledSocket.on('message:new', onMsg);
    controlledSocket.on('typing', onTyping);
    return () => {
      controlledSocket.off('message:new', onMsg);
      controlledSocket.off('typing', onTyping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledSocket, exchangeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = async (body: string, type: string = 'TEXT') => {
    if (!body.trim()) return;
    try {
      await api.post(`/exchanges/${exchangeId}/messages`, { body, type });
      setText('');
      refetch();
    } catch (e) {
      if (e instanceof ApiError) console.error(e.message);
    }
  };

  const sendImage = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      return; // silently cap at 2MB
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      await sendMessage(dataUrl, 'IMAGE');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="card p-4 md:p-5 flex flex-col h-[60vh]">
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-8">No messages yet. Say hello.</div>
        )}
        {messages.map((m) => {
          const mine = m.senderId === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  mine ? 'bg-ink-900 text-cream-50' : 'bg-cream-100 text-ink-900'
                }`}
              >
                {m.type === 'IMAGE' ? (
                  <img src={m.body} alt="Shared image" className="rounded-xl max-w-[260px] max-h-64 object-cover" />
                ) : m.type === 'STICKER' ? (
                  <div className="text-5xl leading-none py-1">{m.body}</div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                )}
                <div className={`text-[10px] mt-1 ${mine ? 'text-cream-300' : 'text-ink-500'}`}>
                  {m.type === 'IMAGE' && '📷 '}
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        {typing && <div className="text-xs text-ink-500 italic px-2">typing…</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2 pt-3 border-t border-ink-100 items-end">
        <div className="relative flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              const input = textInputRef.current;
              if (!input) return;
              input.focus({ preventScroll: true });
              input.scrollIntoView({ block: 'nearest' });
              // Nudge the WebView so the soft keyboard mounts after focus.
              window.setTimeout(() => input.focus({ preventScroll: true }), 60);
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-cream-100 active:scale-90"
            title="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-cream-100 active:scale-90"
            title="Send image"
          >
            📷
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) sendImage(f);
            }}
          />
        </div>
        <input
          ref={textInputRef}
          className="input flex-1"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            socketRef.current?.emit('typing', { exchangeId });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(text);
            }
          }}
        />
        <button onClick={() => sendMessage(text)} className="btn-coral shrink-0">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function SessionsTab({ exchangeId, status }: { exchangeId: string; user: any; status: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', exchangeId],
    queryFn: () => api.get<Session[]>(`/exchanges/${exchangeId}/sessions`),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    scheduledAt: '',
    durationMinutes: '60',
    format: 'ONLINE' as 'ONLINE' | 'IN_PERSON',
    meetingLink: '',
    location: '',
    notes: '',
  });

  const createSession = useMutation({
    mutationFn: () =>
      api.post(`/exchanges/${exchangeId}/sessions`, {
        ...form,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: parseInt(form.durationMinutes),
      }),
    onSuccess: () => {
      toast.push({ type: 'success', title: 'Session scheduled' });
      qc.invalidateQueries({ queryKey: ['sessions', exchangeId] });
      setShowForm(false);
      setForm({ title: '', scheduledAt: '', durationMinutes: '60', format: 'ONLINE', meetingLink: '', location: '', notes: '' });
    },
  });

  const completeSession = useMutation({
    mutationFn: (id: string) => api.post(`/sessions/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', exchangeId] });
    },
  });

  const deleteSession = useMutation({
    mutationFn: (id: string) => api.delete(`/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', exchangeId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg text-ink-900">Sessions</h2>
        {status === 'ACTIVE' && (
          <button onClick={() => setShowForm((s) => !s)} className="btn-coral text-sm">
            <Calendar className="w-4 h-4" /> Schedule session
          </button>
        )}
      </div>

      {showForm && (
        <div className="card p-5 space-y-3 animate-slide-up">
          <div>
            <label className="label">Title</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Python Session #1" />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Date & time</label>
              <input type="datetime-local" className="input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            </div>
            <div>
              <label className="label">Duration (min)</label>
              <input type="number" className="input" min={15} max={480} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
            </div>
            <div>
              <label className="label">Format</label>
              <select className="input" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as any })}>
                <option value="ONLINE">Online</option>
                <option value="IN_PERSON">In person</option>
              </select>
            </div>
          </div>
          {form.format === 'ONLINE' ? (
            <div>
              <label className="label">Meeting link</label>
              <input className="input" value={form.meetingLink} onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} placeholder="https://meet.google.com/…" />
            </div>
          ) : (
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Library, Room 204" />
            </div>
          )}
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createSession.mutate()}
              disabled={createSession.isPending || !form.title || !form.scheduledAt}
              className="btn-primary"
            >
              Save session
            </button>
            <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <Skeleton className="h-32" />}
      {sessions.length === 0 && !isLoading && (
        <EmptyState title="No sessions yet" body="Schedule a session to coordinate your next meeting." />
      )}

      <div className="space-y-3">
        {sessions.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-ink-900">{s.title}</h3>
                  <span className={`chip ${
                    s.status === 'SCHEDULED' ? 'chip-cream' :
                    s.status === 'COMPLETED' ? 'chip-mint' :
                    'chip-coral'
                  }`}>{s.status}</span>
                </div>
                <div className="text-sm text-ink-600 mt-1">
                  {new Date(s.scheduledAt).toLocaleString()} · {s.durationMinutes} min · {s.format.toLowerCase()}
                </div>
                {s.meetingLink && <a href={s.meetingLink} target="_blank" rel="noreferrer" className="text-xs text-coral-600 hover:underline block mt-1">Join meeting</a>}
                {s.location && <div className="text-xs text-ink-600 mt-1">📍 {s.location}</div>}
                {s.notes && <div className="text-xs text-ink-600 mt-1 italic">{s.notes}</div>}
              </div>
              {s.status === 'SCHEDULED' && (
                <div className="flex gap-1">
                  <button onClick={() => completeSession.mutate(s.id)} className="text-xs btn-outline px-2 py-1">
                    <CheckCircle2 className="w-3 h-3" />
                  </button>
                  <button onClick={() => deleteSession.mutate(s.id)} className="text-xs btn-ghost text-coral-600 px-2 py-1">
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}