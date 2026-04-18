'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-context';
import { Skeleton } from '@/components/ui/skeleton';

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, role, profile, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }

    if (!loading && profile?.status === 'inactive') {
      logout();
      router.replace('/login');
      return;
    }

    if (!loading && user && role === 'sales') {
      const allowedRoutes = new Set([
        '/dashboard',
        '/dashboard/ventas',
        '/dashboard/servicios',
        '/dashboard/inventario',
      ]);
      if (!allowedRoutes.has(pathname)) {
        router.replace('/dashboard/ventas');
      }
    }

  }, [loading, logout, pathname, profile?.status, role, router, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-slate-100 p-6 dark:bg-slate-950">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (
    role === 'sales' &&
    pathname !== '/dashboard' &&
    pathname !== '/dashboard/ventas' &&
    pathname !== '/dashboard/servicios' &&
    pathname !== '/dashboard/inventario'
  ) {
    return null;
  }

  return <>{children}</>;
}
