'use client';

import type { ReactNode } from 'react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminMobileSidebarLauncher } from '@/components/admin/admin-mobile-sidebar-launcher';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <AdminSidebar />
      <SidebarInset className="admin-theme-root admin-page-bg min-h-screen overflow-x-hidden">
        <AdminHeader />
        <div className="flex-1 min-w-0 px-3 py-4 pb-24 sm:px-4 sm:py-6 sm:pb-28 md:px-6 md:pb-6">{children}</div>
        <AdminMobileSidebarLauncher />
      </SidebarInset>
    </SidebarProvider>
  );
}
