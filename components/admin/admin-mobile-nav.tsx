'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Grid2x2, MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { adminNavigation, getNavigationForRole } from '@/components/admin/admin-navigation';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

function isActivePath(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

export function AdminMobileNav() {
  const pathname = usePathname();
  const { role } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleNavigation = useMemo(() => getNavigationForRole(role), [role]);
  const primaryNavigation = useMemo(() => {
    if (role === 'sales') {
      return visibleNavigation.slice(0, 4);
    }

    return adminNavigation.filter(
      (item) =>
        item.href === '/dashboard' ||
        item.href === '/dashboard/ventas' ||
        item.href === '/dashboard/productos' ||
        item.href === '/dashboard/servicios'
    );
  }, [role, visibleNavigation]);
  const secondaryNavigation = useMemo(
    () => visibleNavigation.filter((item) => !primaryNavigation.some((primary) => primary.href === item.href)),
    [primaryNavigation, visibleNavigation]
  );
  const moreActive = secondaryNavigation.some((item) => isActivePath(pathname, item.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-white/92 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center transition-all duration-200',
                  active
                    ? 'bg-[linear-gradient(135deg,#0a2472_0%,#12389b_100%)] text-white shadow-[0_14px_28px_rgba(10,36,114,0.22)]'
                    : 'text-slate-500 hover:bg-slate-100/90'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate text-[11px] font-semibold">{item.label}</span>
              </Link>
            );
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center transition-all duration-200',
                  moreActive
                    ? 'bg-slate-950 text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]'
                    : 'text-slate-500 hover:bg-slate-100/90'
                )}
              >
                <MoreHorizontal className="h-4 w-4 shrink-0" />
                <span className="truncate text-[11px] font-semibold">Mas</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-[28px] border-slate-200 bg-white px-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-0 [&>button]:top-5 [&>button]:right-5"
            >
              <SheetHeader className="border-b border-slate-200/80 px-5 pb-4 pt-5 text-left">
                <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200" />
                <SheetTitle className="text-left text-lg text-slate-950">Mas modulos</SheetTitle>
                <SheetDescription className="text-left text-slate-500">
                  Cambia de area sin subir hasta el encabezado.
                </SheetDescription>
              </SheetHeader>

              <div className="px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {secondaryNavigation.map((item) => {
                    const Icon = item.icon;
                    const active = isActivePath(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200',
                          active
                            ? 'border-[#12389b]/20 bg-[linear-gradient(135deg,rgba(10,36,114,0.08)_0%,rgba(15,118,110,0.06)_100%)] text-slate-950 shadow-sm'
                            : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-white'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-2xl',
                            active ? 'bg-[#12389b] text-white' : 'bg-white text-slate-600'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.label}</p>
                          <p className="truncate text-xs text-slate-500">{item.helper}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {secondaryNavigation.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-center">
                    <Grid2x2 className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-900">Todo a mano</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tus modulos principales ya estan visibles en la barra inferior.
                    </p>
                  </div>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
