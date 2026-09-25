import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useGlobalSocket } from './SocketContext';
import { CallOverlay, CallStatus, Peer } from '../components/CallOverlay';
import { GroupCallOverlay } from '../components/GroupCallOverlay';
import { ensureMediaPermissions } from '../lib/media-permissions';
import {
  ringIncomingCall,
  stopIncomingCallRing,
  setCallUiActive,
  getCallSoundSource,
  openCallSettings,
} from '../lib/call-notifier';
import { startRingtone, stopRingtone } from '../lib/ringtone';
import { getLaunchedCall, clearLaunchedCall } from '../lib/push';
import { recordLog } from '../lib/call-logs';
import type { CallLog } from '../types';

interface RTCSignal {
  type?: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

/**
 * ICE servers for every peer connection (1:1 and group mesh).
 *
 * STUN on its own is not enough in the real world: carrier-grade NAT is close
 * to universal on mobile networks, and two peers behind CGNAT can only meet
 * through a TURN relay. The previous config listed Metered's Open Relay TURN
 * hosts *without* credentials, so TURN auth always failed and those calls
 * silently fell back to host candidates that can never connect.
 *
 * Supply a real relay at build time and calls work everywhere:
 *
 *   VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349?transport=tls
 *   VITE_TURN_USERNAME=<user>
 *   VITE_TURN_CREDENTIAL=<password>
 *
 * Providers: metered.ca (free tier + REST API for short-lived credentials),
 * Twilio Network Traversal, or a self-hosted coturn. Without them the app still
 * connects on LAN and permissive NATs via public STUN, and the legacy Open Relay
 * hosts are kept as a best-effort fallback — if they reject us, ICE simply moves
 * on to the next candidate.
 */
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  const env = import.meta.env as Record<string, string | undefined>;
  const urls = (env.VITE_TURN_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length > 0) {
    const username = env.VITE_TURN_USERNAME || '';
    const credential = env.VITE_TURN_CREDENTIAL || '';
    servers.push(username ? { urls, username, credential } : { urls });
  } else {
    servers.push({
      urls: [
        'stun:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }
  return servers;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: buildIceServers(),
  // Start gathering before setLocalDescription so the first offer/answer already
  // carries candidates — noticeably faster call setup on mobile.
  iceCandidatePoolSize: 4,
};

export interface CallState {
  status: CallStatus;
  peer: Peer;
  video: boolean;
  incoming: boolean;
  error?: string;
}

export interface CallSummary {
  peer: Peer;
  exchangeId: string;
  durationSec: number;
  video: boolean;
}

export type GroupStatus = 'none' | 'outgoing' | 'incoming' | 'active';
export type GroupPeerState = { mic?: boolean; camera?: boolean };

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
  durationSec: number;
  summary: CallSummary | null;
  clearSummary: () => void;
  openSettings: () => void;
  // group calls (real WebRTC mesh)
  groupStatus: GroupStatus;
  groupVideo: boolean;
  groupHost: Peer | null;
  groupMembers: Peer[];
  groupError?: string;
  groupMicOn: boolean;
  groupCamOn: boolean;
  peerStates: Record<string, GroupPeerState>;
  groupVideoElsRef: React.RefObject<Map<string, HTMLVideoElement>>;
  startGroupCall: (members: Peer[], video: boolean) => Promise<void>;
  agreeGroup: () => void;
  declineGroup: () => void;
  leaveGroup: () => void;
  gToggleMic: () => void;
  gToggleCamera: () => void;
  attachGroupVideo: (memberId: string) => void;
}

const CallsContext = createContext<CallsContextValue | null>(null);

/**
 * App-wide call manager. One socket + one overlay for the whole session, so an
 * incoming call rings from ANY screen (feed, messages, profile, settings …) —
 * and the caller always sees their ringing screen, exactly like WhatsApp.
 * Group calls run as a real WebRTC mesh on the same socket.
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
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
  const activeSinceRef = useRef<number | null>(null);

  const socketRef = useRef(socket);
  socketRef.current = socket;

  // ── Group call state ──────────────────────────────────────────────────────
  const [groupStatus, setGroupStatus] = useState<GroupStatus>('none');
  const [groupVideo, setGroupVideo] = useState(false);
  const [groupHost, setGroupHost] = useState<Peer | null>(null);
  const [groupMembers, setGroupMembers] = useState<Peer[]>([]);
  const [groupError, setGroupError] = useState<string | undefined>();
  const [groupMicOn, setGroupMicOn] = useState(true);
  const [groupCamOn, setGroupCamOn] = useState(false);
  const [peerStates, setPeerStates] = useState<Record<string, GroupPeerState>>({});
  const groupStatusRef = useRef<GroupStatus>('none');
  groupStatusRef.current = groupStatus;
  const groupMembersRef = useRef<Peer[]>([]);
  groupMembersRef.current = groupMembers;
  const groupVideoRef = useRef(false);
  groupVideoRef.current = groupVideo;
  const groupIdRef = useRef('');
  const groupActiveSinceRef = useRef<number | null>(null);
  const groupPcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const groupQueuedCandsRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const groupRemoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const groupVideoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const myId = (user as any)?.id ?? '';

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
            // Our media path died (network change, relay gave up). Tell the
            // other person instead of leaving them in a frozen call.
            if (pc.connectionState === 'failed' && exchangeIdRef.current) {
              sock.emit('call:hangup', { exchangeId: exchangeIdRef.current });
            }
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

  const cleanupGroupPcs = useCallback((stopStream: boolean) => {
    for (const pc of groupPcsRef.current.values()) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // Already closed.
      }
    }
    groupPcsRef.current.clear();
    groupQueuedCandsRef.current.clear();
    groupRemoteStreamsRef.current.clear();
    groupVideoElsRef.current.clear();
    setPeerStates({});
    if (stopStream && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Group mesh: peer connections ──────────────────────────────────────────
  const attachGroupVideo = useCallback((memberId: string) => {
    const el = groupVideoElsRef.current.get(memberId);
    const stream = groupRemoteStreamsRef.current.get(memberId);
    if (el && stream) {
      el.srcObject = stream;
      (el as any).playsInline = true;
      (el as any).play?.().catch(() => {});
    }
  }, []);

  const ensureGroupPc = useCallback(
    async (memberId: string): Promise<RTCPeerConnection | null> => {
      const sock = socketRef.current;
      if (!sock || !memberId || memberId === myId) return null;
      const existing = groupPcsRef.current.get(memberId);
      if (existing) return existing;
      let stream = streamRef.current;
      if (!stream) {
        const got = await acquireLocalStream(groupVideoRef.current);
        if (!got) {
          setGroupError('Microphone or camera access was denied. Allow access, then try again.');
          return null;
        }
        stream = streamRef.current;
      }
      if (!stream) return null;
      attachLocal(stream);
      const pc = new RTCPeerConnection(RTC_CONFIG);
      groupPcsRef.current.set(memberId, pc);
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sock.emit('group:signal', {
            id: groupIdRef.current,
            to: memberId,
            signal: { type: 'candidate', candidate: ev.candidate.toJSON() },
          });
        }
      };
      pc.ontrack = (ev) => {
        if (ev.streams[0]) {
          groupRemoteStreamsRef.current.set(memberId, ev.streams[0]);
          attachGroupVideo(memberId);
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          groupPcsRef.current.delete(memberId);
          groupRemoteStreamsRef.current.delete(memberId);
        }
      };
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      return pc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myId, attachLocal, attachGroupVideo, acquireLocalStream]
  );

  // Lowest userId offers to avoid glare; the higher id waits and answers.
  const establishGroupPcs = useCallback(async () => {
    const sock = socketRef.current;
    if (!sock) return;
    const members = groupMembersRef.current;
    for (const m of members) {
      if (m.id === myId) continue;
      const pc = await ensureGroupPc(m.id);
      if (!pc || pc.remoteDescription) continue;
      if (myId < m.id) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sock.emit('group:signal', {
            id: groupIdRef.current,
            to: m.id,
            signal: { type: 'offer', sdp: pc.localDescription?.sdp },
          });
        } catch {
          // Retried when the next roster/state change arrives.
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, ensureGroupPc]);

  const endGroupCall = useCallback(() => {
    cleanupGroupPcs(true);
    groupIdRef.current = '';
    groupActiveSinceRef.current = null;
    setGroupStatus('none');
    setGroupVideo(false);
    setGroupHost(null);
    setGroupMembers([]);
    setGroupError(undefined);
    setGroupMicOn(true);
    setGroupCamOn(false);
    void setCallUiActive(false);
  }, [cleanupGroupPcs]);

  // ── Group signaling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onSignaled = async (p: { id: string; from: string; signal: RTCSignal }) => {
      if (p.id !== groupIdRef.current || !p.from || p.from === myId) return;
      const pc = await ensureGroupPc(p.from);
      if (!pc) return;
      try {
        if (p.signal.type === 'offer' || p.signal.type === 'answer') {
          await pc.setRemoteDescription({ type: p.signal.type, sdp: p.signal.sdp });
          const queued = groupQueuedCandsRef.current.get(p.from) || [];
          groupQueuedCandsRef.current.delete(p.from);
          for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
          if (p.signal.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('group:signal', {
              id: groupIdRef.current,
              to: p.from,
              signal: { type: 'answer', sdp: pc.localDescription?.sdp },
            });
          }
        } else if (p.signal.type === 'candidate') {
          if (pc.remoteDescription) await pc.addIceCandidate(p.signal.candidate);
          else {
            const q = groupQueuedCandsRef.current.get(p.from) || [];
            q.push(p.signal.candidate!);
            groupQueuedCandsRef.current.set(p.from, q);
          }
        }
      } catch {
        // Ignore — the next signal retries negotiation.
      }
    };

    const onGroupRinging = (p: { id: string; video?: boolean; host: Peer }) => {
      if (!p.host || p.host.id === myId) return;
      if (groupStatusRef.current !== 'none' || statusRef.current !== 'none') return;
      groupIdRef.current = p.id;
      setGroupVideo(!!p.video);
      setGroupHost(p.host);
      setGroupMembers([
        {
          id: p.host.id,
          displayName: p.host.displayName,
          avatarUrl: p.host.avatarUrl ?? null,
          avatarFrame: p.host.avatarFrame ?? null,
        },
      ]);
      setGroupError(undefined);
      setGroupStatus('incoming');
    };

    const onGroupStarted = (p: { id: string; video?: boolean; members: Peer[] }) => {
      groupIdRef.current = p.id;
      setGroupVideo(!!p.video);
      void setCallUiActive(true);
      setGroupStatus('active');
      setGroupMembers((prev) => {
        const merged = [...prev];
        for (const m of p.members || []) if (!merged.some((x) => x.id === m.id)) merged.push(m);
        return merged;
      });
      void establishGroupPcs();
    };

    const onGroupJoined = async (p: { id: string; hostId: string; video?: boolean; members: Peer[] }) => {
      groupIdRef.current = p.id;
      setGroupVideo(!!p.video);
      setCallUiActive(true);
      setGroupStatus('active');
      const peers: Peer[] = [];
      if (p.hostId) {
        const host = groupMembersRef.current.find((m) => m.id === p.hostId);
        if (host) peers.push(host);
      }
      for (const m of p.members || []) if (!peers.some((x) => x.id === m.id)) peers.push(m);
      const me: Peer = { id: myId, displayName: user?.displayName ?? 'You' };
      if (!peers.some((x) => x.id === myId)) peers.push(me);
      setGroupMembers(peers);
      void establishGroupPcs();
      socket.emit('group:call:update', { id: p.id, mic: true, camera: groupVideoRef.current });
    };

    const onMemberJoined = (p: { id: string; userId: string; peer: Peer }) => {
      if (p.id !== groupIdRef.current || !p.peer || p.userId === myId) return;
      setGroupMembers((prev) => (prev.some((x) => x.id === p.peer.id) ? prev : [...prev, p.peer]));
      void establishGroupPcs();
    };

    const onMemberLeft = (p: { id: string; userId: string }) => {
      if (p.id !== groupIdRef.current) return;
      setGroupMembers((prev) => prev.filter((m) => m.id !== p.userId));
      const pc = groupPcsRef.current.get(p.userId);
      if (pc) {
        try {
          pc.close();
        } catch {
          // Already closed.
        }
        groupPcsRef.current.delete(p.userId);
      }
      groupRemoteStreamsRef.current.delete(p.userId);
      groupVideoElsRef.current.delete(p.userId);
    };

    const onPeerUpdate = (p: { id: string; userId: string; mic?: boolean; camera?: boolean }) => {
      if (p.id !== groupIdRef.current || p.userId === myId) return;
      setPeerStates((prev) => ({ ...prev, [p.userId]: { mic: p.mic, camera: p.camera } }));
    };

    const onGroupEnded = (p: { id: string }) => {
      if (p.id !== groupIdRef.current) return;
      endGroupCall();
    };

    socket.on('group:signal', onSignaled);
    socket.on('group:call:ringing', onGroupRinging);
    socket.on('group:call:started', onGroupStarted);
    socket.on('group:call:joined', onGroupJoined);
    socket.on('group:call:member:joined', onMemberJoined);
    socket.on('group:call:member:left', onMemberLeft);
    socket.on('group:call:member:rejected', onMemberLeft);
    socket.on('group:call:peer:update', onPeerUpdate);
    socket.on('group:call:ended', onGroupEnded);

    return () => {
      socket.off('group:signal', onSignaled);
      socket.off('group:call:ringing', onGroupRinging);
      socket.off('group:call:started', onGroupStarted);
      socket.off('group:call:joined', onGroupJoined);
      socket.off('group:call:member:joined', onMemberJoined);
      socket.off('group:call:member:left', onMemberLeft);
      socket.off('group:call:member:rejected', onMemberLeft);
      socket.off('group:call:peer:update', onPeerUpdate);
      socket.off('group:call:ended', onGroupEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, myId, endGroupCall, ensureGroupPc, establishGroupPcs]);

  // ── Socket events ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onRinging = (p: { exchangeId: string; caller: Peer; video?: boolean }) => {
      if (p.caller.id === (user as any)?.id) return;
      if (status !== 'none' || groupStatusRef.current !== 'none') return;
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
    void setCallUiActive(status !== 'none' || groupStatusRef.current !== 'none');
    if (status === 'incoming') {
      void ringIncomingCall(peer, getCallSoundSource());
      startRingtone(true);
    } else if (status === 'outgoing') {
      startRingtone(false);
    } else {
      stopRingtone();
      void stopIncomingCallRing();
      void setCallUiActive(status !== 'none' || groupStatusRef.current !== 'none');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, peer.id]);

  useEffect(() => {
    if (groupStatus === 'incoming' && groupHost?.displayName) {
      void ringIncomingCall({ displayName: groupHost.displayName }, getCallSoundSource());
      startRingtone(true);
      void setCallUiActive(true);
    } else if (groupStatus === 'outgoing') {
      startRingtone(false);
      void setCallUiActive(true);
    } else if (groupStatus === 'active') {
      stopRingtone();
      void stopIncomingCallRing();
    } else {
      stopRingtone();
      void stopIncomingCallRing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupStatus, groupHost?.id]);

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

  // ── Call timer (1:1 + group) ──────────────────────────────────────────────
  useEffect(() => {
    if (status === 'active' && !activeSinceRef.current) activeSinceRef.current = Date.now();
    if (groupStatus === 'active' && !groupActiveSinceRef.current) groupActiveSinceRef.current = Date.now();
    if (status !== 'active' && groupStatus !== 'active') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status, groupStatus]);

  // ── Local call history (recorded wherever the call was started) ───────────
  const callGateRef = useRef(false);
  const callWasActiveRef = useRef(false);
  const iAmCallerRef = useRef(false);

  useEffect(() => {
    const s = status;
    if (s === 'outgoing') {
      callGateRef.current = true;
      iAmCallerRef.current = true;
    }
    if (s === 'incoming') {
      callGateRef.current = true;
      iAmCallerRef.current = false;
    }
    if (s === 'active') {
      callWasActiveRef.current = true;
      if (!activeSinceRef.current) activeSinceRef.current = Date.now();
    }
    if (s === 'none' && callGateRef.current) {
      callGateRef.current = false;
      const wasActive = callWasActiveRef.current;
      const startedAt = activeSinceRef.current ? new Date(activeSinceRef.current).toISOString() : new Date().toISOString();
      const durationSec = activeSinceRef.current ? Math.max(1, Math.round((Date.now() - activeSinceRef.current) / 1000)) : 0;
      callWasActiveRef.current = false;
      activeSinceRef.current = null;
      const endedAt = new Date().toISOString();
      const myName = user?.displayName || 'You';
      const peerName = peer.displayName || 'Friend';
      if (exchangeIdRef.current && peer.id) {
        const entry: CallLog = {
          id: `local-${Date.now()}`,
          exchangeId: exchangeIdRef.current,
          callerId: iAmCallerRef.current ? myId : peer.id,
          calleeId: iAmCallerRef.current ? peer.id : myId,
          callerName: iAmCallerRef.current ? myName : peerName,
          calleeName: iAmCallerRef.current ? peerName : myName,
          type: video ? 'VIDEO' : 'VOICE',
          outcome: wasActive ? 'COMPLETED' : 'DECLINED',
          startedAt,
          endedAt,
          createdAt: endedAt,
        };
        recordLog(exchangeIdRef.current, entry);
        if (wasActive) {
          setSummary({ peer, exchangeId: exchangeIdRef.current, durationSec, video });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ── Public actions (1:1) ───────────────────────────────────────────────────
  const startCall = useCallback(
    async (targetPeer: Peer, exchangeId: string, targetVideo: boolean) => {
      const sock = socketRef.current;
      if (!sock || status !== 'none' || groupStatusRef.current !== 'none') return;
      setSummary(null);
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

  // ── Public actions (group) ─────────────────────────────────────────────────
  const startGroupCall = useCallback(
    async (members: Peer[], wantVideo: boolean) => {
      const sock = socketRef.current;
      if (!sock || members.length === 0 || status !== 'none' || groupStatusRef.current !== 'none') return;
      const unique = members.filter((m) => m.id && m.id !== myId);
      if (unique.length === 0) return;
      let videoOn = wantVideo;
      try {
        const got = await acquireLocalStream(wantVideo);
        if (!got) {
          setGroupError('Microphone or camera access was denied. Allow access in your device settings, then try again.');
          setGroupStatus('none');
          return;
        }
        if (!got.hasVideo) videoOn = false;
      } catch {
        setGroupError('Microphone or camera access was denied. Allow access in your device settings, then try again.');
        setGroupStatus('none');
        return;
      }
      const host: Peer = { id: myId, displayName: user?.displayName ?? 'You', avatarUrl: null, avatarFrame: null };
      setGroupVideo(videoOn);
      setGroupHost(host);
      setGroupMembers([host, ...unique]);
      groupMembersRef.current = [host, ...unique];
      setPeerStates({});
      setGroupError(undefined);
      setGroupMicOn(true);
      setGroupCamOn(videoOn);
      groupIdRef.current = '';
      setGroupStatus('outgoing');
      void setCallUiActive(true);
      sock.emit('group:call:start', { memberIds: unique.map((m) => m.id), video: videoOn });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myId, user?.displayName, status, acquireLocalStream]
  );

  const agreeGroup = useCallback(async () => {
    const sock = socketRef.current;
    if (!sock || groupStatusRef.current !== 'incoming') return;
    try {
      const got = await acquireLocalStream(groupVideoRef.current);
      if (!got) {
        setGroupError('Microphone or camera access was denied. Allow access in your device settings, then try again.');
        sock.emit('group:call:reject', { id: groupIdRef.current });
        endGroupCall();
        return;
      }
      if (!got.hasVideo) setGroupVideo(false);
      setGroupMicOn(true);
      setGroupCamOn(!!got.hasVideo);
    } catch {
      sock.emit('group:call:reject', { id: groupIdRef.current });
      setGroupError('Microphone or camera access was denied. Allow access in your device settings, then try again.');
      endGroupCall();
      return;
    }
    setGroupError(undefined);
    sock.emit('group:call:accept', { id: groupIdRef.current });
    void setCallUiActive(true);
  }, [acquireLocalStream, endGroupCall]);

  const declineGroup = useCallback(() => {
    socketRef.current?.emit('group:call:reject', { id: groupIdRef.current });
    endGroupCall();
  }, [endGroupCall]);

  const leaveGroup = useCallback(() => {
    socketRef.current?.emit('group:call:leave', { id: groupIdRef.current });
    endGroupCall();
  }, [endGroupCall]);

  const gToggleMic = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !stream.getAudioTracks().some((t) => !t.enabled);
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setGroupMicOn(!next);
    socketRef.current?.emit('group:call:update', { id: groupIdRef.current, mic: !next });
  }, []);

  const gToggleCamera = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || stream.getVideoTracks().length === 0) return;
    const on = !stream.getVideoTracks()[0].enabled;
    stream.getVideoTracks().forEach((t) => (t.enabled = on));
    setGroupCamOn(on);
    socketRef.current?.emit('group:call:update', { id: groupIdRef.current, camera: on });
  }, []);

  const clearSummary = useCallback(() => setSummary(null), []);

  const durationSec = activeSinceRef.current ? Math.max(0, Math.round((now - activeSinceRef.current) / 1000)) : 0;
  const groupDurationSec = groupActiveSinceRef.current
    ? Math.max(0, Math.round((now - groupActiveSinceRef.current) / 1000))
    : 0;

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
    durationSec,
    summary,
    clearSummary,
    openSettings: openCallSettings,
    groupStatus,
    groupVideo,
    groupHost,
    groupMembers,
    groupError,
    groupMicOn,
    groupCamOn,
    peerStates,
    groupVideoElsRef,
    startGroupCall,
    agreeGroup,
    declineGroup,
    leaveGroup,
    gToggleMic,
    gToggleCamera,
    attachGroupVideo,
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
        onOpenSettings={openCallSettings}
        micMuted={micMuted}
        cameraAvailable={cameraAvailable}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        durationSec={durationSec}
        exchangeId={exchangeIdRef.current}
        summary={summary}
        onClearSummary={clearSummary}
        onRedial={(p, ex, v) => void startCall(p, ex, v)}
        onMessage={(ex) => {
          setSummary(null);
          nav(`/messages/${ex}`);
        }}
      />
      <GroupCallOverlay
        status={groupStatus}
        video={groupVideo}
        host={groupHost}
        members={groupMembers}
        error={groupError}
        micOn={groupMicOn}
        camOn={groupCamOn}
        peerStates={peerStates}
        meId={myId}
        durationSec={groupDurationSec}
        videoElsRef={groupVideoElsRef}
        attachVideo={attachGroupVideo}
        onAccept={agreeGroup}
        onDecline={declineGroup}
        onLeave={leaveGroup}
        onToggleMic={gToggleMic}
        onToggleCamera={gToggleCamera}
        onOpenSettings={openCallSettings}
      />
    </CallsContext.Provider>
  );
}

export function useCalls(): CallsContextValue {
  const ctx = useContext(CallsContext);
  if (!ctx) throw new Error('useCalls must be used within <CallsProvider>');
  return ctx;
}
