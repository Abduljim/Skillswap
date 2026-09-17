import { FrameAvatar } from './ui';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, MessageCircle, X, RotateCw, Settings } from 'lucide-react';

export type CallStatus = 'none' | 'outgoing' | 'incoming' | 'active' | 'error';

export interface Peer {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  avatarFrame?: string | null;
}

export interface CallState {
  status: CallStatus;
  peer: Peer;
  video: boolean;
  incoming: boolean;
  error?: string;
}

export interface CallSummaryInfo {
  peer: Peer;
  exchangeId: string;
  durationSec: number;
  video: boolean;
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function DockButton({
  onClick,
  active,
  danger,
  green,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  green?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const base =
    'w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition active:scale-95';
  const tone = danger
    ? 'bg-[#ff3b30] text-white'
    : green
      ? 'bg-[#00a884] text-white'
      : active
        ? 'bg-white text-[#0d0f15]'
        : 'bg-white/15 text-white ring-1 ring-white/25';
  return (
    <button onClick={onClick} className={`${base} ${tone}`} aria-label={label} title={label}>
      {children}
    </button>
  );
}

export function CallOverlay({
  call,
  onAccept,
  onDecline,
  onHangup,
  onToggleMic,
  onToggleCamera,
  onOpenSettings,
  micMuted,
  cameraAvailable,
  localVideoRef,
  remoteVideoRef,
  durationSec = 0,
  exchangeId,
  summary = null,
  onClearSummary,
  onRedial,
  onMessage,
}: {
  call: CallState;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onOpenSettings?: () => void;
  micMuted: boolean;
  cameraAvailable: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement> | { current: HTMLVideoElement | null };
  remoteVideoRef: React.RefObject<HTMLVideoElement> | { current: HTMLVideoElement | null };
  durationSec?: number;
  exchangeId?: string;
  summary?: CallSummaryInfo | null;
  onClearSummary?: () => void;
  onRedial?: (peer: Peer, exchangeId: string, video: boolean) => void;
  onMessage?: (exchangeId: string) => void;
}) {
  if (call.status === 'none' && !summary) return null;

  const partner = call.peer;
  const ringing = call.status === 'incoming';
  const inCall = call.status === 'active';
  const videoOn = inCall && call.video;

  const ended = call.status === 'none' && !!summary;
  const shownPeer = ended && summary ? summary.peer : partner;

  const statusText =
    call.status === 'error'
      ? call.error || 'Something went wrong'
      : call.status === 'outgoing'
        ? 'Ringing…'
        : ringing
          ? 'Incoming call'
          : inCall
            ? formatDuration(durationSec)
            : '';

  if (ended && summary) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col animate-fade-in"
        style={{ backgroundColor: '#0d0f15' }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 80% at 50% 0%, #1b2130 0%, #0d0f15 60%)' }}
        />
        <div className="relative z-20 flex flex-col h-full">
          <div className="flex justify-end px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <button
              onClick={onClearSummary}
              className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <FrameAvatar
              frame={shownPeer.avatarFrame || 'default'}
              src={shownPeer.avatarUrl}
              alt={shownPeer.displayName}
              size={120}
            />
            <h2 className="font-display font-bold text-2xl text-white mt-5">{shownPeer.displayName}</h2>
            <p className="text-sm text-white/60 mt-1">Call ended</p>
            <p className="text-3xl font-display font-semibold text-white/90 mt-4">
              {formatDuration(summary.durationSec)}
            </p>
          </div>
          <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))] px-6">
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => onMessage?.(summary.exchangeId)}
                className="flex flex-col items-center gap-2 text-white/80"
              >
                <span className="w-14 h-14 rounded-full bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6" />
                </span>
                <span className="text-xs">Message</span>
              </button>
              <button
                onClick={() => onRedial?.(summary.peer, summary.exchangeId, summary.video)}
                className="flex flex-col items-center gap-2 text-white"
              >
                <span className="w-14 h-14 rounded-full bg-[#00a884] flex items-center justify-center shadow-lg">
                  {summary.video ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
                </span>
                <span className="text-xs">Call again</span>
              </button>
              <button
                onClick={onClearSummary}
                className="flex flex-col items-center gap-2 text-white/80"
              >
                <span className="w-14 h-14 rounded-full bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
                  <X className="w-6 h-6" />
                </span>
                <span className="text-xs">Close</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in" style={{ backgroundColor: '#0d0f15' }}>
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, #1b2130 0%, #0d0f15 60%)' }}
      />

      {inCall && (
        <video
          ref={remoteVideoRef as React.RefObject<HTMLVideoElement>}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover ${videoOn ? '' : 'invisible'}`}
        />
      )}

      <video
        ref={localVideoRef as React.RefObject<HTMLVideoElement>}
        autoPlay
        playsInline
        muted
        className={`absolute top-4 right-4 w-28 h-40 rounded-2xl object-cover bg-ink-900 ring-1 ring-white/20 z-10 ${
          videoOn ? '' : 'invisible'
        }`}
      />

      <div className="relative z-20 flex flex-col h-full">
        <div className="pt-[max(1.5rem,env(safe-area-inset-top))] text-center px-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/50 font-semibold">SkillSwap</div>
          <h2 className="font-display font-bold text-2xl text-white mt-2">{partner.displayName}</h2>
          <p
            className={`mt-1 ${
              call.status === 'error'
                ? 'text-sm text-red-300 max-w-xs mx-auto'
                : inCall
                  ? 'text-base font-medium text-white/85 tabular-nums'
                  : 'text-sm text-white/60'
            }`}
          >
            {statusText}
          </p>
        </div>

        {!videoOn && (
          <div className="flex-1 flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-white/5 animate-ping-slow" />
              <FrameAvatar
                frame={partner.avatarFrame || 'default'}
                src={partner.avatarUrl}
                alt={partner.displayName}
                size={132}
              />
            </div>
          </div>
        )}

        {videoOn && <div className="flex-1" />}

        <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))] px-6">
          {call.status === 'error' ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={onHangup}
                  className="flex flex-col items-center gap-2 text-white/80"
                >
                  <span className="w-14 h-14 rounded-full bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
                    <X className="w-6 h-6" />
                  </span>
                  <span className="text-xs">Close</span>
                </button>
                <button
                  onClick={() => onRedial?.(partner, exchangeId || '', call.video)}
                  className="flex flex-col items-center gap-2 text-white"
                >
                  <span className="w-14 h-14 rounded-full bg-[#00a884] flex items-center justify-center shadow-lg">
                    <RotateCw className="w-6 h-6" />
                  </span>
                  <span className="text-xs">Try again</span>
                </button>
                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="flex flex-col items-center gap-2 text-white/80"
                  >
                    <span className="w-14 h-14 rounded-full bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
                      <Settings className="w-6 h-6" />
                    </span>
                    <span className="text-xs">Open settings</span>
                  </button>
                )}
              </div>
            </div>
          ) : ringing ? (
            <div className="flex items-center justify-center gap-8">
              <DockButton onClick={onAccept} green label="Accept call">
                <Phone className="w-6 h-6" />
              </DockButton>
              <DockButton onClick={onDecline} danger label="Decline call">
                <PhoneOff className="w-6 h-6" />
              </DockButton>
            </div>
          ) : (
            <div className="mx-auto max-w-xs rounded-full bg-black/40 ring-1 ring-white/10 backdrop-blur px-4 py-3 flex items-center justify-between">
              {inCall && (
                <DockButton
                  onClick={onToggleMic}
                  active={micMuted}
                  label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </DockButton>
              )}
              {inCall && cameraAvailable && (
                <DockButton
                  onClick={onToggleCamera}
                  active={!call.video}
                  label={call.video ? 'Turn camera off' : 'Turn camera on'}
                >
                  {call.video ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </DockButton>
              )}
              <DockButton onClick={onHangup} danger label="End call">
                <PhoneOff className="w-6 h-6" />
              </DockButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
