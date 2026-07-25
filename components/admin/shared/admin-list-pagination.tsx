'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/admin/calculations';
import { cn } from '@/lib/utils';

type AdminListPaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
};

export function AdminListPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'registros',
  className,
}: AdminListPaginationProps) {
  if (totalItems <= pageSize) return null;

  const normalizedPage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const start = totalItems === 0 ? 0 : (normalizedPage - 1) * pageSize + 1;
  const end = Math.min(normalizedPage * pageSize, totalItems);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl border border-border bg-muted/45 px-3 py-2.5 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <p>
        {formatNumber(start)}-{formatNumber(end)} de {formatNumber(totalItems)} {itemLabel}
      </p>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-xl"
          onClick={() => onPageChange(Math.max(normalizedPage - 1, 1))}
          disabled={normalizedPage <= 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Anterior
        </Button>
        <span className="min-w-16 text-center text-xs font-medium text-foreground">
          {formatNumber(normalizedPage)} / {formatNumber(totalPages)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-xl"
          onClick={() => onPageChange(Math.min(normalizedPage + 1, totalPages))}
          disabled={normalizedPage >= totalPages}
        >
          Siguiente
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
