import type { ReactNode } from 'react';

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,251,255,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.88)_0%,rgba(15,23,42,0.86)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">{eyebrow}</p>}
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-50 sm:text-2xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {actions && <div className="flex w-full flex-wrap items-stretch gap-3 md:w-auto md:items-center md:justify-end">{actions}</div>}
    </div>
  );
}
