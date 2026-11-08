import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { getBaseUrl } from '../lib/server';
import { useAuth } from './auth';

/**
 * قناة الوقت الحقيقي ويا السيرفر (Socket.IO).
 * تطبيق الزبون وتطبيق الكابتن ما يتكلمون ويا بعض مباشرة — كلشي يمر عبر السيرفر.
 */
interface SocketState {
  socket: Socket | null;
  connected: boolean;
  /** يزيد كل مرة نرجع نتصل — الشاشات تستخدمه لإعادة تحميل البيانات */
  reconnects: number;
}

const SocketContext = createContext<SocketState>({ socket: null, connected: false, reconnects: 0 });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnects, setReconnects] = useState(0);

  useEffect(() => {
    if (!token) return;
    const s = io(getBaseUrl(), {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    s.on('connect', () => {
      setConnected(true);
      setReconnects((n) => n + 1);
    });
    s.on('disconnect', () => setConnected(false));
    setSocket(s);

    // لما التطبيق يرجع من الخلفية نتأكد إن الاتصال شغال
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && !s.connected) s.connect();
    });
    return () => {
      sub.remove();
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  return <SocketContext.Provider value={{ socket, connected, reconnects }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

/** يسمع لحدث من السيرفر طول ما الشاشة مفتوحة */
export function useSocketEvent<T = any>(event: string, handler: (data: T) => void) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (d: T) => ref.current(d);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}
