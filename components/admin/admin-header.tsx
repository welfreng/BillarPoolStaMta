'use client';

import { Bell, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useAuth } from '@/components/auth-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard ejecutivo',
  '/dashboard/productos': 'Gestion de productos',
  '/dashboard/inventario': 'Control de inventario',
  '/dashboard/compras': 'Compras e inversion',
  '/dashboard/reportes': 'Reportes iniciales',
  '/dashboard/ventas': 'Gestion de ventas',
  '/dashboard/proveedores': 'Gestion de proveedores',
  '/dashboard/usuarios': 'Usuarios y roles',
};

export function AdminHeader() {
  const pathname = usePathname();
  const { user, role, logout } = useAuth();
  const title = useMemo(() => pageTitles[pathname] ?? 'Panel administrativo', [pathname]);
  const initials = (user?.displayName ?? user?.email ?? 'A')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="rounded-xl border border-slate-200 bg-white md:hidden" />
          <div>
            <p className="text-sm font-medium text-cyan-700">Billar Pool Santa Marta</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:min-w-[260px] md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar modulo o accion..."
              className="rounded-xl border-slate-200 bg-slate-50 pl-9"
              readOnly
            />
          </div>

          <Button variant="outline" size="icon" className="rounded-xl self-start md:self-auto">
            <Bell className="h-4 w-4" />
          </Button>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center">
            <Avatar className="h-10 w-10 rounded-xl">
              <AvatarFallback className="rounded-xl bg-slate-900 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user?.displayName ?? 'Administrador'}
              </p>
              <p className="truncate text-xs text-slate-500">
                {user?.email} · {role === 'sales' ? 'Rol ventas' : 'Rol administrador'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="rounded-xl self-start sm:self-auto">
              Salir
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
