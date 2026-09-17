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

export function CallOverlay({
  call,
  onAccept,
  onDecline,
  onHangup,
  onToggleMic,
  onToggleCamera,
  micMuted,
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
  localVideoRef: React.RefObject<HTMLVideoElement> | { current: HTMLVideoElement | null };
  remoteVideoRef: React.RefObject<HTMLVideoElement> | { current: HTMLVideoElement | null };
}) {
  if (call.status === 'none') return null;

  const partner = call.peer;
  const label =
    call.status === 'outgoing' ? 'Calling…' : call.status === 'incoming' ? 'Incoming call' : 'In a call';
  const ringing = call.status === 'incoming';
  const videoOn = call.status === 'active' && call.video;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/95 backdrop-blur flex flex-col items-center justify-center p-6 animate-fade-in"
      style={{ backgroundColor: '#0d0f15cc' }}
    >
      <div className="w-full max-w-sm text-center">
        {call.status === 'error' && (
          <div className="card p-6 mb-6 text-left">
            <div className="font-display font-bold text-lg text-ink-900">Call could not start</div>
            <p className="text-sm text-ink-600 mt-1">{call.error || 'Something went wrong.'}</p>
          </div>
        )}

        {videoOn ? (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-ink-900 mb-4 ring-1 ring-ink-700">
            <video
              ref={remoteVideoRef as React.RefObject<HTMLVideoElement>}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <video
              ref={localVideoRef as React.RefObject<HTMLVideoElement>}
              autoPlay
              playsInline
              muted
              className="absolute bottom-2 right-2 w-24 h-16 rounded-lg object-cover bg-ink-800 ring-1 ring-ink-600 z-10"
            />
            <div className="absolute top-2 left-2 text-xs text-cream-50/80 bg-ink-950/60 rounded-full px-2 py-1">
              Video call
            </div>
          </div>
        ) : (
          <div className="mb-4 flex justify-center">
            <FrameAvatar
              frame={partner.avatarFrame || 'default'}
              src={partner.avatarUrl}
              alt={partner.displayName}
              size={call.status === 'active' ? 88 : 104}
            />
          </div>
        )}

        {(call.status === 'incoming' || call.status === 'outgoing' || call.status === 'error') && (
          <div className={`text-xs uppercase tracking-wide font-semibold ${call.video ? 'text-coral-300' : 'text-mint-300'}`}>
            {call.video ? 'Video call' : 'Voice call'}
          </div>
        )}

        <h2 className="font-display font-bold text-2xl text-cream-50 mt-3">{partner.displayName}</h2>
        <p className="text-sm text-cream-300 mt-1">
          {call.status === 'error' ? 'Close to return to the exchange' : ringing ? 'is calling you…' : label}
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          {call.status === 'incoming' && (
            <>
              <button
                onClick={onAccept}
                className="w-16 h-16 rounded-full bg-mint-500 text-white flex items-center justify-center shadow-soft-lg active:scale-95"
              >
                <Phone className="w-6 h-6" />
              </button>
              <button
                onClick={onDecline}
                className="w-16 h-16 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft-lg active:scale-95"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          )}
          {(call.status === 'outgoing' || call.status === 'active') && (
            <>
              {call.status === 'active' && (
                <>
                  {call.video && (
                    <button
                      onClick={onToggleCamera}
                      className="w-14 h-14 rounded-full bg-ink-800 text-cream-200 flex items-center justify-center ring-1 ring-ink-600 active:scale-95"
                    >
                      <VideoOff className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={onToggleMic}
                    className={`w-14 h-14 rounded-full flex items-center justify-center ring-1 active:scale-95 ${
                      micMuted ? 'bg-coral-500 text-white ring-coral-600' : 'bg-ink-800 text-cream-200 ring-ink-600'
                    }`}
                  >
                    {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                </>
              )}
              <button
                onClick={onHangup}
                className="w-16 h-16 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft-lg active:scale-95"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </>
          )}
          {call.status === 'error' && (
            <button
              onClick={onHangup}
              className="w-16 h-16 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft-lg active:scale-95"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}