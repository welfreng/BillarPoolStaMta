import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  const handleFocus: React.FocusEventHandler<HTMLInputElement> = (event) => {
    props.onFocus?.(event)
    if (event.defaultPrevented) return
    if (type !== 'number') return
    if (event.currentTarget.value !== '0') return
    const input = event.currentTarget
    requestAnimationFrame(() => {
      input?.select?.()
    })
  }

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-10 w-full min-w-0 rounded-xl border bg-background/88 px-3.5 py-2 text-[15px] text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_1px_2px_rgba(2,6,23,0.24)] sm:h-9 sm:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      onFocus={handleFocus}
      {...props}
    />
  )
}

export { Input }
