import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken, setOnSessionLost } from '../../lib/api';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'VENDEDOR' | 'CAJERO' | 'CONSULTA';
  permissions: string[];
  mustChangePassword: boolean;
  /** El servidor dice si pide credenciales o no. */
  accesoAbierto?: boolean;
}

interface AuthState {
  user: SessionUser | null;
  cargando: boolean;
  /** `true` cuando el servidor no pide credenciales (ACCESO_ABIERTO). */
  accesoAbierto: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  puede: (permiso: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [cargando, setCargando] = useState(true);
  const [accesoAbierto, setAccesoAbierto] = useState(false);

  /**
   * Al abrir la app se pregunta directamente quién soy.
   *
   * Un solo camino cubre los dos modos: si el servidor tiene el acceso abierto
   * responde de una; si pide credenciales, el cliente HTTP intenta renovar la
   * sesión con la cookie y reintenta. Solo si eso también falla se muestra el
   * login.
   */
  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const perfil = await api<SessionUser>('/auth/me');
        if (!vigente) return;
        setUser(perfil);
        setAccesoAbierto(perfil.accesoAbierto === true);
      } catch {
        if (vigente) setUser(null);
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    setOnSessionLost(() => setUser(null));
    return () => setOnSessionLost(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ accessToken: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setAccesoAbierto(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const puede = useCallback(
    (permiso: string) => user?.permissions.includes(permiso) ?? false,
    [user],
  );

  const value = useMemo(
    () => ({ user, cargando, accesoAbierto, login, logout, puede }),
    [user, cargando, accesoAbierto, login, logout, puede],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
