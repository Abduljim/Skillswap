import { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { Avatar } from './ui';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

export type CallStatus = 'none' | 'outgoing' | 'incoming' | 'active';

interface Peer {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface RTCSignal {
  type?: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface CallState {
  status: CallStatus;
  peer: Peer;
  video: boolean;
  incoming: boolean;
}

export function useCall(
  socket: Socket | null,
  exchangeId: string,
  me: Peer,
  partner: Peer
) {
  const [state, setState] = useState<CallState>({
    status: 'none',
    peer: partner,
    video: false,
    incoming: false,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoEnabledRef = useRef(false);
  const micMutedRef = useRef(false);
  const rawRef = useRef(state);
  const peerIdRef = useRef(partner.id);
  const socketRef = useRef(socket);
  const [micMuted, setMicMuted] = useState(false);

  rawRef.current = state;

  const update = useCallback((patch: Partial<CallState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // ── Socket event wiring ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    socketRef.current = socket;

    const onRinging = (p: { exchangeId: string; caller: Peer }) => {
      if (p.exchangeId !== exchangeId || p.caller.id === me.id) return;
      if (rawRef.current.status !== 'none') return;
      peerIdRef.current = p.caller.id;
      update({ status: 'incoming', peer: p.caller, video: false, incoming: true });
    };

    const onAccepted = (p: { exchangeId: string; acceptorId: string }) => {
      if (p.exchangeId !== exchangeId || rawRef.current.status !== 'outgoing') return;
      update({ status: 'active', incoming: false });
      startPeer(false); // we are the caller — callee sends the offer
    };

    const onRejected = (p: { exchangeId: string }) => {
      if (p.exchangeId !== exchangeId || rawRef.current.status !== 'outgoing') return;
      cleanup(true);
      update({ status: 'none', incoming: false });
    };

    const onEnded = (p: { exchangeId: string }) => {
      if (p.exchangeId !== exchangeId) return;
      if (rawRef.current.status === 'none') return;
      cleanup(true);
      update({ status: 'none', incoming: false });
    };

    const onSignal = async (p: { exchangeId: string; from: string; signal: RTCSignal }) => {
      if (p.exchangeId !== exchangeId || p.from !== peerIdRef.current) return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        if (p.signal.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: p.signal.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:signal', {
            exchangeId,
            to: p.from,
            signal: { type: 'answer', sdp: pc.localDescription?.sdp },
          });
        } else if (p.signal.type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: p.signal.sdp });
        } else if (p.signal.type === 'candidate') {
          await pc.addIceCandidate(p.signal.candidate);
        }
      } catch (e) {
        console.error('[CALL] signal error', e);
      }
    };

    socket.on('call:ringing', onRinging);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('webrtc:signal', onSignal);

    return () => {
      socket.off('call:ringing', onRinging);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('webrtc:signal', onSignal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, exchangeId]);

  // ── Peer helpers ────────────────────────────────────────────────
  const attachStreams = (stream: MediaStream) => {
    streamRef.current = stream;
    stream.getTracks().forEach((t) => (t as any).enabled = videoEnabledRef.current ? true : t.kind !== 'video');
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      (remoteVideoRef.current as any).playsInline = true;
      awaitRemotePlay();
    }
  };

  const awaitRemotePlay = () => {
    (remoteVideoRef.current as any)?.play?.().catch(() => {});
  };

  const attachLocal = (stream: MediaStream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      (localVideoRef.current as any).playsInline = true;
      (localVideoRef.current as any).play?.().catch(() => {});
    }
  };

  const startPeer = useCallback(async (isCallee: boolean) => {
    const sock = socketRef.current;
    if (!sock) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: videoEnabledRef.current,
      });
      attachStreams(stream);
      attachLocal(stream);

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sock.emit('webrtc:signal', {
            exchangeId,
            to: peerIdRef.current,
            signal: { type: 'candidate', candidate: ev.candidate.toJSON() },
          });
        }
      };
      pc.ontrack = (ev) => {
        const remoteStream = ev.streams[0];
        if (remoteStream) attachStreams(remoteStream);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanup(true);
          update({ status: 'none', incoming: false });
        }
      };

      if (isCallee) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sock.emit('webrtc:signal', {
          exchangeId,
          to: peerIdRef.current,
          signal: { type: 'offer', sdp: pc.localDescription?.sdp },
        });
      }
    } catch (e: any) {
      console.error('[CALL] setup failed', e);
      cleanup(true);
      update({ status: 'none', incoming: false });
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchangeId]);

  const cleanup = useCallback((stopStream: boolean) => {
    const pc = pcRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      pcRef.current = null;
    }
    if (stopStream && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    videoEnabledRef.current = false;
    setMicMuted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public actions ──────────────────────────────────────────────
  const startCall = useCallback(
    async (video: boolean) => {
      const sock = socketRef.current;
      if (!sock || rawRef.current.status !== 'none') return;
      videoEnabledRef.current = video;
      update({ status: 'outgoing', peer: partner, video, incoming: false });
      sock.emit('call:request', { exchangeId });
    },
    [exchangeId, partner, update]
  );

  const acceptCall = useCallback(async () => {
    const sock = socketRef.current;
    if (!sock || rawRef.current.status !== 'incoming') return;
    update({ status: 'active', incoming: false });
    sock.emit('call:accept', { exchangeId });
    await startPeer(true);
  }, [exchangeId, startPeer, update]);

  const declineCall = useCallback(() => {
    const sock = socketRef.current;
    if (!sock) return;
    sock.emit('call:reject', { exchangeId });
    cleanup(true);
    update({ status: 'none', incoming: false });
  }, [exchangeId, cleanup, update]);

  const hangup = useCallback(() => {
    const sock = socketRef.current;
    if (sock) sock.emit('call:hangup', { exchangeId });
    cleanup(true);
    update({ status: 'none', incoming: false });
  }, [exchangeId, cleanup, update]);

  const toggleMic = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !stream.getAudioTracks().some((t) => !t.enabled);
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMicMuted(next);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || stream.getVideoTracks().length === 0) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setState((s) => ({ ...s, video: stream.getVideoTracks()[0].enabled }));
  }, []);

  return {
    state,
    micMuted,
    startCall,
    acceptCall,
    declineCall,
    hangup,
    toggleMic,
    toggleCamera,
    localVideoRef,
    remoteVideoRef,
  };
}

export function CallOverlay({
  call,
  partner,
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
  partner: Peer;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  micMuted: boolean;
  localVideoRef: { current: HTMLVideoElement | null };
  remoteVideoRef: { current: HTMLVideoElement | null };
}) {
  if (call.status === 'none') return null;

  const label =
    call.status === 'outgoing' ? 'Calling…' : call.status === 'incoming' ? 'Incoming call' : 'In a call';
  const ringing = call.status === 'incoming';

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/95 backdrop-blur flex flex-col items-center justify-center p-6 animate-fade-in" style={{ backgroundColor: '#0d0f15cc' }}>
      <div className="w-full max-w-sm text-center">
        {call.status === 'active' && (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-ink-900 mb-4 ring-1 ring-ink-700">
            <video ref={remoteVideoRef as React.RefObject<HTMLVideoElement>} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            <video ref={localVideoRef as React.RefObject<HTMLVideoElement>} autoPlay playsInline muted className="absolute bottom-2 right-2 w-24 h-16 rounded-lg object-cover bg-ink-800 ring-1 ring-ink-600 z-10" />
            <div className="absolute top-2 left-2 text-xs text-cream-50/80 bg-ink-950/60 rounded-full px-2 py-1">
              {call.video ? 'Video call' : 'Voice call'}
            </div>
          </div>
        )}

        <Avatar src={partner.avatarUrl} alt={partner.displayName} size={call.status === 'active' ? 72 : 96} className="mx-auto ring-4 ring-coral-500/30" />
        <h2 className="font-display font-bold text-2xl text-cream-50 mt-4">{partner.displayName}</h2>
        <p className="text-sm text-cream-300 mt-1">
          {ringing ? 'is calling you…' : label}
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          {call.status === 'incoming' && (
            <>
              <button onClick={onAccept} className="w-16 h-16 rounded-full bg-mint-500 text-white flex items-center justify-center shadow-soft-lg active:scale-95">
                <Phone className="w-6 h-6" />
              </button>
              <button onClick={onDecline} className="w-16 h-16 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft-lg active:scale-95">
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          )}
          {(call.status === 'outgoing' || call.status === 'active') && (
            <>
              {call.status === 'active' && (
                <>
                  <button onClick={onToggleCamera} className="w-14 h-14 rounded-full bg-ink-800 text-cream-200 flex items-center justify-center ring-1 ring-ink-600 active:scale-95">
                    <VideoOff className="w-5 h-5" />
                  </button>
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
              <button onClick={onHangup} className="w-16 h-16 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft-lg active:scale-95">
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}