import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex min-h-16 w-full resize-none rounded-xl border bg-background/88 px-3.5 py-2.5 text-base text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[color,box-shadow,background-color] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_1px_2px_rgba(2,6,23,0.24)] sm:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
