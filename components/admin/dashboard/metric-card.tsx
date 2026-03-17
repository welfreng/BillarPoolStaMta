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
        'rounded-3xl border px-5 py-5 shadow-sm transition-transform hover:-translate-y-0.5',
        tone === 'default' && 'border-slate-200 bg-white',
        tone === 'success' && 'border-emerald-200 bg-emerald-50/80',
        tone === 'warning' && 'border-amber-200 bg-amber-50/80',
        tone === 'danger' && 'border-rose-200 bg-rose-50/80'
      )}
    >
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="rounded-2xl bg-white/70 p-2 shadow-sm">
          <ArrowUpRight className="h-4 w-4 text-slate-500" />
        </div>
      </div>
      <p className="text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}
