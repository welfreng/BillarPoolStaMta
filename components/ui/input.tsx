import * as React from 'react'

import { cn } from '@/lib/utils'

type BaseInputProps = React.ComponentProps<'input'>

function formatIntegerWithGrouping(rawDigits: string) {
  const normalized = rawDigits.replace(/^0+(?=\d)/, '') || '0'
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function normalizeFormattedNumberInput(
  rawValue: string,
  options: {
    allowDecimal: boolean
    allowNegative: boolean
  }
) {
  const trimmed = String(rawValue ?? '').replace(/\s+/g, '')
  if (!trimmed) {
    return {
      raw: '',
      display: '',
      isZero: false,
    }
  }

  const negative = options.allowNegative && trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed

  if (!options.allowDecimal) {
    const digits = unsigned.replace(/\D/g, '')
    if (!digits) {
      return {
        raw: '',
        display: '',
        isZero: false,
      }
    }

    const normalizedDigits = digits.replace(/^0+(?=\d)/, '') || '0'
    return {
      raw: `${negative ? '-' : ''}${normalizedDigits}`,
      display: `${negative ? '-' : ''}${formatIntegerWithGrouping(normalizedDigits)}`,
      isZero: Number(normalizedDigits) === 0,
    }
  }

  const normalizedGrouping = unsigned.replace(/\./g, '')
  const commaIndex = normalizedGrouping.lastIndexOf(',')
  const hasSeparator = commaIndex >= 0
  const hasTrailingSeparator = hasSeparator && commaIndex === normalizedGrouping.length - 1
  const integerDigits = (hasSeparator ? normalizedGrouping.slice(0, commaIndex) : normalizedGrouping).replace(/\D/g, '')
  const decimalDigits = (hasSeparator ? normalizedGrouping.slice(commaIndex + 1) : '').replace(/\D/g, '')

  if (!integerDigits && !decimalDigits && !hasTrailingSeparator) {
    return {
      raw: '',
      display: '',
      isZero: false,
    }
  }

  const normalizedInteger = integerDigits.replace(/^0+(?=\d)/, '') || '0'
  const formattedInteger = formatIntegerWithGrouping(normalizedInteger)
  const hasOnlyZeroDecimals = decimalDigits.length > 0 && /^0+$/.test(decimalDigits)
  const shouldKeepDecimalPart = hasSeparator && (hasTrailingSeparator || !hasOnlyZeroDecimals)
  const rawDecimal = shouldKeepDecimalPart ? `.${decimalDigits}` : ''
  const displayDecimal = shouldKeepDecimalPart ? `,${decimalDigits}` : ''

  return {
    raw: `${negative ? '-' : ''}${normalizedInteger}${shouldKeepDecimalPart ? rawDecimal : ''}`,
    display: `${negative ? '-' : ''}${formattedInteger}${shouldKeepDecimalPart ? displayDecimal : ''}`,
    isZero: Number(`${negative ? '-' : ''}${normalizedInteger}${decimalDigits ? `.${decimalDigits}` : ''}`) === 0,
    hasTrailingSeparator,
  }
}

function isDecimalStep(step: BaseInputProps['step']) {
  if (step === undefined || step === null) return false
  if (step === 'any') return true
  const numericStep = Number(step)
  if (!Number.isFinite(numericStep)) return false
  return !Number.isInteger(numericStep)
}

const Input = React.forwardRef<HTMLInputElement, BaseInputProps>(function Input(
  { className, type, onChange, onFocus, onBlur, value, defaultValue, inputMode, min, step, ...props },
  ref
) {
  const isNumericInput = type === 'number'
  const allowDecimal = isNumericInput && isDecimalStep(step)
  const allowNegative = isNumericInput && typeof min !== 'number' && typeof min !== 'string'
  const [numericDisplayValue, setNumericDisplayValue] = React.useState(() => {
    if (!isNumericInput) return ''
    const initialValue = value ?? defaultValue
    if (initialValue === undefined || initialValue === null) return ''
    return normalizeFormattedNumberInput(String(initialValue), { allowDecimal, allowNegative }).display
  })

  const displayValue = React.useMemo(() => {
    if (!isNumericInput) return value
    if (value === undefined || value === null) return value
    return normalizeFormattedNumberInput(String(value), { allowDecimal, allowNegative }).display
  }, [allowDecimal, allowNegative, isNumericInput, value])

  const displayDefaultValue = React.useMemo(() => {
    if (!isNumericInput) return defaultValue
    if (defaultValue === undefined || defaultValue === null) return defaultValue
    return normalizeFormattedNumberInput(String(defaultValue), { allowDecimal, allowNegative }).display
  }, [allowDecimal, allowNegative, defaultValue, isNumericInput])

  React.useEffect(() => {
    if (!isNumericInput) return
    const nextValue = value ?? defaultValue
    const nextDisplay =
      nextValue === undefined || nextValue === null
        ? ''
        : normalizeFormattedNumberInput(String(nextValue), { allowDecimal, allowNegative }).display
    setNumericDisplayValue(nextDisplay)
  }, [allowDecimal, allowNegative, defaultValue, isNumericInput, value])

  const handleFocus: React.FocusEventHandler<HTMLInputElement> = (event) => {
    onFocus?.(event)
    if (event.defaultPrevented || !isNumericInput) return

    const normalized = normalizeFormattedNumberInput(event.currentTarget.value, {
      allowDecimal,
      allowNegative,
    })
    if (!normalized.isZero) return

    const input = event.currentTarget
    requestAnimationFrame(() => {
      input.setSelectionRange(0, input.value.length)
    })
  }

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!isNumericInput) {
      onChange?.(event)
      return
    }

    const normalized = normalizeFormattedNumberInput(event.currentTarget.value, {
      allowDecimal,
      allowNegative,
    })
    setNumericDisplayValue(normalized.display)

    const syntheticEvent = {
      ...event,
      target: {
        ...event.target,
        name: event.target.name,
        value: normalized.raw,
      },
      currentTarget: {
        ...event.currentTarget,
        name: event.currentTarget.name,
        value: normalized.raw,
      },
    } as React.ChangeEvent<HTMLInputElement>

    onChange?.(syntheticEvent)

    const input = event.currentTarget
    requestAnimationFrame(() => {
      if (document.activeElement !== input) return
      const caretPosition = input.value.length
      input.setSelectionRange(caretPosition, caretPosition)
    })
  }

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = (event) => {
    if (isNumericInput) {
      const normalized = normalizeFormattedNumberInput(event.currentTarget.value, {
        allowDecimal,
        allowNegative,
      })

      if (normalized.raw !== event.currentTarget.value) {
        const syntheticEvent = {
          ...event,
          target: {
            ...event.target,
            name: event.target.name,
            value: normalized.raw,
          },
          currentTarget: {
            ...event.currentTarget,
            name: event.currentTarget.name,
            value: normalized.raw,
          },
        } as unknown as React.FocusEvent<HTMLInputElement>

        onBlur?.(syntheticEvent)
        return
      }
    }

    onBlur?.(event)
  }

  return (
    <input
      ref={ref}
      type={isNumericInput ? 'text' : type}
      inputMode={isNumericInput ? (allowDecimal ? 'decimal' : 'numeric') : inputMode}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-10 w-full min-w-0 rounded-xl border bg-background/88 px-3.5 py-2 text-[15px] text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_1px_2px_rgba(2,6,23,0.24)] sm:h-9 sm:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      value={isNumericInput ? numericDisplayValue : displayValue}
      defaultValue={isNumericInput ? undefined : displayDefaultValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  )
})

export { Input }
