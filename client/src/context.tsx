import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { resetSocket } from './socket';

export interface SessionUser {
  id: string;
  username: string;
  avatar: string;
  guest?: boolean;
}

interface AuthCtx {
  readonly user: SessionUser | null;
  readonly loading: boolean;
  readonly setUser: (u: SessionUser | null) => void;
  readonly logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(AuthContext);

interface Toast { readonly id: number; readonly text: string; readonly ok?: boolean }
const ToastContext = createContext<(text: string, ok?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    api.get<SessionUser>('/api/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    resetSocket();
    setUser(null);
  }, []);

  const pushToast = useCallback((text: string, ok = false) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const authValue = useMemo(() => ({ user, loading, setUser, logout }), [user, loading, setUser, logout]);

  return (
    <AuthContext.Provider value={authValue}>
      <ToastContext.Provider value={pushToast}>
        {children}
        <div className="toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={`toast${t.ok ? ' ok' : ''}`}>{t.text}</div>
          ))}
        </div>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}
