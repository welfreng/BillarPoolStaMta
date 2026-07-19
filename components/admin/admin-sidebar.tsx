'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth-context';
import { getNavigationForRole } from '@/components/admin/admin-navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { SITE_LOGO } from '@/lib/branding';

export function AdminSidebar() {
  const pathname = usePathname();
  const { role } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const visibleNavigation = getNavigationForRole(role);

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-r-0">
      <SidebarHeader className="px-3 py-4">
        <div className="rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#08162f_0%,#0a2472_58%,#0ea5e9_140%)] px-3.5 py-3.5 text-white shadow-[0_18px_38px_rgba(10,22,40,0.28)]">
          <div className="mb-2.5 flex items-center gap-3">
            <div className="flex h-11 w-14 items-center justify-center rounded-lg border border-white/15 bg-white/12 p-1 shadow-lg shadow-black/15">
              <Image
                src={SITE_LOGO}
                alt="Billar Pool Santa Marta"
                width={76}
                height={60}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.01em]">Billar Pool Santa Marta</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/80">Centro administrativo</p>
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-200/86">
            Bienvenido al panel de control.
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Modulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavigation.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === '/dashboard'
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className={cn(
                        'h-auto rounded-xl px-3 py-2.5 transition-all duration-200',
                        active
                          ? 'bg-[linear-gradient(135deg,#0a2472_0%,#12389b_100%)] text-white shadow-[0_16px_30px_rgba(10,36,114,0.24)] hover:text-white focus-visible:text-white'
                          : 'bg-transparent text-slate-700 hover:bg-card/72 hover:text-slate-950 hover:shadow-sm dark:text-slate-200 dark:hover:bg-slate-900/80 dark:hover:text-slate-50'
                      )}
                    >
                      <Link
                        href={item.href}
                        className="flex w-full items-start gap-3"
                        onClick={() => {
                          if (isMobile) {
                            setOpenMobile(false);
                          }
                        }}
                      >
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-white' : 'text-current')} />
                        <span className="flex min-w-0 flex-col">
                          <span className={cn('truncate font-medium', active ? 'text-white' : 'text-current')}>{item.label}</span>
                          <span
                            className={cn(
                              'truncate text-xs',
                              active ? 'text-blue-100 dark:text-white/80' : 'text-slate-500 dark:text-slate-400'
                            )}
                          >
                            {item.helper}
                          </span>
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
