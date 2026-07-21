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
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-950 dark:text-slate-50">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
        <div className={contentClassName}>{children}</div>
      </section>
    );
  }

  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? value : undefined} className={className}>
      <AccordionItem value={value} className="rounded-2xl border border-border bg-card/90 shadow-[0_12px_30px_rgba(15,23,42,0.06)] data-[state=closed]:overflow-hidden data-[state=open]:overflow-visible dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-[0_14px_34px_rgba(2,6,23,0.34)]">
        <AccordionTrigger className={cn('items-start px-4 py-3.5 hover:no-underline data-[state=open]:bg-muted/70 dark:data-[state=open]:bg-slate-900/80', headerClassName)}>
          <div className="pr-2 text-left">
            <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-950 dark:text-slate-50">{title}</h3>
            {description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p> : null}
          </div>
        </AccordionTrigger>
        <AccordionContent className={cn('border-t border-border/70 px-4 pt-4 pb-4 dark:border-slate-800', contentClassName)}>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
