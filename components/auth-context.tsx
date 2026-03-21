'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { AppUserAccount, UserRole } from '@/lib/admin/types';

interface AuthContextType {
  user: User | null;
  profile: AppUserAccount | null;
  role: UserRole | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubscribeProfile?.();

      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      setLoading(true);

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
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

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
