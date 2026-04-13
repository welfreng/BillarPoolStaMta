'use client';

import { collection, doc, limit, onSnapshot, orderBy, query, Timestamp, writeBatch, type DocumentData } from 'firebase/firestore';
import { Bell, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { db } from '@/lib/firebase';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard ejecutivo',
  '/dashboard/productos': 'Gestion de productos',
  '/dashboard/categorias': 'Gestion de categorias',
  '/dashboard/inventario': 'Control de inventario',
  '/dashboard/compras': 'Compras e inversion',
  '/dashboard/web': 'Pagina web',
  '/dashboard/reportes': 'Reportes iniciales',
  '/dashboard/ventas': 'Gestion de ventas',
  '/dashboard/autorizaciones': 'Autorizaciones de ventas',
  '/dashboard/servicios': 'Servicios de torno',
  '/dashboard/proveedores': 'Gestion de proveedores',
  '/dashboard/usuarios': 'Usuarios y roles',
};

interface AdminNotificationItem {
  id: string;
  title: string;
  message: string;
  href: string;
  read: boolean;
  createdAt: string;
}

function normalizeDateValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

function mapNotificationDocument(documentId: string, data: DocumentData): AdminNotificationItem {
  return {
    id: documentId,
    title: String(data.title ?? 'Notificacion'),
    message: String(data.message ?? ''),
    href: String(data.href ?? '/dashboard'),
    read: Boolean(data.read ?? false),
    createdAt: normalizeDateValue(data.createdAt),
  };
}

export function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const title = useMemo(() => pageTitles[pathname] ?? 'Panel administrativo', [pathname]);
  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read),
    [notifications]
  );
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
      { label: 'Categorias', helper: 'Gestionar categorias y subcategorias', href: '/dashboard/categorias' },
      { label: 'Proveedores', helper: 'Gestionar proveedores', href: '/dashboard/proveedores' },
      { label: 'Ventas', helper: 'Ir al modulo de ventas', href: '/dashboard/ventas' },
      { label: 'Autorizaciones', helper: 'Revisar solicitudes de vendedores', href: '/dashboard/autorizaciones' },
      { label: 'Registrar venta', helper: 'Abrir el modulo de ventas', href: '/dashboard/ventas' },
      { label: 'Servicios', helper: 'Registrar trabajos del torno', href: '/dashboard/servicios' },
      { label: 'Registrar servicio', helper: 'Abrir el modulo de servicios', href: '/dashboard/servicios' },
      { label: 'Inventario', helper: 'Revisar movimientos y kardex', href: '/dashboard/inventario' },
      { label: 'Registrar movimiento', helper: 'Abrir inventario', href: '/dashboard/inventario' },
      { label: 'Compras', helper: 'Ir al modulo de compras', href: '/dashboard/compras' },
      { label: 'Registrar compra', helper: 'Abrir compras', href: '/dashboard/compras' },
      { label: 'Pagina web', helper: 'Gestionar catalogo y servicios web', href: '/dashboard/web' },
      { label: 'Tienda virtual', helper: 'Cambiar fotos del catalogo web', href: '/dashboard/web' },
      { label: 'Reportes', helper: 'Ver indicadores del negocio', href: '/dashboard/reportes' },
      { label: 'Usuarios', helper: 'Gestionar accesos y roles', href: '/dashboard/usuarios' },
    ];
    const salesItems = [
      { label: 'Dashboard', helper: 'Ir al panel principal', href: '/dashboard' },
      { label: 'Ventas', helper: 'Ir al modulo de ventas', href: '/dashboard/ventas' },
      { label: 'Registrar venta', helper: 'Abrir el modulo de ventas', href: '/dashboard/ventas' },
      { label: 'Servicios', helper: 'Ir al modulo de torno', href: '/dashboard/servicios' },
      { label: 'Registrar servicio', helper: 'Registrar trabajo del torno', href: '/dashboard/servicios' },
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

  useEffect(() => {
    if (role !== 'admin') {
      setNotifications([]);
    } else {
      const notificationsQuery = query(
        collection(db, 'admin-notifications'),
        orderBy('createdAt', 'desc'),
        limit(8)
      );

      return onSnapshot(notificationsQuery, (snapshot) => {
        setNotifications(snapshot.docs.map((item) => mapNotificationDocument(item.id, item.data())));
      });
    }
  }, [role]);

  const navigateToItem = (href: string) => {
    setSearchQuery('');
    setIsFocused(false);
    router.push(href);
  };

  const markNotificationsAsRead = async () => {
    if (role !== 'admin' || unreadNotifications.length === 0) return;

    const batch = writeBatch(db);
    unreadNotifications.forEach((notification) => {
      batch.update(doc(db, 'admin-notifications', notification.id), { read: true });
    });
    await batch.commit();
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

          {role === 'admin' ? (
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) {
                  void markNotificationsAsRead();
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="relative rounded-xl self-start md:self-auto">
                  <Bell className="h-4 w-4" />
                  {unreadNotifications.length > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">
                      {unreadNotifications.length}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[320px] rounded-2xl p-0">
                <DropdownMenuLabel className="px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Notificaciones</p>
                      <p className="text-xs font-normal text-slate-500">
                      Avisos cuando vendedores registran ventas, servicios o solicitudes.
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-80 overflow-y-auto p-2">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        className="flex w-full flex-col items-start gap-1 rounded-xl px-3 py-3 text-left hover:bg-slate-50"
                        onClick={() => navigateToItem(notification.href)}
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <span className="text-sm font-medium text-slate-900">{notification.title}</span>
                          {!notification.read ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-500" /> : null}
                        </div>
                        <span className="text-xs text-slate-500">{notification.message}</span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(notification.createdAt).toLocaleString('es-CO')}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-center">
                      <p className="text-sm font-medium text-slate-900">Sin novedades</p>
                      <p className="mt-1 text-xs text-slate-500">Aqui apareceran ventas y servicios registrados por vendedores.</p>
                    </div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

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
