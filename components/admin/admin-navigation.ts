'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  Building2,
  ClipboardList,
  FolderTree,
  Globe,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Users,
  Wrench,
} from 'lucide-react';

export type AdminRole = 'superadmin' | 'admin' | 'sales' | null | undefined;

export type AdminNavItem = {
  href: string;
  label: string;
  helper: string;
  icon: LucideIcon;
};

export const adminNavigation: AdminNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, helper: 'Resumen ejecutivo' },
  { href: '/dashboard/productos', label: 'Productos', icon: Boxes, helper: 'Catalogo y stock' },
  { href: '/dashboard/categorias', label: 'Categorias', icon: FolderTree, helper: 'Estructura del catalogo' },
  { href: '/dashboard/proveedores', label: 'Proveedores', icon: Building2, helper: 'Contactos de compra' },
  { href: '/dashboard/ventas', label: 'Ventas', icon: ShoppingCart, helper: 'Salidas comerciales' },
  { href: '/dashboard/autorizaciones', label: 'Autorizaciones', icon: ShieldCheck, helper: 'Aprobaciones pendientes' },
  { href: '/dashboard/servicios', label: 'Servicios', icon: Wrench, helper: 'Torno e instalaciones' },
  { href: '/dashboard/inventario', label: 'Inventario', icon: ClipboardList, helper: 'Movimientos y kardex' },
  { href: '/dashboard/compras', label: 'Compras', icon: ReceiptText, helper: 'Inversion y costos' },
  { href: '/dashboard/web', label: 'Pagina web', icon: Globe, helper: 'Catalogo y servicios web' },
  { href: '/dashboard/reportes', label: 'Reportes', icon: Tags, helper: 'Insights operativos' },
  { href: '/dashboard/usuarios', label: 'Usuarios', icon: Users, helper: 'Roles y accesos' },
];

export function getNavigationForRole(role: AdminRole) {
  if (role === 'sales') {
    return adminNavigation.filter(
      (item) =>
        item.href === '/dashboard' ||
        item.href === '/dashboard/ventas' ||
        item.href === '/dashboard/servicios' ||
        item.href === '/dashboard/inventario'
    );
  }

  return adminNavigation;
}
