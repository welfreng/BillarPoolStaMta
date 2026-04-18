import type { ReactNode } from 'react';
import { AdminDataProvider } from '@/components/admin/admin-data-context';
import { AdminRouteGuard } from '@/components/admin/admin-route-guard';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminThemeScope } from '@/components/admin/admin-theme-scope';
import { ThemeProvider } from '@/components/theme-provider';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AdminRouteGuard>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        storageKey="dashboard-theme"
      >
        <AdminThemeScope />
        <AdminDataProvider>
          <AdminShell>{children}</AdminShell>
        </AdminDataProvider>
      </ThemeProvider>
    </AdminRouteGuard>
  );
}
