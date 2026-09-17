import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { EmptyState, Skeleton } from '../components/ui';
import ChatTab from '../components/ChatTab';
import { useCall, CallOverlay } from '../components/CallOverlay';
import { ArrowLeft, Phone, Video, PhoneCall, History, MessageCircle, Sun, Moon } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { createSocket } from '../lib/socket';
import { startRingtone, stopRingtone } from '../lib/ringtone';
import { requestCallNotificationPermission, ringIncomingCall, stopIncomingCallRing, getCallSoundSource, setCallUiActive } from '../lib/call-notifier';
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
  const { data: subData } = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => api.get<{ tier: 'FREE' | 'PRO' }>('/subscription'),
  });
  const isPro = subData ? subData.tier === 'PRO' : (user as any)?.tier === 'PRO';

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

  return (
    <ConversationContent
      id={id}
      exchange={exchange}
      socket={socket}
      ready={ready}
      me={me}
      peer={peer}
      pro={isPro}
      tab={tab}
      setTab={setTab}
      onBack={() => nav('/messages')}
    />
  );
}

function ConversationContent({
  id,
  exchange,
  socket,
  ready,
  me,
  peer,
  pro,
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
  pro: boolean;
  tab: Tab;
  setTab: (t: Tab) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const call = useCall(socket, id, me, peer);

  // Ask for the notification permission up front so an incoming call can ring
  // with a full notification, exactly like WhatsApp.
  useEffect(() => {
    void requestCallNotificationPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full-screen "simulated call alarm": hide the Android system bars and keep
  // the screen awake for the whole call, restored the moment it ends.
  useEffect(() => {
    void setCallUiActive(call.state.status !== 'none');
    return () => {
      void setCallUiActive(false);
    };
  }, [call.state.status]);

  // Ring on incoming calls (native notification + in-app tone) and give the
  // caller a ringback while their call is ringing out.
  useEffect(() => {
    const status = call.state.status;
    if (status === 'incoming') {
      void ringIncomingCall(peer, getCallSoundSource());
      startRingtone(true); // native notification rings with the user's chosen sound
    } else if (status === 'outgoing') {
      startRingtone(false); // ringback tone
    } else {
      stopRingtone();
      void stopIncomingCallRing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.state.status, id]);

  // Chat mode: White for everyone, Dark for Pro. Free users pick White only.
  const [dark, setDark] = useState<boolean>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('skillswap_chat_mode') : null;
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
    return pro;
  });

  const chooseMode = (d: boolean) => {
    if (d && !pro) {
      toast.push({
        type: 'info',
        title: 'Dark chat is a Pro perk',
        body: 'Upgrade to Pro to chat in dark mode.',
      });
      return;
    }
    setDark(d);
    try {
      localStorage.setItem('skillswap_chat_mode', d ? 'dark' : 'light');
    } catch {}
  };

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

  const shell = dark
    ? {
        surface: 'chat-dark',
        border: 'border-[#1f2430]',
        pillActive: 'bg-[#1a1e29] text-[#eef0f4]',
        pillIdle: 'text-[#76819a]',
        icon: 'text-[#eef0f4] hover:bg-[#1f2430]',
      }
    : {
        surface: 'chat-white',
        border: 'border-[#efe9e0]',
        pillActive: 'bg-[#f5f2ec] text-[#12131a]',
        pillIdle: 'text-[#8a8a8f]',
        icon: 'text-[#12131a] hover:bg-[#f5f2ec]',
      };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'voice', label: 'Voice', icon: Phone },
    { id: 'video', label: 'Video', icon: Video },
    { id: 'calls', label: 'Call log', icon: History },
  ];

  return (
    <div className={`flex flex-col h-[100dvh] overflow-hidden ${shell.surface}`}>
      {/* WhatsApp-style header with a chat-mode picker */}
      <header className={`flex items-center h-12 px-1.5 shrink-0 border-b ${shell.border}`}>
        <button
          onClick={onBack}
          aria-label="Back to all messages"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${shell.icon}`}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className={`ml-auto flex items-center gap-0.5 rounded-full p-0.5 ${shell.pillIdle} ${dark ? 'bg-[#161a23]' : 'bg-[#f2ede4]'}`}>
          <button
            onClick={() => chooseMode(false)}
            aria-pressed={!dark}
            title="White chat"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              !dark ? shell.pillActive : ''
            }`}
          >
            <Sun className="w-3.5 h-3.5" /> White
          </button>
          <button
            onClick={() => chooseMode(true)}
            aria-pressed={dark}
            title={pro ? 'Dark chat' : 'Dark chat is a Pro perk'}
            className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              dark ? shell.pillActive : ''
            }`}
          >
            <Moon className="w-3.5 h-3.5" /> Dark
            {!pro && (
              <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-[#fb4f1d] text-white rounded-full px-1 py-px">
                PRO
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Slim tab row */}
      <div className={`flex gap-1 px-2 pt-1.5 pb-1 shrink-0 border-b ${shell.border} overflow-x-auto`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? shell.pillActive : shell.pillIdle
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'chat' && <ChatTab exchangeId={id} socket={socket} dark={dark} />}
        {tab === 'voice' && (
          <CallPrompt
            dark={dark}
            icon={<Phone className="w-8 h-8" />}
            title="Voice call"
            body="Call your match to talk through a skill exchange."
            ready={ready}
            onStart={() => startCall(false)}
          />
        )}
        {tab === 'video' && (
          <CallPrompt
            dark={dark}
            icon={<Video className="w-8 h-8" />}
            title="Video call"
            body="See each other while you exchange skills."
            ready={ready}
            onStart={() => startCall(true)}
          />
        )}
        {tab === 'calls' && <CallLogsTab dark={dark} logs={logs} myId={user?.id} />}
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

function CallPrompt({
  dark,
  icon,
  title,
  body,
  ready,
  onStart,
}: {
  dark: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  ready: boolean;
  onStart: () => void;
}) {
  return (
    <div
      className={`h-full w-full flex flex-col items-center justify-center p-8 text-center ${
        dark ? 'chat-dark' : 'chat-white'
      }`}
    >
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
          dark ? 'bg-[#1a1e29] text-[#cdd1da]' : 'bg-[#f5f2ec] text-[#8a8a8f]'
        }`}
      >
        {icon}
      </div>
      <h2 className={`font-display font-bold text-2xl ${dark ? 'text-[#eef0f4]' : 'text-[#12131a]'}`}>
        {title}
      </h2>
      <p className={`text-sm mt-2 max-w-xs ${dark ? 'text-[#a5abba]' : 'text-[#8a8a8f]'}`}>{body}</p>
      <p className={`text-xs mt-1 ${dark ? 'text-[#76819a]' : 'text-[#a5abba]'}`}>
        You'll be asked to allow camera &amp; microphone the first time.
      </p>
      <button
        onClick={onStart}
        disabled={!ready}
        className="btn-coral mt-6 disabled:opacity-40"
      >
        {title === 'Video call' ? <Video className="w-4 h-4" /> : <PhoneCall className="w-4 h-4" />}
        Start {title}
      </button>
      {!ready && <div className={`text-xs mt-2 ${dark ? 'text-[#76819a]' : 'text-[#a5abba]'}`}>Connecting to the call service…</div>}
    </div>
  );
}

function CallLogsTab({ dark, logs, myId }: { dark: boolean; logs: CallLog[]; myId?: string }) {
  return (
    <div className={`h-full w-full overflow-y-auto ${dark ? 'chat-dark' : 'chat-white'}`}>
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <History className={`w-8 h-8 mb-3 ${dark ? 'text-[#3a4150]' : 'text-[#d5cdc0]'}`} />
          <div className={`text-sm font-semibold ${dark ? 'text-[#eef0f4]' : 'text-[#12131a]'}`}>
            No calls yet
          </div>
          <div className={`text-xs mt-1 ${dark ? 'text-[#76819a]' : 'text-[#8a8a8f]'}`}>
            Your voice and video calls with this match will appear here.
          </div>
        </div>
      ) : (
        <div className={`divide-y ${dark ? 'divide-[#1f2430]' : 'divide-[#efe9e0]'}`}>
          {logs.map((l) => {
            const mine = l.callerId === myId;
            const durationSec =
              l.startedAt && l.endedAt
                ? Math.max(0, Math.round((new Date(l.endedAt).getTime() - new Date(l.startedAt).getTime()) / 1000))
                : 0;
            return (
              <div key={l.id} className="flex items-center gap-3 p-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    l.type === 'VIDEO'
                      ? dark
                        ? 'bg-[#1e3a5f] text-[#7ab8ff]'
                        : 'bg-[#e7f2ff] text-[#2563eb]'
                      : dark
                      ? 'bg-[#1f3a2c] text-[#6ee7b7]'
                      : 'bg-[#e4f6ee] text-[#0a7c5f]'
                  }`}
                >
                  {l.type === 'VIDEO' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${dark ? 'text-[#eef0f4]' : 'text-[#12131a]'}`}>
                    {l.type === 'VIDEO' ? 'Video call' : 'Voice call'}
                    <span className={`font-normal ${dark ? 'text-[#76819a]' : 'text-[#8a8a8f]'}`}>
                      {' '}
                      · {mine ? 'Outgoing' : 'Incoming'}
                    </span>
                  </div>
                  <div className={`text-xs ${dark ? 'text-[#76819a]' : 'text-[#a5abba]'}`}>
                    {new Date(l.startedAt).toLocaleString()} ·{' '}
                    {durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${
                    l.outcome === 'COMPLETED'
                      ? dark
                        ? 'bg-[#1f3a2c] text-[#6ee7b7]'
                        : 'bg-[#e4f6ee] text-[#0a7c5f]'
                      : dark
                      ? 'bg-[#3a241b] text-[#ffa07e]'
                      : 'bg-[#ffe7de] text-[#c2410c]'
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