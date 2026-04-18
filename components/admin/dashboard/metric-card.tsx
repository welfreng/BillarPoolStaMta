import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MetricCard({
  title,
  value,
  helper,
  tone = 'default',
}: {
  title: string;
  value: string;
  helper: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-[28px] border px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.1)]',
        tone === 'default' && 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)]',
        tone === 'success' && 'border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(209,250,229,0.82)_100%)] dark:border-emerald-900/70 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.36)_0%,rgba(6,95,70,0.24)_100%)]',
        tone === 'warning' && 'border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,rgba(254,243,199,0.82)_100%)] dark:border-amber-900/70 dark:bg-[linear-gradient(180deg,rgba(120,53,15,0.34)_0%,rgba(146,64,14,0.22)_100%)]',
        tone === 'danger' && 'border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,0.96)_0%,rgba(255,228,230,0.82)_100%)] dark:border-rose-900/70 dark:bg-[linear-gradient(180deg,rgba(136,19,55,0.32)_0%,rgba(159,18,57,0.2)_100%)]'
      )}
    >
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-50">{value}</p>
        </div>
        <div className="rounded-2xl border border-border bg-background/88 p-2.5 shadow-sm dark:border-slate-700 dark:bg-background/72">
          <ArrowUpRight className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        </div>
      </div>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{helper}</p>
    </div>
  );
}
