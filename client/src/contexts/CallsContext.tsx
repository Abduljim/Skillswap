import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useGlobalSocket } from './SocketContext';
import { CallOverlay, CallStatus, Peer } from '../components/CallOverlay';
import { GroupCallOverlay } from '../components/GroupCallOverlay';
import { ensureMediaPermissions } from '../lib/media-permissions';
import { notifyCallPermissionNeeded } from '../lib/permission-gate';
import {
  ringIncomingCall,
  stopIncomingCallRing,
  setCallUiActive,
  getCallSoundSource,
  openCallSettings,
} from '../lib/call-notifier';
import { startRingtone, stopRingtone } from '../lib/ringtone';
import { getLaunchedCall, clearLaunchedCall, getLaunchAction, type LaunchedCall } from '../lib/push';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { recordLog } from '../lib/call-logs';
import {
  getIceConfig,
  getCallLimits,
  invalidateIceConfig,
  DEFAULT_CALL_LIMITS,
} from '../lib/ice';
import type { CallLog } from '../types';

interface RTCSignal {
  type?: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

/**
 * ICE servers for every peer connection (1:1 and group mesh).
 *
 * STUN alone is not enough in the real world: carrier-grade NAT is close to
 * universal on mobile networks, and two peers behind CGNAT can only meet through
 * a TURN relay.
 *
 * Credentials are minted by the API per session (GET /api/calls/ice-servers)
 * instead of being compiled into the app. Anything under VITE_ is readable by
 * anyone who unpacks the APK, and a leaked relay credential is free bandwidth for
 * whoever finds it; a minted credential expires (an hour by default) and the
 * secret never leaves the server. See docs/TURN.md for running coturn for free.
 *
 * Order of preference:
 *   1. credentials minted by the API
 *   2. VITE_TURN_* static credentials, for providers without HMAC support
 *   3. Metered's legacy Open Relay — deprecated and rate-limited, kept only so an
 *      unconfigured deploy can still connect sometimes rather than never
 *
 * With none of them usable, calls still work on a LAN or a permissive NAT via
 * public STUN. `turnConfigured` is what lets the UI say that out loud instead of
 * showing an endless "connecting…".
 */
const OPEN_RELAY: RTCIceServer = {
  urls: [
    'stun:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:443',
    'turn:openrelay.metered.ca:443?transport=tcp',
  ],
  username: 'openrelayproject',
  credential: 'openrelayproject',
};

async function rtcConfig(): Promise<RTCConfiguration> {
  const cfg = await getIceConfig();
  return {
    iceServers: cfg.turnConfigured
      ? (cfg.iceServers as RTCIceServer[])
      : [...cfg.iceServers, OPEN_RELAY],
    // Start gathering before setLocalDescription so the first offer/answer already
    // carries candidates — noticeably faster call setup on mobile.
    iceCandidatePoolSize: 4,
  };
}

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

/**
 * Shown when the OS refuses the microphone or camera.
 *
 * Names the fix. "Access was denied" on a phone the user is holding reads like a
 * broken app, and the toggle is three taps away in Android's own settings.
 */
const MEDIA_DENIED =
  'SkillSwap cannot open the microphone, so this call could not go ahead. Allow it under Settings → Apps → SkillSwap → Permissions → Microphone (and Camera for video), then call again.';

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
  /** True while an active call is collapsed to the floating bar. */
  minimized: boolean;
  minimizeCall: () => void;
  restoreCall: () => void;
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
  startGroupCall: (members: Peer[]) => Promise<void>;
  /** Server-enforced mesh cap, so the picker stops at the same number. */
  maxGroupCallParticipants: number;
  agreeGroup: () => void;
  declineGroup: () => void;
  leaveGroup: () => void;
  gToggleMic: () => void;
  gToggleCamera: () => void;
  attachGroupVideo: (memberId: string) => void;
  /** True while an active group call is collapsed to the floating bar. */
  groupMinimized: boolean;
  minimizeGroupCall: () => void;
  restoreGroupCall: () => void;
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
  const [minimized, setMinimized] = useState(false);

  // Minimising only applies to an established call: the collapsed state is
  // dropped as soon as the call rings, errors or ends, so the incoming-call
  // sheet and the call-ended summary are always full screen.
  useEffect(() => {
    if (status !== 'active') setMinimized(false);
  }, [status]);
  const [now, setNow] = useState(() => Date.now());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const statusRef = useRef<CallStatus>('none');
  statusRef.current = status;

  /**
   * Whether the socket is really connected, as state. Presence has to be
   * re-reported after every reconnect, and an Answer pressed on a call
   * notification has to wait for the socket before it can be sent.
   */
  const [socketConnected, setSocketConnected] = useState(false);

  /** True while the app is on screen; false when backgrounded or the tab is hidden. */
  const [foreground, setForeground] = useState(true);

  /**
   * Answer / Decline pressed on a notification posted while the app was closed.
   * State, not a ref: the response still has to fire when the call sheet is
   * already up and only the socket was missing.
   */
  const [pendingLaunchAction, setPendingLaunchAction] = useState<{
    action: 'answer' | 'decline';
    kind: 'direct' | 'group';
  } | null>(null);

  useEffect(() => {
    if (!socket) return;
    setSocketConnected(socket.connected);
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

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

  // The group-call cap, mirrored from GET /api/calls/limits so the picker stops
  // at the same number the socket layer enforces.
  const [maxGroup, setMaxGroup] = useState<number>(DEFAULT_CALL_LIMITS.maxGroupCallParticipants);
  const maxGroupRef = useRef(maxGroup);
  maxGroupRef.current = maxGroup;

  // Warm the ICE and limits caches on sign-in so pressing "call" does not wait on
  // a round trip, and drop the minted credential on sign-out.
  useEffect(() => {
    if (!(user as any)?.id) return;
    void getIceConfig().catch(() => {});
    void getCallLimits()
      .then((l) => setMaxGroup(l.maxGroupCallParticipants))
      .catch(() => {});
  }, [(user as any)?.id]);
  useEffect(() => () => invalidateIceConfig(), []);

  // ── Group call state ──────────────────────────────────────────────────────
  const [groupStatus, setGroupStatus] = useState<GroupStatus>('none');
  const [groupMinimized, setGroupMinimized] = useState(false);

  // Same rule as the 1:1 call: collapsing is dropped as soon as the group call
  // is ringing, errors or ends, so Join/Decline stays full screen.
  useEffect(() => {
    if (groupStatus !== 'active') setGroupMinimized(false);
  }, [groupStatus]);
  const [groupVideo, setGroupVideo] = useState(false);
  const [groupHost, setGroupHost] = useState<Peer | null>(null);
  const [groupMembers, setGroupMembers] = useState<Peer[]>([]);
  const [groupError, setGroupError] = useState<string | undefined>();
  const [groupMicOn, setGroupMicOn] = useState(true);
  const [groupCamOn, setGroupCamOn] = useState(false);
  const [peerStates, setPeerStates] = useState<Record<string, GroupPeerState>>({});
  const groupStatusRef = useRef<GroupStatus>('none');
  groupStatusRef.current = groupStatus;

  /**
   * A missing relay is the single most common reason a call rings and never
   * connects, and it is invisible to the user: STUN succeeds, both phones think
   * they are calling, and no media ever arrives. Say so while the call is being
   * set up instead of leaving "Ringing…" on screen.
   */
  const [relayHint, setRelayHint] = useState<string | null>(null);
  useEffect(() => {
    if (status === 'none' && groupStatus === 'none') {
      setRelayHint(null);
      return;
    }
    let live = true;
    void getIceConfig().then((cfg) => {
      if (!live) return;
      setRelayHint(
        cfg.turnConfigured
          ? null
          : 'No relay server is configured, so this call only connects when both phones can reach each other directly (usually the same Wi-Fi).'
      );
    });
    return () => {
      live = false;
    };
  }, [status, groupStatus]);
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
    if (!got) {
      // Bring the fix on screen. A denied microphone cannot be solved from
      // inside a call, and the gate owns the one-tap route to Settings.
      notifyCallPermissionNeeded('microphone');
      return null;
    }
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

        pc = new RTCPeerConnection(await rtcConfig());
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
        // Audio-first: a group call never opens the camera on its own. The camera
        // button acquires video later and renegotiates.
        const got = await acquireLocalStream(false);
        if (!got) {
          setGroupError('Microphone access was denied. Allow access, then try again.');
          return null;
        }
        stream = streamRef.current;
      }
      if (!stream) return null;
      attachLocal(stream);
      const pc = new RTCPeerConnection(await rtcConfig());
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
          // Glare: two people can switch their cameras on at the same moment, so an
          // offer can arrive while our own renegotiation offer is in flight. Roll
          // ours back and take theirs (the polite-peer rule) — otherwise
          // setRemoteDescription throws and that mesh leg stays frozen.
          if (
            p.signal.type === 'offer' &&
            pc.signalingState !== 'stable' &&
            pc.signalingState !== 'have-remote-offer'
          ) {
            await pc
              .setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit)
              .catch(() => {});
          }
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

    const onGroupStarted = (p: {
      id: string;
      video?: boolean;
      members: Peer[];
      capped?: boolean;
      maxParticipants?: number;
    }) => {
      groupIdRef.current = p.id;
      // Audio-first: whoever is speaking is not necessarily whoever is filming.
      setGroupVideo(false);
      if (p.capped) {
        setGroupError(
          `Group calls hold ${p.maxParticipants ?? maxGroupRef.current} people — the extra invitees were not called.`
        );
      }
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

    const onGroupFull = (p: { id: string; maxParticipants?: number }) => {
      setGroupError(
        `That group call is already full (${p.maxParticipants ?? maxGroupRef.current} people max).`
      );
      endGroupCall();
    };

    // A group call the server will not start. Same shape as `group:call:full`:
    // say why, then tear the host out of "Ringing…".
    const onGroupCallError = (p: { message?: string; reason?: string }) => {
      setGroupError(p?.message || 'That group call could not be started.');
      endGroupCall();
    };

    socket.on('group:signal', onSignaled);
    socket.on('group:call:full', onGroupFull);
    socket.on('group:call:error', onGroupCallError);
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
      socket.off('group:call:full', onGroupFull);
      socket.off('group:call:error', onGroupCallError);
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

    const onRejected = (p: { exchangeId: string; reason?: string }) => {
      if (p.exchangeId !== exchangeIdRef.current || status !== 'outgoing') return;
      cleanup(true);
      // A phone that could not open its microphone says so. Without this the
      // call just vanishes for the caller, which reads as a broken app rather
      // than "their mic is off".
      if (p.reason === 'media-denied') {
        update({
          status: 'error',
          incoming: false,
          error: `${peer.displayName || 'They'} could not answer — microphone access is off on their phone.`,
        });
        return;
      }
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

    // The server refuses a call on `call:error`. Before this existed the caller
    // watched "Ringing…" forever — the refusal happens before the ring timer is
    // armed, so no `call:ended` follows — and startCall() then refused every
    // later attempt because status was no longer 'none'. Resetting here is what
    // makes the next call possible.
    const onCallError = (p: { exchangeId?: string; message?: string; reason?: string }) => {
      // Only the socket that asked is told, but guard anyway: an error about
      // some other conversation must not tear down a live ring.
      if (p?.exchangeId && exchangeIdRef.current && p.exchangeId !== exchangeIdRef.current) {
        return;
      }
      cleanup(true);
      update({
        status: 'error',
        incoming: false,
        error: p?.message || 'That call could not be placed.',
      });
    };

    // Older servers report refusals on the generic event only. Ignored while no
    // call is in progress, so a failed message send does not raise a call sheet.
    const onSocketError = (p: { message?: string }) => {
      const s = statusRef.current;
      if (s !== 'outgoing' && s !== 'incoming') return;
      onCallError({ message: p?.message });
    };

    // A socket that cannot connect makes every call impossible. Say so instead
    // of leaving the caller watching a ring that will never be answered.
    const onConnectError = () => {
      if (statusRef.current !== 'outgoing' && statusRef.current !== 'incoming') return;
      cleanup(true);
      update({
        status: 'error',
        incoming: false,
        error: 'Cannot reach SkillSwap right now. Check your connection, then try again.',
      });
    };

    socket.on('call:ringing', onRinging);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('webrtc:signal', onSignal);
    socket.on('call:error', onCallError);
    socket.on('error', onSocketError);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('call:ringing', onRinging);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('webrtc:signal', onSignal);
      socket.off('call:error', onCallError);
      socket.off('error', onSocketError);
      socket.off('connect_error', onConnectError);
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

  /**
   * Rebuilds the incoming-call sheet from what a notification stored natively —
   * for a call the socket never delivered, because the app was closed.
   */
  const showLaunchedDirectCall = useCallback(
    (call: LaunchedCall) => {
      exchangeIdRef.current = call.exchangeId;
      peerIdRef.current = call.callerId || '';
      videoEnabledRef.current = call.video;
      update({
        status: 'incoming',
        peer: {
          id: call.callerId || '',
          displayName: call.callerName || 'Caller',
          avatarUrl: null,
          avatarFrame: null,
        },
        video: call.video,
        incoming: true,
        error: undefined,
      });
      nav(`/messages/${call.exchangeId}`);
    },
    [nav, update]
  );

  /**
   * The same for a group invite. Mirrors the `group:call:ringing` socket handler
   * field for field, so pressing Answer joins the mesh exactly as it would have
   * if the app had been open when the invite arrived.
   */
  const showLaunchedGroupInvite = useCallback((call: LaunchedCall) => {
    groupIdRef.current = call.groupId || '';
    const host: Peer = {
      id: call.callerId || '',
      displayName: call.callerName || 'Group call',
      avatarUrl: null,
      avatarFrame: null,
    };
    setGroupVideo(!!call.video);
    setGroupHost(host);
    setGroupMembers([host]);
    setGroupError(undefined);
    setGroupStatus('incoming');
  }, []);

  // ── Opened from an FCM incoming-call notification ──────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void Promise.all([getLaunchedCall(), getLaunchAction()]).then(([call, action]) => {
      if (cancelled) return;
      const isGroup = call?.kind === 'group' && !!call.groupId;
      const kind: 'direct' | 'group' = isGroup ? 'group' : 'direct';
      const restorable =
        !!call &&
        (isGroup || !!call.exchangeId) &&
        status === 'none' &&
        groupStatusRef.current === 'none';

      if (!restorable || !call) {
        // Nothing to rebuild — the socket already put a sheet up, or the stored
        // call went stale — but a button press still has to be honoured.
        if (action) {
          setPendingLaunchAction({
            action,
            kind: groupStatusRef.current !== 'none' ? 'group' : kind,
          });
        }
        return;
      }
      void clearLaunchedCall();
      if (isGroup) showLaunchedGroupInvite(call);
      else showLaunchedDirectCall(call);
      if (action) setPendingLaunchAction({ action, kind });
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
          setError(MEDIA_DENIED);
          return;
        }
        if (!got.hasVideo) {
          videoEnabledRef.current = false;
          update({ status: 'outgoing', peer: targetPeer, video: false, incoming: false, error: undefined });
        }
      } catch (e) {
        console.error('[CALL] media denied', e);
        update({ status: 'error' });
        setError(MEDIA_DENIED);
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
        // Reject, exactly as the catch below does. Returning silently left the
        // caller on "Ringing…" until the server's ring timeout, with no way to
        // tell a dead microphone from being ignored — which is what made this
        // look like calls simply did not work in either direction.
        sock.emit('call:reject', {
          exchangeId: exchangeIdRef.current,
          reason: 'media-denied',
        });
        update({ status: 'error', error: MEDIA_DENIED });
        return;
      }
      if (!got.hasVideo) videoEnabledRef.current = false;
    } catch {
      sock.emit('call:reject', { exchangeId: exchangeIdRef.current, reason: 'media-denied' });
      update({ status: 'error', error: MEDIA_DENIED });
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

  /**
   * Acts on an Answer / Decline pressed on a call notification that was posted
   * while the app was closed.
   *
   * Only the socket can accept or decline — the BroadcastReceiver that caught
   * the button press has no socket — so it records the choice natively and this
   * sends it. A cold start also stored the call itself; a warm start usually
   * already has the sheet on screen from the socket, so the call is only
   * restored when nothing is ringing yet.
   */
  const respondToLaunchAction = useCallback(async () => {
    const action = await getLaunchAction();
    if (!action) return;
    if (statusRef.current === 'none' && groupStatusRef.current === 'none') {
      const call = await getLaunchedCall();
      if (!call) return;
      const isGroup = call.kind === 'group' && !!call.groupId;
      if (!isGroup && !call.exchangeId) return;
      await clearLaunchedCall();
      if (isGroup) showLaunchedGroupInvite(call);
      else showLaunchedDirectCall(call);
      setPendingLaunchAction({ action, kind: isGroup ? 'group' : 'direct' });
      return;
    }
    // A sheet is already up — the socket got there before the tap was read.
    setPendingLaunchAction({
      action,
      kind: groupStatusRef.current !== 'none' ? 'group' : 'direct',
    });
  }, [showLaunchedDirectCall, showLaunchedGroupInvite]);

  // ── Presence: can this device actually see an incoming call? ───────────────
  useEffect(() => {
    if (!socket || !socketConnected) return;
    socket.emit('presence:set', { foreground });
  }, [socket, socketConnected, foreground]);

  useEffect(() => {
    const isVisible = () =>
      typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';
    const onVisibility = () => setForeground(isVisible());
    document.addEventListener('visibilitychange', onVisibility);

    let dispose: (() => void) | undefined;
    let cancelled = false;
    if (Capacitor.isNativePlatform()) {
      // The native lifecycle event is the reliable signal on Android: the WebView
      // does not always fire visibilitychange when the app is backgrounded.
      void CapApp.addListener('appStateChange', ({ isActive }) => {
        setForeground(isActive);
        // Returning to the front is how an Answer / Decline tap arrives when the
        // process was still alive in the background.
        if (isActive) void respondToLaunchAction();
      })
        .then((handle) => {
          if (cancelled) void handle.remove();
          else dispose = () => void handle.remove();
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      dispose?.();
    };
  }, [respondToLaunchAction]);

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
    async (members: Peer[]) => {
      const sock = socketRef.current;
      if (!sock || members.length === 0 || status !== 'none' || groupStatusRef.current !== 'none') return;
      const wanted = members.filter((m) => m.id && m.id !== myId);
      if (wanted.length === 0) return;

      // Mesh cap, mirrored from the server. The server drops extras as well;
      // stopping here means the picker cannot invite people who will never ring.
      const cap = Math.max(2, maxGroupRef.current);
      const unique = wanted.slice(0, Math.max(1, cap - 1));
      const dropped = wanted.length - unique.length;

      // Audio-first. In a mesh every participant uploads one stream per other
      // participant, so video costs n-1 uploads each — on mobile data that is the
      // first thing to fail. The camera button acquires video and renegotiates
      // with every peer for whoever actually wants to be seen.
      try {
        const got = await acquireLocalStream(false);
        if (!got) {
          setGroupError('Microphone access was denied. Allow access in your device settings, then try again.');
          setGroupStatus('none');
          return;
        }
      } catch {
        setGroupError('Microphone access was denied. Allow access in your device settings, then try again.');
        setGroupStatus('none');
        return;
      }
      const host: Peer = { id: myId, displayName: user?.displayName ?? 'You', avatarUrl: null, avatarFrame: null };
      setGroupVideo(false);
      setGroupHost(host);
      setGroupMembers([host, ...unique]);
      groupMembersRef.current = [host, ...unique];
      setPeerStates({});
      setGroupError(undefined);
      setGroupMicOn(true);
      setGroupCamOn(false);
      groupIdRef.current = '';
      setGroupStatus('outgoing');
      void setCallUiActive(true);
      sock.emit('group:call:start', { memberIds: unique.map((m) => m.id), video: false });
      if (dropped > 0) {
        setGroupError(`Group calls hold ${cap} people — ${dropped} of your picks were not called.`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myId, user?.displayName, status, acquireLocalStream]
  );

  const agreeGroup = useCallback(async () => {
    const sock = socketRef.current;
    if (!sock || groupStatusRef.current !== 'incoming') return;
    try {
      // Audio-first, whatever the invite asked for: join without video, switch the
      // camera on once inside if you want to be seen.
      const got = await acquireLocalStream(false);
      if (!got) {
        setGroupError('Microphone access was denied. Allow access in your device settings, then try again.');
        sock.emit('group:call:reject', { id: groupIdRef.current });
        endGroupCall();
        return;
      }
      setGroupVideo(false);
      setGroupMicOn(true);
      setGroupCamOn(false);
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

  // Sends the recorded Answer / Decline once the right sheet is up and the
  // socket is connected. Held as state rather than acted on inline because
  // acceptCall() and agreeGroup() only work on an 'incoming' call, and on a cold
  // start the socket is often still connecting when the press is read.
  useEffect(() => {
    if (!pendingLaunchAction || !socketConnected) return;
    const { action, kind } = pendingLaunchAction;
    if (kind === 'group') {
      if (groupStatus !== 'incoming') return;
      setPendingLaunchAction(null);
      if (action === 'answer') void agreeGroup();
      else declineGroup();
      return;
    }
    if (status !== 'incoming') return;
    setPendingLaunchAction(null);
    if (action === 'answer') void acceptCall();
    else declineCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingLaunchAction,
    status,
    groupStatus,
    socketConnected,
    acceptCall,
    declineCall,
    agreeGroup,
    declineGroup,
  ]);

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

  /**
   * Re-offer to every mesh peer after the local track set changes. Each leg is its
   * own peer connection, so each needs its own negotiation; glare from a peer doing
   * the same thing at the same moment is resolved by the rollback in onSignaled.
   */
  const renegotiateGroup = useCallback(async () => {
    const sock = socketRef.current;
    if (!sock || !groupIdRef.current) return;
    for (const [memberId, pc] of Array.from(groupPcsRef.current.entries())) {
      try {
        if (pc.signalingState !== 'stable') continue; // already negotiating
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sock.emit('group:signal', {
          id: groupIdRef.current,
          to: memberId,
          signal: { type: 'offer', sdp: pc.localDescription?.sdp },
        });
      } catch {
        // The next roster change retries negotiation.
      }
    }
  }, []);

  /**
   * Camera in a group call. The call starts audio-only, so this really acquires the
   * camera and adds a track to every peer rather than just flipping `track.enabled`
   * on a track that does not exist. Turning it off stops the track — the device's
   * camera indicator goes out, which matters on Android — removes it from every
   * leg, and renegotiates so peers stop showing a frozen frame.
   */
  const gToggleCamera = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const existing = stream.getVideoTracks();

    if (existing.length > 0) {
      for (const pc of groupPcsRef.current.values()) {
        for (const sender of pc.getSenders()) {
          if (sender.track && sender.track.kind === 'video') {
            try {
              pc.removeTrack(sender);
            } catch {
              /* sender already gone */
            }
          }
        }
      }
      existing.forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
      attachLocal(stream);
      setGroupCamOn(false);
      socketRef.current?.emit('group:call:update', { id: groupIdRef.current, camera: false });
      await renegotiateGroup();
      return;
    }

    let acquired: MediaStream | null = null;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch {
      setGroupError('Camera access was denied. Allow the camera in your device settings, then try again.');
      return;
    }
    const track = acquired?.getVideoTracks()[0];
    if (!track) {
      setGroupError('No camera was found on this device.');
      return;
    }
    stream.addTrack(track);
    attachLocal(stream);
    for (const pc of groupPcsRef.current.values()) pc.addTrack(track, stream);
    setGroupCamOn(true);
    setGroupVideo(true);
    setGroupError(undefined);
    socketRef.current?.emit('group:call:update', { id: groupIdRef.current, camera: true });
    await renegotiateGroup();
  }, [attachLocal, renegotiateGroup]);

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
    maxGroupCallParticipants: maxGroup,
    agreeGroup,
    declineGroup,
    leaveGroup,
    gToggleMic,
    gToggleCamera,
    attachGroupVideo,
    minimized,
    minimizeCall: () => setMinimized(true),
    restoreCall: () => setMinimized(false),
    groupMinimized,
    minimizeGroupCall: () => setGroupMinimized(true),
    restoreGroupCall: () => setGroupMinimized(false),
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
        minimized={minimized}
        onMinimize={() => setMinimized(true)}
        onRestore={() => setMinimized(false)}
        micMuted={micMuted}
        cameraAvailable={cameraAvailable}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        durationSec={durationSec}
        exchangeId={exchangeIdRef.current}
        summary={summary}
        onClearSummary={clearSummary}
        onRedial={(p, ex, v) => void startCall(p, ex, v)}
        relayHint={relayHint}
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
        relayHint={relayHint}
        minimized={groupMinimized}
        onMinimize={() => setGroupMinimized(true)}
        onRestore={() => setGroupMinimized(false)}
      />
    </CallsContext.Provider>
  );
}

export function useCalls(): CallsContextValue {
  const ctx = useContext(CallsContext);
  if (!ctx) throw new Error('useCalls must be used within <CallsProvider>');
  return ctx;
}
