import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import { warmIceConfig } from '../lib/ice';
import { registerPushToken } from '../lib/push';
import { createSocket } from '../lib/socket';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

interface SocketState {
  socket: Socket | null;
  ready: boolean;
  /** Live online/offline map for exchange partners (message-list dots). */
  presence: Record<string, boolean>;
}

// One socket for the whole app, kept alive for the logged-in session. This is
// what makes an incoming call UI reachable from ANY screen (feed, messages,
// profile …) — previously a socket only existed while inside a conversation,
// so nobody browsing the app could see or hear a call coming in.
const SocketContext = createContext<SocketState>({ socket: null, ready: false, presence: {} });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [ready, setReady] = useState(false);
  const [presence, setPresence] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    let s: Socket;
    let cancelled = false;
    let socketOut: Socket | null = null;
    const onConnect = () => {
      setReady(true);
      // Wake the relay list now, not mid-call: the request that lifts a
      // sleeping server is the slow one, and a call must never pay for it.
      warmIceConfig();
      // A connected socket means the server is awake: the right moment to make
      // sure this device has a push token for closed-app ringing.
      void registerPushToken();
      seedPresence();
    };
    const onDisconnect = () => setReady(false);
    // Keep-warm: the free-tier host sleeps when idle, and a cold start is what
    // made opening the app feel slow. A tiny ping every 4 minutes while the
    // app is open keeps it awake between sessions.
    const warm = () => {
      // Any request wakes a sleeping free-tier host; /health is the cheapest.
      api.get('/health').catch(() => {});
    };
    warm();
    const warmTimer = window.setInterval(warm, 240_000);
    // Live presence for the message-list dots: the server announces every
    // online/offline flip to all connected clients.
    const onPresenceUpdate = (d: { userId: string; online: boolean }) =>
      setPresence((prev) => ({ ...prev, [d.userId]: d.online }));
    // Seed presence for the partners we actually chat with; socket events keep
    // it fresh from here on.
    const seedPresence = () => {
      api
        .get<Array<{ userId: string; online: boolean }>>('/users/presence/partners')
        .then((rows) => {
          setPresence((prev) => {
            const next = { ...prev };
            for (const r of rows) next[r.userId] = r.online;
            return next;
          });
        })
        .catch(() => {});
    };

    (async () => {
      s = await createSocket();
      if (cancelled) return;
      socketOut = s;
      socketRef.current = s;
      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      s.on('presence:update', onPresenceUpdate);
      if (s.connected) {
        setReady(true);
        seedPresence();
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(warmTimer);
      if (socketOut) {
        socketOut.off('connect', onConnect);
        socketOut.off('disconnect', onDisconnect);
        socketOut.off('presence:update', onPresenceUpdate);
        socketOut.disconnect();
      }
      socketRef.current = null;
      setReady(false);
    };
  }, [user?.id]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, ready, presence }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useGlobalSocket = () => useContext(SocketContext);