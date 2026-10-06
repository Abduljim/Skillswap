import { FrameAvatar } from './ui';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MessageCircle,
  X,
  RotateCw,
  Settings,
  ChevronDown,
  Volume1,
  Volume2,
} from 'lucide-react';

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
  relayHint = null,
  reachNote = null,
  calleeOnline = null,
  remoteHasVideo = true,
  localHasVideo = true,
  speakerOn = false,
  onToggleSpeaker,
  minimized = false,
  onMinimize,
  onRestore,
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
  /** Explains a missing TURN relay while the call is not yet connected. */
  relayHint?: string | null;
  /** Whether an offline callee's phone is really being rung (push). */
  reachNote?: string | null;
  /** False when the server knows the callee has no live socket. */
  calleeOnline?: boolean | null;
  remoteHasVideo?: boolean;
  localHasVideo?: boolean;
  speakerOn?: boolean;
  onToggleSpeaker?: () => void;
  /** Collapse the in-call sheet to a floating bar so the app stays usable. */
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}) {
  if (call.status === 'none' && !summary) return null;

  const partner = call.peer;
  const ringing = call.status === 'incoming';
  const inCall = call.status === 'active';
  const videoOn = inCall && call.video;
  // Only an established call can be minimised: a ringing sheet has nothing to
  // collapse into, and the callee must see Accept/Decline.
  const mini = minimized && inCall;

  const ended = call.status === 'none' && !!summary;
  const shownPeer = ended && summary ? summary.peer : partner;

  const statusText =
    call.status === 'error'
      ? call.error || 'Something went wrong'
      : call.status === 'outgoing'
        ? calleeOnline === false
          ? 'Calling…'
          : 'Ringing…'
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
    <div
      className={
        mini
          ? 'fixed z-[60] top-[max(0.75rem,env(safe-area-inset-top))] left-3 right-3 h-[4.5rem] rounded-2xl bg-[#0d0f15]/95 ring-1 ring-white/15 shadow-2xl backdrop-blur animate-fade-in'
          : 'fixed inset-0 z-50 flex flex-col animate-fade-in'
      }
      style={mini ? undefined : { backgroundColor: '#0d0f15' }}
      role={mini ? 'status' : undefined}
      aria-label={mini ? `Ongoing call with ${partner.displayName}, minimised` : undefined}
    >
      <div
        className={mini ? 'hidden' : 'absolute inset-0'}
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, #1b2130 0%, #0d0f15 60%)' }}
      />

      {/* Remote video. Both video elements hold the same position in the tree in
          either state, on purpose: the stream is attached imperatively, so a
          remounted element would come back black when the call is restored. */}
      <div
        className={
          mini
            ? 'absolute left-2.5 top-1/2 h-16 w-12 -translate-y-1/2 overflow-hidden rounded-xl bg-ink-900 ring-1 ring-white/15'
            : 'absolute inset-0'
        }
      >
        <video
          ref={remoteVideoRef as React.RefObject<HTMLVideoElement>}
          autoPlay
          playsInline
          className={`h-full w-full object-cover ${videoOn && remoteHasVideo ? '' : 'invisible'}`}
        />
        {mini && !videoOn && (
          <div className="absolute inset-0 flex items-center justify-center">
            <FrameAvatar
              frame={partner.avatarFrame || 'default'}
              src={partner.avatarUrl}
              alt={partner.displayName}
              size={40}
            />
          </div>
        )}
      </div>

      <video
        ref={localVideoRef as React.RefObject<HTMLVideoElement>}
        autoPlay
        playsInline
        muted
        className={
          mini
            ? 'hidden'
            : `absolute top-4 right-4 w-28 h-40 rounded-2xl object-cover bg-ink-900 ring-1 ring-white/20 z-10 ${
                videoOn && localHasVideo ? '' : 'invisible'
              }`
        }
      />

      {mini ? (
        // Floating bar. This branch paints only the bar — no backdrop — so the
        // app underneath stays fully interactive while the call runs.
        <div className="absolute inset-y-0 left-[4.75rem] right-2 flex items-center gap-1">
          <button
            onClick={onRestore}
            className="flex min-w-0 flex-1 flex-col items-start py-2 text-left"
            aria-label="Return to call"
            title="Return to call"
          >
            <span className="w-full truncate text-sm font-semibold text-white">
              {partner.displayName}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-white/60 tabular-nums">
              {micMuted ? (
                <MicOff className="h-3 w-3" />
              ) : call.video ? (
                <Video className="h-3 w-3" />
              ) : (
                <Phone className="h-3 w-3" />
              )}
              {formatDuration(durationSec)}
            </span>
          </button>
          <button
            onClick={onHangup}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ff3b30] text-white active:scale-95"
            aria-label="End call"
            title="End call"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="relative z-20 flex flex-col h-full">
          <div className="pt-[max(1.5rem,env(safe-area-inset-top))] text-center px-6">
            {inCall && onMinimize && (
              <button
                onClick={onMinimize}
                className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 active:scale-95"
                aria-label="Minimise call"
                title="Minimise call"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            )}
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
            {relayHint && !inCall && !ended && (
              <p className="mt-2 text-[11px] leading-snug text-amber-200/80 max-w-xs mx-auto">
                {relayHint}
              </p>
            )}
            {reachNote && !inCall && !ended && (
              <p className="mt-2 text-[11px] leading-snug text-amber-200/80 max-w-xs mx-auto">{reachNote}</p>
            )}
            {inCall && call.video && !localHasVideo && (
              <p className="mt-2 text-[11px] leading-snug text-amber-200/80 max-w-xs mx-auto">
                Camera unavailable on this device — continuing as an audio call.
              </p>
            )}
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
                {inCall && onToggleSpeaker && (
                  <DockButton
                    onClick={onToggleSpeaker}
                    active={speakerOn}
                    label={speakerOn ? 'Back to normal volume' : 'Speakerphone (louder)'}
                  >
                    {speakerOn ? <Volume2 className="w-5 h-5" /> : <Volume1 className="w-5 h-5" />}
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
      )}
    </div>
  );
}
