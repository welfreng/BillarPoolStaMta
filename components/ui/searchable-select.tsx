'use client';

import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type SearchableSelectUsageStats = Record<
  string,
  {
    count: number;
    lastUsedAt: number;
  }
>;

export function SearchableSelect({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  options,
  disabled,
  allowCreate,
  createLabel,
  onCreate,
  triggerClassName,
  recentStorageKey,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  allowCreate?: boolean;
  createLabel?: string;
  onCreate?: (value: string) => void;
  triggerClassName?: string;
  recentStorageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [usageStats, setUsageStats] = useState<SearchableSelectUsageStats>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery))
    : options;
  const frequentOptions = useMemo(
    () =>
      Object.entries(usageStats)
        .sort((left, right) => {
          const countDiff = right[1].count - left[1].count;
          if (countDiff !== 0) return countDiff;
          return right[1].lastUsedAt - left[1].lastUsedAt;
        })
        .map(([recentValue]) => options.find((option) => option.value === recentValue))
        .filter((option): option is { value: string; label: string } => Boolean(option))
        .filter((option) => !normalizedQuery || option.label.toLowerCase().includes(normalizedQuery) || option.value.toLowerCase().includes(normalizedQuery))
        .slice(0, 5),
    [normalizedQuery, options, usageStats]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const syncIsMobile = () => setIsMobile(mediaQuery.matches);
    syncIsMobile();

    const handleChange = () => syncIsMobile();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!recentStorageKey || typeof window === 'undefined') return;
    try {
      const rawValue = window.localStorage.getItem(`searchable-select:${recentStorageKey}`);
      if (!rawValue) return;
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        const migratedStats = parsed.reduce<SearchableSelectUsageStats>((accumulator, item, index) => {
          if (typeof item !== 'string') return accumulator;
          accumulator[item] = {
            count: Math.max(parsed.length - index, 1),
            lastUsedAt: Date.now() - index,
          };
          return accumulator;
        }, {});
        setUsageStats(migratedStats);
        return;
      }
      if (parsed && typeof parsed === 'object') {
        const normalizedStats = Object.entries(parsed).reduce<SearchableSelectUsageStats>((accumulator, [key, value]) => {
          if (!value || typeof value !== 'object') return accumulator;
          const count = Number((value as { count?: number }).count ?? 0);
          const lastUsedAt = Number((value as { lastUsedAt?: number }).lastUsedAt ?? 0);
          if (!key.trim()) return accumulator;
          accumulator[key] = {
            count: Number.isFinite(count) && count > 0 ? count : 1,
            lastUsedAt: Number.isFinite(lastUsedAt) && lastUsedAt > 0 ? lastUsedAt : Date.now(),
          };
          return accumulator;
        }, {});
        setUsageStats(normalizedStats);
      }
    } catch {
      setUsageStats({});
    }
  }, [recentStorageKey]);

  useEffect(() => {
    if (!open) return;
    const focusInput = () => inputRef.current?.focus();
    const timeoutId = window.setTimeout(focusInput, 30);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  const persistRecentValue = (nextValue: string) => {
    if (!recentStorageKey || typeof window === 'undefined' || !nextValue) return;
    const nextUsageStats: SearchableSelectUsageStats = {
      ...usageStats,
      [nextValue]: {
        count: (usageStats[nextValue]?.count ?? 0) + 1,
        lastUsedAt: Date.now(),
      },
    };
    setUsageStats(nextUsageStats);
    try {
      window.localStorage.setItem(`searchable-select:${recentStorageKey}`, JSON.stringify(nextUsageStats));
    } catch {
      // Ignore localStorage failures; usage memory is a UX enhancement only.
    }
  };

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    persistRecentValue(nextValue);
    setQuery('');
    setOpen(false);
  };

  const handleListWheel = (event: WheelEvent<HTMLDivElement>) => {
    const listElement = listRef.current;
    if (!listElement) return;

    const canScrollVertically = listElement.scrollHeight > listElement.clientHeight;
    if (!canScrollVertically) return;

    event.stopPropagation();
  };

  const commandContent = (
    <Command className="h-full w-full min-w-0">
        <div className="w-full min-w-0 border-b">
          <CommandInput
            ref={inputRef}
            className={cn('min-w-0', isMobile ? 'text-[14px]' : '')}
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
        <div className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {filteredOptions.length === options.length
              ? `${options.length} opcion(es)`
              : `${filteredOptions.length} resultado(s) de ${options.length}`}
          </span>
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-lg px-2 text-xs"
              onClick={() => setQuery('')}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Limpiar
            </Button>
          ) : null}
        </div>
      </div>
      <CommandList
        className={cn(
          'w-full min-w-0 overflow-y-auto overscroll-contain touch-pan-y',
          isMobile ? 'max-h-[calc(100dvh-10rem)]' : 'max-h-[min(22rem,60vh)]'
        )}
        ref={listRef}
        onWheel={handleListWheel}
      >
        <CommandEmpty>
          {allowCreate && onCreate && query.trim() ? (
            <div className="space-y-2 px-3 py-3 text-left">
              <p className="text-sm text-slate-600 dark:text-slate-300">{emptyLabel}</p>
              <Button
                type="button"
                size="sm"
                className="w-full rounded-lg"
                onClick={() => {
                  onCreate(query.trim());
                  handleSelect(query.trim());
                }}
              >
                {createLabel ?? `Crear "${query.trim()}"`}
              </Button>
            </div>
          ) : (
            emptyLabel
          )}
        </CommandEmpty>
        {frequentOptions.length > 0 && !normalizedQuery ? (
          <CommandGroup heading="Frecuentes">
          {frequentOptions.map((option) => (
            <CommandItem
              key={`recent-${option.value}`}
              value={`${option.label} ${option.value}`}
              className={cn(isMobile ? 'items-start py-2.5' : '')}
              onSelect={() => {
                handleSelect(option.value);
              }}
            >
              <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
              <span
                className={cn(
                  'min-w-0 flex-1',
                  isMobile ? 'line-clamp-2 text-[13px] leading-4 whitespace-normal break-words' : 'truncate'
                )}
              >
                {option.label}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        ) : null}
        <CommandGroup>
          {filteredOptions.map((option) => (
            <CommandItem
              key={option.value}
              value={`${option.label} ${option.value}`}
              className={cn(isMobile ? 'items-start py-2.5' : '')}
              onSelect={() => {
                handleSelect(option.value);
              }}
            >
              <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
              <span
                className={cn(
                  'min-w-0 flex-1',
                  isMobile ? 'line-clamp-2 text-[13px] leading-4 whitespace-normal break-words' : 'truncate'
                )}
              >
                {option.label}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  return (
    isMobile ? (
      <>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={cn('w-full min-w-0 justify-between overflow-hidden px-3 font-normal', triggerClassName)}
        >
          <span className="truncate text-left">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton={false}
            className="inset-0 left-0 top-0 !z-[100] !flex h-[100dvh] !h-[100dvh] w-screen !w-screen max-w-none !max-w-none translate-x-0 !translate-x-0 translate-y-0 !translate-y-0 flex-col items-stretch rounded-none !rounded-none border-0 p-0"
          >
            <DialogHeader className="w-full min-w-0 border-b px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="min-w-0 flex-1 truncate text-[15px] font-semibold">{placeholder}</DialogTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Cerrar</span>
                </Button>
              </div>
            </DialogHeader>
            <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden p-0">
              {commandContent}
            </div>
          </DialogContent>
        </Dialog>
      </>
    ) : (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn('w-full min-w-0 justify-between overflow-hidden px-3 font-normal', triggerClassName)}
          >
            <span className="truncate text-left">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="!z-[100] w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] min-w-[min(260px,calc(100vw-2rem))] p-0" align="start" sideOffset={6}>
          {commandContent}
        </PopoverContent>
      </Popover>
    )
  );
}
