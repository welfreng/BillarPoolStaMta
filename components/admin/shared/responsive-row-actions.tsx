'use client';

import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface ResponsiveRowAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function ResponsiveRowActions({
  actions,
  align = 'end',
}: {
  actions: ResponsiveRowAction[];
  align?: 'start' | 'center' | 'end';
}) {
  const enabledActions = actions.filter((action) => !action.disabled);

  return (
    <>
      <div className="hidden items-center justify-end gap-2 md:flex">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="outline"
            size="icon"
            disabled={action.disabled}
            onClick={(event) => {
              event.stopPropagation();
              action.onClick();
            }}
            className={action.destructive ? 'text-rose-700 hover:text-rose-800' : undefined}
          >
            {action.icon}
          </Button>
        ))}
      </div>

      <div className="flex justify-end md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="rounded-xl">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align} className="w-44 rounded-xl">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                disabled={action.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onClick();
                }}
                className={action.destructive ? 'text-rose-700 focus:text-rose-700' : ''}
              >
                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">{action.icon}</span>
                {action.label}
              </DropdownMenuItem>
            ))}
            {enabledActions.length === 0 ? (
              <DropdownMenuItem disabled>Sin acciones disponibles</DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
