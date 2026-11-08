import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from '../lib/api';
import { stopBackgroundLocation } from '../lib/bgLocation';
import { KEYS, storage } from '../lib/storage';
import type { Me } from '../lib/types';

interface AuthState {
  ready: boolean;
  token: string | null;
  me: Me | null;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  setMe: (me: Me) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const signOut = useCallback(async () => {
    try {
      if (token) await api('/api/me/push-token', { body: { token: null } });
    } catch {
      // ignore
    }
    await stopBackgroundLocation();
    await storage.set(KEYS.token, null);
    setAuthToken(null);
    setToken(null);
    setMe(null);
  }, [token]);

  const refreshMe = useCallback(async () => {
    try {
      const m = await api<Me>('/api/me');
      setMe(m);
      return m;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const t = await storage.get(KEYS.token);
      if (t) {
        setAuthToken(t);
        setToken(t);
        try {
          setMe(await api<Me>('/api/me'));
        } catch {
          // بدون نت: نكمل بالتوكن، وراح نحدث لاحقاً
        }
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      storage.set(KEYS.token, null);
      setAuthToken(null);
      setToken(null);
      setMe(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (t: string, m: Me) => {
    await storage.set(KEYS.token, t);
    setAuthToken(t);
    setToken(t);
    setMe(m);
  }, []);

  const value = useMemo(
    () => ({ ready, token, me, signIn, signOut, refreshMe, setMe }),
    [ready, token, me, signIn, signOut, refreshMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
