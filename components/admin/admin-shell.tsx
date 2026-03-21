'use client';

import type { ReactNode } from 'react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <AdminSidebar />
      <SidebarInset className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(8,145,178,0.14),_transparent_35%),linear-gradient(180deg,_#f8fbfd_0%,_#eef3f8_100%)]">
        <AdminHeader />
        <div className="flex-1 min-w-0 px-3 py-4 sm:px-4 sm:py-6 md:px-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
