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
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-cyan-700">{eyebrow}</p>}
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {actions && <div className="flex w-full flex-wrap items-stretch gap-3 md:w-auto md:items-center md:justify-end">{actions}</div>}
    </div>
  );
}
