'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { AppUserAccount, UserRole } from '@/lib/admin/types';
import { toast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  profile: AppUserAccount | null;
  role: UserRole | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'billarpool:last-activity';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleLogoutInProgressRef = useRef(false);

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const clearStoredActivity = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  }, []);

  const performLogout = useCallback(
    async (reason: 'manual' | 'idle' | 'inactive-profile' = 'manual') => {
      if (idleLogoutInProgressRef.current) return;

      idleLogoutInProgressRef.current = true;
      clearIdleTimeout();
      clearStoredActivity();

      try {
        await signOut(auth);
      } finally {
        setUser(null);
        setProfile(null);
        idleLogoutInProgressRef.current = false;
      }

      if (reason === 'idle') {
        toast({
          title: 'Sesion cerrada por inactividad',
          description: 'Pasaron 30 minutos sin actividad. Ingresa de nuevo para continuar.',
          variant: 'destructive',
        });
      }
    },
    [clearIdleTimeout, clearStoredActivity]
  );

  const scheduleIdleLogout = useCallback(
    (remainingMs = IDLE_TIMEOUT_MS) => {
      clearIdleTimeout();
      idleTimeoutRef.current = setTimeout(() => {
        void performLogout('idle');
      }, Math.max(remainingMs, 0));
    },
    [clearIdleTimeout, performLogout]
  );

  const registerActivity = useCallback(() => {
    if (typeof window === 'undefined' || !auth.currentUser) return;

    const now = Date.now();
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    scheduleIdleLogout(IDLE_TIMEOUT_MS);
  }, [scheduleIdleLogout]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubscribeProfile?.();

      if (!currentUser) {
        clearIdleTimeout();
        clearStoredActivity();
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      setLoading(true);

      if (typeof window !== 'undefined') {
        const storedValue = window.localStorage.getItem(LAST_ACTIVITY_KEY);
        const lastActivityAt = storedValue ? Number(storedValue) : NaN;
        const inactivityMs = Number.isFinite(lastActivityAt) ? Date.now() - lastActivityAt : 0;

        if (inactivityMs >= IDLE_TIMEOUT_MS) {
          void performLogout('idle');
          setLoading(false);
          return;
        }

        if (Number.isFinite(lastActivityAt)) {
          scheduleIdleLogout(IDLE_TIMEOUT_MS - inactivityMs);
        } else {
          registerActivity();
        }
      }

      unsubscribeProfile = onSnapshot(
        doc(db, 'usuarios', currentUser.uid),
        (snapshot) => {
          const data = snapshot.data();
          setProfile({
            id: currentUser.uid,
            uid: currentUser.uid,
            nombre: String(data?.nombre ?? currentUser.displayName ?? ''),
            email: String(data?.email ?? currentUser.email ?? ''),
            telefono: String(data?.telefono ?? ''),
            role: data?.role === 'sales' ? 'sales' : 'admin',
            status: data?.status === 'inactive' ? 'inactive' : 'active',
            createdAt: typeof data?.createdAt?.toDate === 'function'
              ? data.createdAt.toDate().toISOString()
              : new Date().toISOString(),
            updatedAt: typeof data?.updatedAt?.toDate === 'function'
              ? data.updatedAt.toDate().toISOString()
              : new Date().toISOString(),
          });
          setLoading(false);
        },
        () => {
          setProfile({
            id: currentUser.uid,
            uid: currentUser.uid,
            nombre: currentUser.displayName ?? '',
            email: currentUser.email ?? '',
            telefono: '',
            role: 'admin',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [clearIdleTimeout, clearStoredActivity, performLogout, registerActivity, scheduleIdleLogout]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    const handleActivity = () => registerActivity();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        registerActivity();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY) return;

      const lastActivityAt = event.newValue ? Number(event.newValue) : NaN;
      if (!Number.isFinite(lastActivityAt)) return;

      const inactivityMs = Date.now() - lastActivityAt;
      if (inactivityMs >= IDLE_TIMEOUT_MS) {
        void performLogout('idle');
        return;
      }

      scheduleIdleLogout(IDLE_TIMEOUT_MS - inactivityMs);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'scroll',
      'touchstart',
    ];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, handleActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [performLogout, registerActivity, scheduleIdleLogout, user]);

  useEffect(() => () => clearIdleTimeout(), [clearIdleTimeout]);

  const logout = useCallback(async () => {
    await performLogout('manual');
  }, [performLogout]);

  return (
    <AuthContext.Provider value={{ user, profile, role: profile?.role ?? null, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider');
  }
  return context;
}
