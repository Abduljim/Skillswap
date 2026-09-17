import { FrameAvatar } from './ui';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

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
  micMuted,
  cameraAvailable,
  localVideoRef,
  remoteVideoRef,
}: {
  call: CallState;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  micMuted: boolean;
  cameraAvailable: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement> | { current: HTMLVideoElement | null };
  remoteVideoRef: React.RefObject<HTMLVideoElement> | { current: HTMLVideoElement | null };
}) {
  if (call.status === 'none') return null;

  const partner = call.peer;
  const ringing = call.status === 'incoming';
  const inCall = call.status === 'active';
  const videoOn = inCall && call.video;

  const statusText =
    call.status === 'error'
      ? 'Call failed'
      : call.status === 'outgoing'
        ? 'Ringing…'
        : ringing
          ? 'Incoming call'
          : inCall
            ? call.video
              ? 'Video call'
              : 'Voice call'
            : '';

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
          <p className="text-sm text-white/60 mt-1">
            {call.status === 'error' ? call.error || 'Something went wrong' : statusText}
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
            <div className="flex justify-center">
              <DockButton onClick={onHangup} danger label="Close">
                <PhoneOff className="w-6 h-6" />
              </DockButton>
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
