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
import { Spinner } from '@/components/ui/spinner';
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
  busy?: boolean;
  busyTitle?: React.ReactNode;
  busyDescription?: React.ReactNode;
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
  busy = false,
  busyTitle = 'Guardando...',
  busyDescription = 'Espera la confirmacion antes de continuar.',
}: AdminResponsiveDialogProps) {
  const isMobile = useIsMobile();

  const busyOverlay = busy ? (
    <div className="absolute inset-0 z-40 grid place-items-center bg-background/82 px-4 text-center backdrop-blur-sm">
      <div className="grid max-w-sm place-items-center gap-3 rounded-xl border bg-card p-5 shadow-lg">
        <Spinner className="h-7 w-7 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{busyTitle}</p>
          {busyDescription ? <p className="text-xs text-muted-foreground">{busyDescription}</p> : null}
        </div>
      </div>
    </div>
  ) : null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    onOpenChange(nextOpen);
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            '!fixed !inset-0 flex h-[100dvh] max-h-[100dvh] w-screen flex-col gap-0 overflow-hidden rounded-none border-0 bg-gradient-to-b from-background via-card to-background px-0 shadow-none dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900',
            mobileContentClassName
          )}
        >
          {busyOverlay}
          <SheetHeader className={cn('shrink-0 border-b border-slate-200/80 px-3 pt-2.5 pb-2.5 text-left dark:border-slate-800 sm:px-4 sm:pt-4 sm:pb-3', headerClassName)}>
            <div className="mx-auto mb-2.5 h-1.5 w-14 rounded-full bg-slate-300/80 dark:bg-slate-700/80" />
            <SheetTitle className="pr-10 text-[1rem] font-semibold tracking-[-0.01em] text-slate-950 dark:text-slate-50 sm:text-[1.05rem]">
              {title}
            </SheetTitle>
          </SheetHeader>
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 pb-4 sm:px-4 sm:py-4 sm:pb-6', bodyClassName)}>{children}</div>
          {footer ? (
            <div
              className={cn(
                'shrink-0 border-t border-border bg-background/90 px-2.5 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur supports-[padding:max(0px)]:pb-[max(0.65rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-[0_-8px_24px_rgba(2,6,23,0.35)] sm:px-4 sm:py-3',
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!busy}
        className={cn(
          '!fixed !top-4 !left-1/2 !z-[60] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[96vw] !-translate-x-1/2 !translate-y-0 flex-col overflow-hidden rounded-[28px] border-border bg-gradient-to-b from-background via-card to-background px-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:shadow-[0_24px_80px_rgba(2,6,23,0.45)]',
          desktopContentClassName
        )}
      >
        {busyOverlay}
        <DialogHeader className={cn('shrink-0 border-b border-slate-200/80 px-5 pt-6 pb-4 dark:border-slate-800 lg:px-6', headerClassName)}>
          <DialogTitle className="pr-8 text-[1.15rem] font-semibold tracking-[-0.01em] text-slate-950 dark:text-slate-50">
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-6 lg:px-6', bodyClassName)}>{children}</div>
        {footer ? (
          <div
            className={cn(
              'shrink-0 border-t border-border bg-background/90 px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.05)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-[0_-8px_24px_rgba(2,6,23,0.35)] lg:px-6',
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
