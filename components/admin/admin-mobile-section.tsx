'use client';

import * as React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useIsMobile } from '@/components/ui/use-mobile';
import { cn } from '@/lib/utils';

type AdminMobileSectionProps = {
  value: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
};

export function AdminMobileSection({
  value,
  title,
  description,
  defaultOpen = false,
  className,
  headerClassName,
  contentClassName,
  children,
}: AdminMobileSectionProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <section className={className}>
        <div className={headerClassName}>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        <div className={contentClassName}>{children}</div>
      </section>
    );
  }

  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? value : undefined} className={className}>
      <AccordionItem value={value} className="overflow-hidden rounded-[22px] border border-slate-200/90 bg-white/90 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <AccordionTrigger className={cn('px-4 py-3.5 hover:no-underline data-[state=open]:bg-slate-50/80', headerClassName)}>
          <div className="text-left">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              Seccion
            </div>
            <h3 className="mt-2 text-sm font-semibold tracking-[-0.01em] text-slate-950">{title}</h3>
            {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
          </div>
        </AccordionTrigger>
        <AccordionContent className={cn('border-t border-slate-100 px-4 pb-4', contentClassName)}>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
