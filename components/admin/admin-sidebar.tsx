'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  Building2,
  ClipboardList,
  Globe,
  LayoutDashboard,
  ReceiptText,
  ShoppingCart,
  Tags,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth-context';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, helper: 'Resumen ejecutivo' },
  { href: '/dashboard/productos', label: 'Productos', icon: Boxes, helper: 'Catalogo y stock' },
  { href: '/dashboard/proveedores', label: 'Proveedores', icon: Building2, helper: 'Contactos de compra' },
  { href: '/dashboard/ventas', label: 'Ventas', icon: ShoppingCart, helper: 'Salidas comerciales' },
  {
    href: '/dashboard/inventario',
    label: 'Inventario',
    icon: ClipboardList,
    helper: 'Movimientos y kardex',
  },
  { href: '/dashboard/compras', label: 'Compras', icon: ReceiptText, helper: 'Inversion y costos' },
  { href: '/dashboard/web', label: 'Pagina web', icon: Globe, helper: 'Catalogo y servicios web' },
  { href: '/dashboard/reportes', label: 'Reportes', icon: Tags, helper: 'Insights operativos' },
  { href: '/dashboard/usuarios', label: 'Usuarios', icon: Users, helper: 'Roles y accesos' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { role } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const visibleNavigation = role === 'sales'
    ? navigation.filter(
        (item) =>
          item.href === '/dashboard' ||
          item.href === '/dashboard/ventas' ||
          item.href === '/dashboard/inventario'
      )
    : navigation;

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-r-0">
      <SidebarHeader className="px-4 py-5">
        <div className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-4 text-white shadow-lg">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/20">
              <Image
                src="/images/logo.png"
                alt="Billar Pool Santa Marta"
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Billar Pool Santa Marta</p>
              <p className="text-xs text-slate-300">Centro administrativo</p>
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-300">
            Bienvenido al panel de control.
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel>Modulos</SidebarGroupLabel>
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
                        'h-auto rounded-xl px-3 py-3',
                        active && 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white'
                      )}
                    >
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (isMobile) {
                            setOpenMobile(false);
                          }
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex flex-col">
                          <span>{item.label}</span>
                          <span className="text-xs text-slate-500">{item.helper}</span>
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
