import { FrameAvatar } from './ui';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Users, Settings, X } from 'lucide-react';
import type { Peer } from './CallOverlay';
import type { GroupPeerState, GroupStatus } from '../contexts/CallsContext';

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function Initials({ name }: { name: string }) {
  return (
    <span className="font-display font-bold text-white/90 text-lg">
      {name
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()}
    </span>
  );
}

function AvatarStack({ members, max = 4 }: { members: Peer[]; max?: number }) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center justify-center -space-x-3">
      {shown.map((m) => (
        <div key={m.id} className="ring-2 ring-[#0d0f15] rounded-full">
          <FrameAvatar frame={m.avatarFrame || 'default'} src={m.avatarUrl} alt={m.displayName} size={56} />
        </div>
      ))}
      {extra > 0 && (
        <div className="ring-2 ring-[#0d0f15] rounded-full w-14 h-14 bg-white/15 text-white flex items-center justify-center text-sm font-semibold">
          +{extra}
        </div>
      )}
    </div>
  );
}

function ControlButton({
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
  const base = 'w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition active:scale-95';
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

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-2';
  if (count <= 6) return 'grid-cols-2';
  return 'grid-cols-3';
}

export function GroupCallOverlay({
  status,
  video,
  host,
  members,
  error,
  micOn,
  camOn,
  peerStates,
  meId,
  durationSec,
  videoElsRef,
  attachVideo,
  onAccept,
  onDecline,
  onLeave,
  onToggleMic,
  onToggleCamera,
  onOpenSettings,
  relayHint = null,
}: {
  status: GroupStatus;
  video: boolean;
  host: Peer | null;
  members: Peer[];
  error?: string;
  micOn: boolean;
  camOn: boolean;
  peerStates: Record<string, GroupPeerState>;
  meId: string;
  durationSec: number;
  videoElsRef: React.RefObject<Map<string, HTMLVideoElement>>;
  attachVideo: (memberId: string) => void;
  onAccept: () => void;
  onDecline: () => void;
  onLeave: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onOpenSettings?: () => void;
  /** Explains a missing TURN relay while the call is ringing. */
  relayHint?: string | null;
}) {
  if (status === 'none') return null;

  const others = members.filter((m) => m.id !== meId);
  const label = `${members.length} ${members.length === 1 ? 'person' : 'people'}`;
  const callLabel = `${video ? 'Video' : 'Voice'} group call`;

  if (status === 'incoming' || status === 'outgoing') {
    const title = status === 'incoming' ? (host?.displayName ?? 'Group call') : 'New group call';
    return (
      <div className="fixed inset-0 z-50 flex flex-col animate-fade-in" style={{ backgroundColor: '#0d0f15' }}>
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 80% at 50% 0%, #1b2130 0%, #0d0f15 60%)' }}
        />
        <div className="relative z-20 flex flex-col h-full">
          <div className="flex justify-end px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
            {status === 'outgoing' && (
              <button
                onClick={onLeave}
                className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"
                aria-label="Cancel group call"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="relative">
              {status === 'incoming' && <div className="absolute inset-0 rounded-full bg-white/5 animate-ping-slow" />}
              <AvatarStack members={others.length ? others : members} max={4} />
            </div>
            <h2 className="font-display font-bold text-2xl text-white mt-6">{title}</h2>
            <p className="text-sm text-white/60 mt-1">
              {status === 'incoming' ? `Incoming ${callLabel.toLowerCase()} · ${label}` : `Calling ${label}…`}
            </p>
            {video && (
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/70 bg-white/10 rounded-full px-3 py-1">
                <Video className="w-3.5 h-3.5" /> Video
              </span>
            )}
            {relayHint && (
              <p className="mt-4 text-[11px] leading-snug text-amber-200/80 max-w-xs mx-auto">{relayHint}</p>
            )}
          </div>
          <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))] px-6">
            <div className="flex items-center justify-center gap-8">
              {status === 'incoming' ? (
                <>
                  <ControlButton onClick={onAccept} green label="Join group call">
                    <Phone className="w-6 h-6" />
                  </ControlButton>
                  <ControlButton onClick={onDecline} danger label="Decline group call">
                    <PhoneOff className="w-6 h-6" />
                  </ControlButton>
                </>
              ) : (
                <ControlButton onClick={onLeave} danger label="Cancel group call">
                  <PhoneOff className="w-6 h-6" />
                </ControlButton>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // active
  const tiles: Peer[] = [{ id: meId, displayName: 'You' }, ...others];
  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in" style={{ backgroundColor: '#0d0f15' }}>
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, #1b2130 0%, #0d0f15 60%)' }}
      />
      <div className="relative z-20 flex flex-col h-full">
        <div className="pt-[max(1.25rem,env(safe-area-inset-top))] px-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/50 font-semibold">Group call</div>
            <div className="text-white font-semibold text-sm mt-0.5 flex items-center gap-2">
              <Users className="w-4 h-4 text-white/70" />
              {label} · <span className="tabular-nums text-white/80">{formatDuration(durationSec)}</span>
            </div>
          </div>
          {video && (
            <span className="inline-flex items-center gap-1.5 text-xs text-white/70 bg-white/10 rounded-full px-3 py-1">
              <Video className="w-3.5 h-3.5" /> Video
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className={`grid gap-3 ${gridClass(tiles.length)}`}>
            {tiles.map((m) => {
              const isMe = m.id === meId;
              const state = isMe ? { mic: micOn, camera: camOn } : peerStates[m.id];
              const showVideo = video && state?.camera !== false && !isMe;
              const micActive = state?.mic !== false;
              return (
                <div
                  key={m.id}
                  className="relative rounded-2xl overflow-hidden bg-white/[0.06] ring-1 ring-white/10 aspect-[3/4] flex items-center justify-center"
                >
                  {!isMe && (
                    <video
                      ref={(el) => {
                        if (el) {
                          videoElsRef.current?.set(m.id, el);
                          attachVideo(m.id);
                        } else {
                          videoElsRef.current?.delete(m.id);
                        }
                      }}
                      autoPlay
                      playsInline
                      className={`absolute inset-0 w-full h-full object-cover ${showVideo ? '' : 'invisible'}`}
                    />
                  )}
                  {(!showVideo || isMe) && (
                    <div className="relative flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                        {!isMe && m.avatarUrl ? (
                          <FrameAvatar
                            frame={m.avatarFrame || 'default'}
                            src={m.avatarUrl}
                            alt={m.displayName}
                            size={64}
                          />
                        ) : (
                          <Initials name={m.displayName} />
                        )}
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 px-2.5 py-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
                    <span className="text-xs text-white font-medium truncate max-w-[70%]">
                      {isMe ? 'You' : m.displayName}
                    </span>
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        micActive ? 'bg-white/20 text-white' : 'bg-[#ff3b30] text-white'
                      }`}
                    >
                      {micActive ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {error && (
            <p className="mt-4 text-sm text-red-300 text-center max-w-xs mx-auto">{error}</p>
          )}
        </div>

        <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))] px-6">
          <div className="mx-auto max-w-sm rounded-full bg-black/40 ring-1 ring-white/10 backdrop-blur px-4 py-3 flex items-center justify-between">
            <ControlButton onClick={onToggleMic} active={!micOn} label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </ControlButton>
            {video && (
              <ControlButton onClick={onToggleCamera} active={!camOn} label={camOn ? 'Turn camera off' : 'Turn camera on'}>
                {camOn ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </ControlButton>
            )}
            {onOpenSettings && error && (
              <ControlButton onClick={onOpenSettings} label="Open settings">
                <Settings className="w-5 h-5" />
              </ControlButton>
            )}
            <ControlButton onClick={onLeave} danger label="Leave group call">
              <PhoneOff className="w-6 h-6" />
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}
