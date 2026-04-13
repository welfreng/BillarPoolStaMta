'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/components/ui/use-mobile';
import { cn } from '@/lib/utils';

type AdminResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  desktopContentClassName?: string;
  mobileContentClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
};

export function AdminResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  desktopContentClassName,
  mobileContentClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
}: AdminResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            'flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden rounded-t-[24px] border-slate-200 bg-gradient-to-b from-white via-slate-50/75 to-slate-100/85 px-0 shadow-2xl',
            mobileContentClassName
          )}
        >
          <SheetHeader className={cn('shrink-0 border-b border-slate-200/80 px-3 pt-2.5 pb-2.5 text-left sm:px-4 sm:pt-4 sm:pb-3', headerClassName)}>
            <div className="mx-auto mb-2.5 h-1.5 w-14 rounded-full bg-slate-300/80" />
            <SheetTitle className="pr-10 text-[1rem] font-semibold tracking-[-0.01em] text-slate-950 sm:text-[1.05rem]">
              {title}
            </SheetTitle>
          </SheetHeader>
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 pb-4 sm:px-4 sm:py-4 sm:pb-6', bodyClassName)}>{children}</div>
          {footer ? (
            <div
              className={cn(
                'shrink-0 border-t border-slate-200/90 bg-white/90 px-2.5 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur supports-[padding:max(0px)]:pb-[max(0.65rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-3',
                footerClassName
              )}
            >
              {footer}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[92dvh] w-[calc(100vw-2rem)] max-w-[96vw] flex-col overflow-hidden rounded-[28px] border-slate-200 bg-gradient-to-b from-white via-slate-50/70 to-white px-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)]',
          desktopContentClassName
        )}
      >
        <DialogHeader className={cn('shrink-0 border-b border-slate-200/80 px-5 pt-6 pb-4 lg:px-6', headerClassName)}>
          <DialogTitle className="pr-8 text-[1.15rem] font-semibold tracking-[-0.01em] text-slate-950">
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-6 lg:px-6', bodyClassName)}>{children}</div>
        {footer ? (
          <div
            className={cn(
              'shrink-0 border-t border-slate-200/90 bg-white/90 px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.05)] backdrop-blur lg:px-6',
              footerClassName
            )}
          >
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
