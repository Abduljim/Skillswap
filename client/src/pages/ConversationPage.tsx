import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { FrameAvatar, EmptyState, Skeleton } from '../components/ui';
import ChatTab from '../components/ChatTab';
import { useCall, CallOverlay } from '../components/CallOverlay';
import { ArrowLeft, Phone, Video, PhoneCall, History, Plus } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { createSocket } from '../lib/socket';
import type { CallLog, Exchange } from '../types';

type Tab = 'chat' | 'voice' | 'video' | 'calls';

function useExchangeSocket(exchangeId: string) {
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
  }, [exchangeId]);

  return { socket: socketRef.current, ready };
}

const LOCAL_LOGS_KEY = (exchangeId: string) => `skillswap_call_logs_${exchangeId}`;

function readLocalLogs(exchangeId: string): CallLog[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_LOGS_KEY(exchangeId)) || '[]') as CallLog[];
  } catch {
    return [];
  }
}

function writeLocalLogs(exchangeId: string, logs: CallLog[]) {
  try {
    localStorage.setItem(LOCAL_LOGS_KEY(exchangeId), JSON.stringify(logs.slice(0, 100)));
  } catch {}
}

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('chat');

  const { data: exchange, isLoading } = useQuery({
    queryKey: ['exchange', id],
    queryFn: () => api.get<any>(`/exchanges/${id}`),
    enabled: !!id,
  });

  const { socket, ready } = useExchangeSocket(id!);

  if (isLoading) return <Skeleton className="h-64" />;
  if (!exchange || !id) return <EmptyState title="Conversation not found" />;

  const partner = exchange.userA.id === user?.id ? exchange.userB : exchange.userA;
  const me = {
    id: user!.id,
    displayName: user?.displayName || 'You',
    avatarUrl: (user as any)?.profile?.avatarUrl ?? null,
    avatarFrame: (user as any)?.profile?.avatarFrame ?? null,
  };
  const peer = {
    id: partner.id,
    displayName: partner.displayName,
    avatarUrl: partner.profile?.avatarUrl ?? null,
    avatarFrame: partner.profile?.avatarFrame ?? null,
  };

  return <ConversationContent id={id} exchange={exchange} socket={socket} ready={ready} me={me} peer={peer} tab={tab} setTab={setTab} onBack={() => nav('/messages')} />;
}

function ConversationContent({
  id,
  exchange,
  socket,
  ready,
  me,
  peer,
  tab,
  setTab,
  onBack,
}: {
  id: string;
  exchange: Exchange | any;
  socket: Socket | null;
  ready: boolean;
  me: any;
  peer: any;
  tab: Tab;
  setTab: (t: Tab) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const call = useCall(socket, id, me, peer);

  const startCall = (video: boolean) => {
    if (!socket) return;
    call.startCall(video).catch(() => {});
  };

  // ── Local call-log mirror (works even before the DB schema syncs) ──
  const callStartRef = useRef<string | null>(null);
  const callVideoRef = useRef<boolean>(false);
  const callSeenRef = useRef<boolean>(false);

  useEffect(() => {
    const status = call.state.status;
    if (status === 'outgoing' || status === 'incoming') {
      callSeenRef.current = true;
      callVideoRef.current = call.state.video;
    }
    if (status === 'active' && !callStartRef.current) callStartRef.current = new Date().toISOString();
    if (status === 'none' && callSeenRef.current) {
      const started = callStartRef.current ?? new Date().toISOString();
      const outcome: CallLog['outcome'] = callStartRef.current ? 'COMPLETED' : 'DECLINED';
      callSeenRef.current = false;
      callStartRef.current = null;
      const nowIso = new Date().toISOString();
      const entry: CallLog = {
        id: `local-${Date.now()}`,
        exchangeId: id,
        callerId: me.id,
        calleeId: peer.id,
        callerName: me.displayName,
        calleeName: peer.displayName,
        type: callVideoRef.current ? 'VIDEO' : 'VOICE',
        outcome,
        startedAt: started,
        endedAt: nowIso,
        createdAt: nowIso,
      };
      writeLocalLogs(id, [entry, ...readLocalLogs(id)]);
    }
  }, [call.state.status, call.state.video, id, me.id, me.displayName, peer.id, peer.displayName]);

  const { data: serverLogs, isError } = useQuery({
    queryKey: ['calls', id],
    queryFn: () => api.get<CallLog[]>(`/exchanges/${id}/calls`),
    enabled: !!id,
  });

  const logs = !isError && serverLogs && serverLogs.length > 0 ? serverLogs : readLocalLogs(id);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'chat', label: 'Chat', icon: History },
    { id: 'voice', label: 'Voice call', icon: Phone },
    { id: 'video', label: 'Video', icon: Video },
    { id: 'calls', label: 'Call logs', icon: History },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-ghost text-sm -ml-2">
          <ArrowLeft className="w-4 h-4" /> All messages
        </button>
        <FrameAvatar frame={peer.avatarFrame || 'default'} src={peer.avatarUrl} alt={partnerName(peer)} size={44} />
        <div className="min-w-0">
          <div className="font-display font-bold text-lg text-ink-900 leading-tight">{partnerName(peer)}</div>
          <div className="text-xs text-ink-500">
            {exchange.status === 'ACTIVE'
              ? ready
                ? 'Online · tap a call tab to start'
                : 'Connecting…'
              : 'Exchange not active'}
          </div>
        </div>
        {exchange.status === 'ACTIVE' && (
          <Link to={`/exchanges/${id}`} className="btn-outline text-xs px-3 py-1.5 ml-auto">
            <Plus className="w-3.5 h-3.5" /> Exchange
          </Link>
        )}
      </div>

      <div className="flex gap-1 border-b border-ink-100 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold -mb-px border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? 'border-coral-500 text-ink-900' : 'border-transparent text-ink-500'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="h-[calc(100dvh-17rem)] md:h-[calc(100dvh-14rem)] min-h-[320px]">
        {tab === 'chat' && <ChatTab exchangeId={id} socket={socket} />}
        {tab === 'voice' && (
          <CallPrompt
            icon={<Phone className="w-8 h-8" />}
            title="Voice call"
            body="Call your match to talk through a skill exchange."
            ready={ready}
            video={false}
            onStart={() => startCall(false)}
          />
        )}
        {tab === 'video' && (
          <CallPrompt
            icon={<Video className="w-8 h-8" />}
            title="Video call"
            body="See each other while you exchange skills."
            ready={ready}
            video={true}
            onStart={() => startCall(true)}
          />
        )}
        {tab === 'calls' && <CallLogsTab logs={logs} myId={user?.id} />}
      </div>

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
    </div>
  );
}

function partnerName(peer: any): string {
  return peer.displayName ?? 'Partner';
}

function CallPrompt({
  icon,
  title,
  body,
  ready,
  video,
  onStart,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  ready: boolean;
  video: boolean;
  onStart: () => void;
}) {
  return (
    <div className="card h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 rounded-full bg-cream-100 flex items-center justify-center text-ink-500 mb-4">
        {icon}
      </div>
      <h2 className="font-display font-bold text-2xl text-ink-900">{title}</h2>
      <p className="text-sm text-ink-500 mt-2 max-w-xs">{body}</p>
      <p className="text-xs text-ink-400 mt-1">
        You'll be asked to allow camera &amp; microphone the first time.
      </p>
      <button
        onClick={onStart}
        disabled={!ready}
        className={`mt-6 ${video ? 'btn-coral' : 'btn-primary'} disabled:opacity-40`}
      >
        {video ? <Video className="w-4 h-4" /> : <PhoneCall className="w-4 h-4" />}
        Start {title}
      </button>
      {!ready && <div className="text-xs text-ink-400 mt-2">Connecting to the call service…</div>}
    </div>
  );
}

function CallLogsTab({ logs, myId }: { logs: CallLog[]; myId?: string }) {
  return (
    <div className="card h-full overflow-y-auto">
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <History className="w-8 h-8 text-ink-300 mb-3" />
          <div className="text-sm font-semibold text-ink-700">No calls yet</div>
          <div className="text-xs text-ink-500 mt-1">
            Your voice and video calls with this match will appear here.
          </div>
        </div>
      ) : (
        <div className="divide-y divide-ink-100">
          {logs.map((l) => {
            const mine = l.callerId === myId;
            const durationSec = l.startedAt && l.endedAt
              ? Math.max(0, Math.round((new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime()) / 1000))
              : 0;
            return (
              <div key={l.id} className="flex items-center gap-3 p-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    l.type === 'VIDEO' ? 'bg-blue-100 text-blue-600' : 'bg-mint-100 text-mint-600'
                  }`}
                >
                  {l.type === 'VIDEO' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-900">
                    {l.type === 'VIDEO' ? 'Video call' : 'Voice call'}
                    <span className="font-normal text-ink-500"> · {mine ? 'Outgoing' : 'Incoming'}</span>
                  </div>
                  <div className="text-xs text-ink-500">
                    {new Date(l.startedAt).toLocaleString()} · {durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`}
                  </div>
                </div>
                <span
                  className={`chip text-[11px] shrink-0 ${
                    l.outcome === 'COMPLETED' ? 'chip-mint' : 'chip-coral'
                  }`}
                >
                  {l.outcome.toLowerCase()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}