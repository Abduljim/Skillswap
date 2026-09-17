import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useGlobalSocket } from './SocketContext';
import { CallOverlay, CallStatus, Peer } from '../components/CallOverlay';
import { ensureMediaPermissions } from '../lib/media-permissions';
import {
  ringIncomingCall,
  stopIncomingCallRing,
  setCallUiActive,
  getCallSoundSource,
} from '../lib/call-notifier';
import { startRingtone, stopRingtone } from '../lib/ringtone';
import { getLaunchedCall, clearLaunchedCall } from '../lib/push';

interface RTCSignal {
  type?: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    { urls: 'turn:openrelay.metered.ca:80' },
    { urls: 'turn:openrelay.metered.ca:443' },
  ],
};

export interface CallState {
  status: CallStatus;
  peer: Peer;
  video: boolean;
  incoming: boolean;
  error?: string;
}

interface CallsContextValue extends CallState {
  micMuted: boolean;
  cameraAvailable: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  startCall: (peer: Peer, exchangeId: string, video: boolean) => Promise<void>;
  acceptCall: () => void;
  declineCall: () => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
}

const CallsContext = createContext<CallsContextValue | null>(null);

/**
 * App-wide call manager. One socket + one overlay for the whole session, so an
 * incoming call rings from ANY screen (feed, messages, profile, settings …) —
 * and the caller always sees their ringing screen, exactly like WhatsApp.
 */
export function CallsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { socket } = useGlobalSocket();
  const nav = useNavigate();

  const [status, setStatus] = useState<CallStatus>('none');
  const [peer, setPeer] = useState<Peer>({ id: '', displayName: '' });
  const [video, setVideo] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [micMuted, setMicMuted] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const statusRef = useRef<CallStatus>('none');
  statusRef.current = status;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const videoEnabledRef = useRef(false);
  const peerIdRef = useRef('');
  const exchangeIdRef = useRef('');
  const pendingSignalsRef = useRef<RTCSignal[]>([]);

  const socketRef = useRef(socket);
  socketRef.current = socket;

  const update = useCallback(
    (patch: Partial<{ status: CallStatus; peer: Peer; video: boolean; incoming: boolean; error?: string }>) => {
      if (patch.status !== undefined) setStatus(patch.status);
      if (patch.peer !== undefined) setPeer(patch.peer);
      if (patch.video !== undefined) setVideo(patch.video);
      if (patch.incoming !== undefined) setIncoming(patch.incoming);
      if (patch.error !== undefined) setError(patch.error);
    },
    []
  );

  // ── Media acquisition (with native grant, retry, and voice fallback) ──────
  const acquireLocalStream = useCallback(async (wantVideo: boolean) => {
    if (streamRef.current) {
      const hasVideo = streamRef.current.getVideoTracks().length > 0;
      if (wantVideo === hasVideo) return { stream: streamRef.current, hasVideo };
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    await ensureMediaPermissions();
    await new Promise((r) => setTimeout(r, 250));
    let got = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo }).catch(() => null);
    if (!got) {
      await ensureMediaPermissions();
      await new Promise((r) => setTimeout(r, 400));
      got = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo }).catch(() => null);
    }
    let hasVideo = wantVideo && !!got;
    if (!got) {
      got = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => null);
      hasVideo = false;
    }
    if (!got) return null;
    streamRef.current = got;
    setCameraAvailable(got.getVideoTracks().length > 0);
    return { stream: got, hasVideo };
  }, []);

  // ── Peer connection + signaling ────────────────────────────────────────────
  const attachRemote = useCallback((stream: MediaStream) => {
    remoteStreamRef.current = stream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      (remoteVideoRef.current as any).playsInline = true;
      (remoteVideoRef.current as any).play?.().catch(() => {});
    }
  }, []);

  const attachLocal = useCallback((stream: MediaStream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      (localVideoRef.current as any).playsInline = true;
      (localVideoRef.current as any).play?.().catch(() => {});
    }
  }, []);

  const handleSignal = useCallback(async (pc: RTCPeerConnection, sig: RTCSignal) => {
    try {
      if (sig.type === 'offer' || sig.type === 'answer') {
        await pc.setRemoteDescription({ type: sig.type, sdp: sig.sdp });
        for (const c of candidateQueueRef.current) await pc.addIceCandidate(c).catch(() => {});
        candidateQueueRef.current = [];
        if (sig.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketRef.current?.emit('webrtc:signal', {
            exchangeId: exchangeIdRef.current,
            to: peerIdRef.current,
            signal: { type: 'answer', sdp: pc.localDescription?.sdp },
          });
        }
      } else if (sig.type === 'candidate') {
        if (pc.remoteDescription) await pc.addIceCandidate(sig.candidate);
        else candidateQueueRef.current.push(sig.candidate!);
      }
    } catch {
      // Ignore — ICE/negotiation races are retried on the next signal.
    }
  }, []);

  const startPeer = useCallback(
    async (isCallee: boolean) => {
      const sock = socketRef.current;
      if (!sock) return;
      let pc: RTCPeerConnection;
      try {
        let stream = streamRef.current;
        if (!stream) {
          await ensureMediaPermissions();
          stream = await navigator.mediaDevices
            .getUserMedia({ audio: true, video: videoEnabledRef.current })
            .catch(() => null);
        }
        if (!stream) throw new Error('No media available');
        streamRef.current = stream;

        pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            sock.emit('webrtc:signal', {
              exchangeId: exchangeIdRef.current,
              to: peerIdRef.current,
              signal: { type: 'candidate', candidate: ev.candidate.toJSON() },
            });
          }
        };
        pc.ontrack = (ev) => {
          if (ev.streams[0]) attachRemote(ev.streams[0]);
        };
        pc.onconnectionstatechange = () => {
          if (
            (pc.connectionState === 'failed' || pc.connectionState === 'closed') &&
            statusRef.current === 'active'
          ) {
            cleanup(true);
            update({ status: 'none', incoming: false });
          }
        };

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        attachLocal(stream);

        const queued = pendingSignalsRef.current;
        pendingSignalsRef.current = [];
        for (const sig of queued) await handleSignal(pc, sig);

        if (isCallee && !pc.remoteDescription) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sock.emit('webrtc:signal', {
            exchangeId: exchangeIdRef.current,
            to: peerIdRef.current,
            signal: { type: 'offer', sdp: pc.localDescription?.sdp },
          });
        }
      } catch (e: any) {
        console.error('[CALL] setup failed', e);
        cleanup(true);
        update({ status: 'error' });
        const reason = e && e.name && e.name !== 'No media available' ? ` (${String(e.name).slice(0, 60)})` : '';
        setError(
          'Could not access the camera or microphone. Let the app use your camera and mic in Settings, then try again.' +
            reason
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleSignal, attachLocal, attachRemote]
  );

  const cleanup = useCallback((stopStream: boolean) => {
    const pc = pcRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcRef.current = null;
    }
    if (stopStream && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    candidateQueueRef.current = [];
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    videoEnabledRef.current = false;
    setMicMuted(false);
  }, []);

  // ── Socket events ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onRinging = (p: { exchangeId: string; caller: Peer; video?: boolean }) => {
      if (p.caller.id === (user as any)?.id) return;
      if (status !== 'none') return;
      peerIdRef.current = p.caller.id;
      exchangeIdRef.current = p.exchangeId;
      videoEnabledRef.current = !!p.video;
      update({
        status: 'incoming',
        peer: {
          id: p.caller.id,
          displayName: p.caller.displayName,
          avatarUrl: p.caller.avatarUrl ?? null,
          avatarFrame: p.caller.avatarFrame ?? null,
        },
        video: !!p.video,
        incoming: true,
        error: undefined,
      });
    };

    const onAccepted = (p: { exchangeId: string }) => {
      if (p.exchangeId !== exchangeIdRef.current || status !== 'outgoing') return;
      update({ status: 'active', incoming: false });
      startPeer(false).catch(() => {});
    };

    const onRejected = (p: { exchangeId: string }) => {
      if (p.exchangeId !== exchangeIdRef.current || status !== 'outgoing') return;
      cleanup(true);
      update({ status: 'none', incoming: false });
    };

    const onEnded = (p: { exchangeId: string }) => {
      if (p.exchangeId !== exchangeIdRef.current) return;
      if (status === 'none') return;
      cleanup(true);
      update({ status: 'none', incoming: false });
    };

    const onSignal = (p: { exchangeId: string; from: string; signal: RTCSignal }) => {
      if (p.exchangeId !== exchangeIdRef.current || p.from !== peerIdRef.current) return;
      if (pcRef.current) handleSignal(pcRef.current, p.signal);
      else pendingSignalsRef.current.push(p.signal);
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
  }, [socket, user?.id, status]);

  // ── Global ring / ringback + full-screen immersive call UI ────────────────
  useEffect(() => {
    void setCallUiActive(status !== 'none');
    if (status === 'incoming') {
      void ringIncomingCall(peer, getCallSoundSource());
      startRingtone(true);
    } else if (status === 'outgoing') {
      startRingtone(false);
    } else {
      stopRingtone();
      void stopIncomingCallRing();
      void setCallUiActive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, peer.id]);

  // ── Opened from an FCM incoming-call notification ──────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getLaunchedCall().then((call) => {
      if (cancelled || !call?.exchangeId || status !== 'none') return;
      void clearLaunchedCall();
      exchangeIdRef.current = call.exchangeId;
      peerIdRef.current = call.callerId || '';
      videoEnabledRef.current = call.video;
      update({
        status: 'incoming',
        peer: { id: call.callerId || '', displayName: call.callerName || 'Caller', avatarUrl: null, avatarFrame: null },
        video: call.video,
        incoming: true,
        error: undefined,
      });
      nav(`/messages/${call.exchangeId}`);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Re-attach video tracks when the active video UI mounts ────────────────
  useEffect(() => {
    if (status !== 'active') return;
    attachRemote(remoteStreamRef.current as MediaStream);
    attachLocal(streamRef.current as MediaStream);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, video]);

  // ── Public actions ─────────────────────────────────────────────────────────
  const startCall = useCallback(
    async (targetPeer: Peer, exchangeId: string, targetVideo: boolean) => {
      const sock = socketRef.current;
      if (!sock || status !== 'none') return;
      peerIdRef.current = targetPeer.id;
      exchangeIdRef.current = exchangeId;
      videoEnabledRef.current = targetVideo;
      update({ status: 'outgoing', peer: targetPeer, video: targetVideo, incoming: false, error: undefined });
      try {
        const got = await acquireLocalStream(targetVideo);
        if (!got) {
          update({ status: 'error' });
          setError('Microphone or camera access was denied. Allow access in your device settings, then try again.');
          return;
        }
        if (!got.hasVideo) {
          videoEnabledRef.current = false;
          update({ status: 'outgoing', peer: targetPeer, video: false, incoming: false, error: undefined });
        }
      } catch (e) {
        console.error('[CALL] media denied', e);
        update({ status: 'error' });
        setError('Microphone or camera access was denied. Allow access in your device settings, then try again.');
        return;
      }
      sock.emit('call:request', { exchangeId, video: videoEnabledRef.current });
    },
    [status, update, acquireLocalStream]
  );

  const acceptCall = useCallback(async () => {
    const sock = socketRef.current;
    if (!sock || status !== 'incoming') return;
    try {
      const got = await acquireLocalStream(videoEnabledRef.current);
      if (!got) {
        update({ status: 'error' });
        setError('Microphone or camera access was denied. Allow access in your device settings, then try again.');
        return;
      }
      if (!got.hasVideo) videoEnabledRef.current = false;
    } catch {
      sock.emit('call:reject', { exchangeId: exchangeIdRef.current });
      update({ status: 'error' });
      setError('Microphone or camera access was denied. Allow access in your device settings, then try again.');
      return;
    }
    update({ status: 'active', incoming: false, video: videoEnabledRef.current, error: undefined });
    sock.emit('call:accept', { exchangeId: exchangeIdRef.current });
    startPeer(true).catch(() => {});
  }, [status, update, acquireLocalStream, startPeer]);

  const declineCall = useCallback(() => {
    const sock = socketRef.current;
    if (!sock) return;
    sock.emit('call:reject', { exchangeId: exchangeIdRef.current });
    cleanup(true);
    update({ status: 'none', incoming: false });
  }, [cleanup, update]);

  const hangup = useCallback(() => {
    const sock = socketRef.current;
    if (sock && status !== 'none') sock.emit('call:hangup', { exchangeId: exchangeIdRef.current });
    cleanup(true);
    update({ status: 'none', incoming: false });
  }, [status, cleanup, update]);

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
    const on = !stream.getVideoTracks()[0].enabled;
    stream.getVideoTracks().forEach((t) => (t.enabled = on));
    setVideo(on);
  }, []);

  const value: CallsContextValue = {
    status,
    peer,
    video,
    incoming,
    error,
    micMuted,
    cameraAvailable,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    declineCall,
    hangup,
    toggleMic,
    toggleCamera,
  };

  return (
    <CallsContext.Provider value={value}>
      {children}
      <CallOverlay
        call={{ status, peer, video, incoming, error }}
        onAccept={() => void acceptCall()}
        onDecline={declineCall}
        onHangup={hangup}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        micMuted={micMuted}
        cameraAvailable={cameraAvailable}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
      />
    </CallsContext.Provider>
  );
}

export function useCalls(): CallsContextValue {
  const ctx = useContext(CallsContext);
  if (!ctx) throw new Error('useCalls must be used within <CallsProvider>');
  return ctx;
}