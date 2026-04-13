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
  SheetDescription,
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
            'flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden rounded-t-3xl px-0',
            mobileContentClassName
          )}
        >
          <SheetHeader className={cn('shrink-0 px-4 pt-5 text-left', headerClassName)}>
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 pb-6', bodyClassName)}>{children}</div>
          {footer ? (
            <div
              className={cn(
                'shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]',
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
          'flex max-h-[92dvh] w-[calc(100vw-2rem)] max-w-[96vw] flex-col overflow-hidden px-0',
          desktopContentClassName
        )}
      >
        <DialogHeader className={cn('shrink-0 px-5 pt-6 lg:px-6', headerClassName)}>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:px-6', bodyClassName)}>{children}</div>
        {footer ? (
          <div
            className={cn(
              'shrink-0 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur lg:px-6',
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
