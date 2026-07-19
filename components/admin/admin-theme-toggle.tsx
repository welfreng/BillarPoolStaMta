'use client';

import { Check, Monitor, Moon, SunMedium } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const themes = [
  { value: 'light', label: 'Claro', icon: SunMedium },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

export function AdminThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? theme ?? 'system' : 'system';
  const ActiveIcon = activeTheme === 'dark' ? Moon : activeTheme === 'light' ? SunMedium : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="rounded-2xl"
        >
          <ActiveIcon className="h-4 w-4" />
          <span className="sr-only">Cambiar tema del panel</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 rounded-[20px] p-1.5"
      >
        {themes.map((item) => {
          const Icon = item.icon;
          const active = activeTheme === item.value;

          return (
            <DropdownMenuItem
              key={item.value}
              onClick={() => setTheme(item.value)}
              className={cn(
                'flex items-center justify-between rounded-2xl px-3 py-2.5',
                active && 'bg-muted text-foreground dark:bg-slate-900 dark:text-slate-50'
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </span>
              {active ? <Check className="h-4 w-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
