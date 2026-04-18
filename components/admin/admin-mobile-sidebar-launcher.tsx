'use client';

import { PanelLeft, Sparkles } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export function AdminMobileSidebarLauncher() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  if (!isMobile) return null;

  return (
    <button
      type="button"
      aria-label="Abrir modulos"
      onClick={() => setOpenMobile(true)}
      className={cn(
        'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-20 flex items-center gap-3 rounded-[22px] border border-white/25',
        'bg-[linear-gradient(135deg,rgba(8,22,47,0.96)_0%,rgba(10,36,114,0.94)_62%,rgba(14,165,233,0.9)_150%)] px-4 py-3 text-white shadow-[0_22px_40px_rgba(8,22,47,0.28)] backdrop-blur-xl transition-all duration-200 dark:border-slate-700/60 dark:bg-[linear-gradient(135deg,rgba(8,15,28,0.98)_0%,rgba(15,23,42,0.96)_55%,rgba(14,116,144,0.88)_150%)]',
        openMobile ? 'scale-[0.98] opacity-0 pointer-events-none' : 'hover:translate-y-[-1px] hover:shadow-[0_28px_46px_rgba(8,22,47,0.32)]'
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
        <PanelLeft className="h-4 w-4" />
      </div>
      <div className="text-left leading-none">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/85">Navegacion</p>
        <p className="mt-1 text-sm font-semibold">Abrir modulos</p>
      </div>
      <Sparkles className="h-4 w-4 text-cyan-100/80" />
    </button>
  );
}
