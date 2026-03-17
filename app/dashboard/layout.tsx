import type { ReactNode } from 'react';
import { AdminDataProvider } from '@/components/admin/admin-data-context';
import { AdminRouteGuard } from '@/components/admin/admin-route-guard';
import { AdminShell } from '@/components/admin/admin-shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AdminRouteGuard>
      <AdminDataProvider>
        <AdminShell>{children}</AdminShell>
      </AdminDataProvider>
    </AdminRouteGuard>
  );
}
