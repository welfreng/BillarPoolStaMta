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
        tone === 'default' && 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)]',
        tone === 'success' && 'border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(209,250,229,0.82)_100%)]',
        tone === 'warning' && 'border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,rgba(254,243,199,0.82)_100%)]',
        tone === 'danger' && 'border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,0.96)_0%,rgba(255,228,230,0.82)_100%)]'
      )}
    >
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">{value}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/80 p-2.5 shadow-sm">
          <ArrowUpRight className="h-4 w-4 text-slate-600" />
        </div>
      </div>
      <p className="text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}
