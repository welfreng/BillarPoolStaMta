'use client';

import { Bell, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const title = useMemo(() => pageTitles[pathname] ?? 'Panel administrativo', [pathname]);
  const initials = (user?.displayName ?? user?.email ?? 'A')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const searchItems = useMemo(() => {
    const adminItems = [
      { label: 'Dashboard', helper: 'Ir al panel principal', href: '/dashboard' },
      { label: 'Productos', helper: 'Gestionar catalogo y stock', href: '/dashboard/productos' },
      { label: 'Proveedores', helper: 'Gestionar proveedores', href: '/dashboard/proveedores' },
      { label: 'Ventas', helper: 'Ir al modulo de ventas', href: '/dashboard/ventas' },
      { label: 'Registrar venta', helper: 'Abrir el modulo de ventas', href: '/dashboard/ventas' },
      { label: 'Inventario', helper: 'Revisar movimientos y kardex', href: '/dashboard/inventario' },
      { label: 'Registrar movimiento', helper: 'Abrir inventario', href: '/dashboard/inventario' },
      { label: 'Compras', helper: 'Ir al modulo de compras', href: '/dashboard/compras' },
      { label: 'Registrar compra', helper: 'Abrir compras', href: '/dashboard/compras' },
      { label: 'Reportes', helper: 'Ver indicadores del negocio', href: '/dashboard/reportes' },
      { label: 'Usuarios', helper: 'Gestionar accesos y roles', href: '/dashboard/usuarios' },
    ];
    const salesItems = [
      { label: 'Dashboard', helper: 'Ir al panel principal', href: '/dashboard' },
      { label: 'Ventas', helper: 'Ir al modulo de ventas', href: '/dashboard/ventas' },
      { label: 'Registrar venta', helper: 'Abrir el modulo de ventas', href: '/dashboard/ventas' },
      { label: 'Inventario', helper: 'Consultar stock y precios', href: '/dashboard/inventario' },
    ];

    return role === 'sales' ? salesItems : adminItems;
  }, [role]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return searchItems.slice(0, 6);

    return searchItems.filter((item) =>
      `${item.label} ${item.helper}`.toLowerCase().includes(normalizedQuery)
    );
  }, [searchItems, searchQuery]);

  useEffect(() => {
    setSearchQuery('');
  }, [pathname]);

  const navigateToItem = (href: string) => {
    setSearchQuery('');
    setIsFocused(false);
    router.push(href);
  };

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
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setIsFocused(false), 120);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                if (filteredItems.length === 0) return;
                event.preventDefault();
                navigateToItem(filteredItems[0].href);
              }}
              placeholder="Buscar modulo o accion..."
              className="rounded-xl border-slate-200 bg-slate-50 pl-9"
            />
            {isFocused && filteredItems.length > 0 ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                {filteredItems.slice(0, 7).map((item) => (
                  <button
                    key={`${item.href}-${item.label}`}
                    type="button"
                    className="flex w-full flex-col items-start gap-1 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => navigateToItem(item.href)}
                  >
                    <span className="text-sm font-medium text-slate-900">{item.label}</span>
                    <span className="text-xs text-slate-500">{item.helper}</span>
                  </button>
                ))}
              </div>
            ) : null}
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
