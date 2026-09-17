import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import { createSocket } from '../lib/socket';
import { useAuth } from './AuthContext';

interface SocketState {
  socket: Socket | null;
  ready: boolean;
}

// One socket for the whole app, kept alive for the logged-in session. This is
// what makes an incoming call UI reachable from ANY screen (feed, messages,
// profile …) — previously a socket only existed while inside a conversation,
// so nobody browsing the app could see or hear a call coming in.
const SocketContext = createContext<SocketState>({ socket: null, ready: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    let s: Socket;
    let cancelled = false;
    let socketOut: Socket | null = null;
    const onConnect = () => setReady(true);
    const onDisconnect = () => setReady(false);

    (async () => {
      s = await createSocket();
      if (cancelled) return;
      socketOut = s;
      socketRef.current = s;
      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      if (s.connected) setReady(true);
    })();

    return () => {
      cancelled = true;
      if (socketOut) {
        socketOut.off('connect', onConnect);
        socketOut.off('disconnect', onDisconnect);
        socketOut.disconnect();
      }
      socketRef.current = null;
      setReady(false);
    };
  }, [user?.id]);

  return <SocketContext.Provider value={{ socket: socketRef.current, ready }}>{children}</SocketContext.Provider>;
}

export const useGlobalSocket = () => useContext(SocketContext);