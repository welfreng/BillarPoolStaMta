'use client';

import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface CompactAttributeControl {
  key: string;
  label: string;
  options: string[];
  selectedValues: string[];
  fixed?: boolean;
  searchable?: boolean;
  allowCustom?: boolean;
  optional?: boolean;
}

export interface CompactVariantRow {
  id: string;
  values: Record<string, string>;
  salePrice?: number;
  stock: number;
  sku: string;
  status: 'active' | 'inactive';
}

const OPTIONAL_ATTRIBUTE_EMPTY_VALUE = '__optional_empty__';

function getOptionalAttributeLabel(attributeLabel: string) {
  return `Sin ${attributeLabel.toLowerCase()}`;
}

export function VariantCompactEditor({
  attributes,
  rows,
  structureLocked,
  globalPrice,
  onToggleAttributeValue,
  onAddAttributeValue,
  onRowSalePriceChange,
  onRowStockChange,
  onRowSkuChange,
  onRowStatusChange,
  onAddRow,
  onRemoveRow,
  onRowAttributeChange,
  getRowAttributeOptions,
  hiddenColumns,
  manualRows,
  hideStockColumn,
  allowAttributeCorrectionWhenLocked,
  allowAddRowsWhenLocked,
}: {
  attributes: CompactAttributeControl[];
  rows: CompactVariantRow[];
  structureLocked: boolean;
  globalPrice?: {
    label: string;
    description: string;
    value: number;
    onChange: (value: number) => void;
  };
  onToggleAttributeValue: (attributeKey: string, value: string) => void;
  onAddAttributeValue: (attributeKey: string, value: string) => void;
  onRowSalePriceChange?: (rowIndex: number, value: number) => void;
  onRowStockChange: (rowIndex: number, value: number) => void;
  onRowSkuChange: (rowIndex: number, value: string) => void;
  onRowStatusChange: (rowIndex: number, value: 'active' | 'inactive') => void;
  onAddRow?: () => void;
  onRemoveRow?: (rowIndex: number) => void;
  onRowAttributeChange?: (rowIndex: number, attributeKey: string, value: string) => void;
  getRowAttributeOptions?: (rowIndex: number, attributeKey: string, fallbackOptions: string[]) => string[];
  hiddenColumns?: Array<'sku' | 'status'>;
  manualRows?: boolean;
  hideStockColumn?: boolean;
  allowAttributeCorrectionWhenLocked?: boolean;
  allowAddRowsWhenLocked?: boolean;
}) {
  const [openAttributeKey, setOpenAttributeKey] = useState<string | null>(null);
  const [customValueDrafts, setCustomValueDrafts] = useState<Record<string, string>>({});
  const hiddenColumnSet = new Set(hiddenColumns ?? []);
  const showDeleteColumn = manualRows && Boolean(onRemoveRow);
  const showStockColumn = !hideStockColumn;
  const attributeControlsDisabled = structureLocked && !allowAttributeCorrectionWhenLocked;

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="min-w-0 space-y-2.5 rounded-2xl bg-transparent p-0">
        {globalPrice ? (
          <div className="rounded-2xl border border-border bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/72">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{globalPrice.label}</p>
            <div className="mt-2 max-w-full sm:max-w-[220px]">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={globalPrice.value}
                onChange={(event) => globalPrice.onChange(Number(event.target.value || 0))}
                className="bg-background/88"
              />
            </div>
          </div>
        ) : null}

        {manualRows ? (
          <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card/88 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/72 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Variantes reales</p>
              <p className="mt-1 hidden text-sm text-slate-600 dark:text-slate-400 sm:block">
                Agrega solo las combinaciones que realmente existen en inventario.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl bg-card/88 sm:w-auto"
              disabled={structureLocked && !allowAddRowsWhenLocked}
              onClick={onAddRow}
            >
              Agregar variante
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {attributes.map((attribute) =>
              attribute.fixed ? (
                <div key={attribute.key} className="min-w-0 rounded-2xl border border-border bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/72">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{attribute.label}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {attribute.options.map((option) => (
                      <span
                        key={option}
                        className="inline-flex items-center rounded-full border border-border bg-background/88 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-200"
                      >
                        {option}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={attribute.key} className="min-w-0 rounded-2xl border border-border bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/72">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{attribute.label}</p>
                      <p className="mt-1 hidden text-sm text-slate-600 dark:text-slate-400 sm:block">
                        Selecciona los valores activos para regenerar la tabla sin duplicados.
                      </p>
                    </div>
                    <Popover
                      open={openAttributeKey === attribute.key}
                      onOpenChange={(open) => setOpenAttributeKey(open ? attribute.key : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-xl bg-card/88"
                          disabled={structureLocked}
                        >
                          Gestionar {attribute.label.toLowerCase()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-0" align="end">
                        <Command>
                          <CommandInput placeholder={`Buscar ${attribute.label.toLowerCase()}...`} />
                          <CommandList>
                            <CommandEmpty className="px-3 py-4 text-left">
                              {attribute.allowCustom ? (
                                <div className="space-y-2">
                                  <p className="text-sm text-slate-600 dark:text-slate-300">Agrega un valor nuevo para este atributo.</p>
                                  <Input
                                    value={customValueDrafts[attribute.key] ?? ''}
                                    onChange={(event) =>
                                      setCustomValueDrafts((current) => ({
                                        ...current,
                                        [attribute.key]: event.target.value,
                                      }))
                                    }
                                    placeholder={`Nuevo ${attribute.label.toLowerCase()}`}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="w-full rounded-lg"
                                    disabled={!customValueDrafts[attribute.key]?.trim()}
                                    onClick={() => {
                                      onAddAttributeValue(attribute.key, customValueDrafts[attribute.key] ?? '');
                                      setCustomValueDrafts((current) => ({ ...current, [attribute.key]: '' }));
                                    }}
                                  >
                                    Agregar valor nuevo
                                  </Button>
                                </div>
                              ) : (
                                `No se encontro ${attribute.label.toLowerCase()}.`
                              )}
                            </CommandEmpty>
                            <CommandGroup>
                              {attribute.options.map((option) => (
                                <CommandItem
                                  key={option}
                                  value={option}
                                  onSelect={() => onToggleAttributeValue(attribute.key, option)}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      attribute.selectedValues.some(
                                        (value) => value.toLowerCase() === option.toLowerCase()
                                      )
                                        ? 'opacity-100'
                                        : 'opacity-30'
                                    )}
                                  />
                                  <span className="truncate">{option}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {attribute.selectedValues.map((value) => (
                      <span
                        key={value}
                        className="inline-flex items-center rounded-full border border-border bg-background/88 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-200"
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

      </div>

      <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card/88 dark:border-slate-800 dark:bg-slate-950/72">
        <Table className={cn(manualRows ? 'min-w-[780px]' : 'min-w-[720px]')}>
          <TableHeader>
            <TableRow>
              {attributes.map((attribute) => (
                <TableHead key={attribute.key}>{attribute.label}</TableHead>
              ))}
              {!globalPrice ? <TableHead>Precio</TableHead> : null}
              {showStockColumn ? <TableHead>Stock</TableHead> : null}
              {!hiddenColumnSet.has('sku') ? <TableHead>SKU</TableHead> : null}
              {!hiddenColumnSet.has('status') ? <TableHead>Activa</TableHead> : null}
              {showDeleteColumn ? <TableHead className="w-[72px] text-right">Eliminar</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row, index) => (
                <TableRow key={row.id || `${index}-${Object.values(row.values).join('-')}`}>
                  {attributes.map((attribute) => (
                    <TableCell key={`${row.id}-${attribute.key}`} className="align-top">
                      {(() => {
                        const fallbackOptions = attribute.optional ? ['', ...attribute.options] : attribute.options;
                        const rowOptions = getRowAttributeOptions?.(index, attribute.key, fallbackOptions) ?? fallbackOptions;
                        const normalizedRowOptions = Array.from(new Set(rowOptions));
                        const selectOptions = normalizedRowOptions.map((option) => ({
                          value: option || OPTIONAL_ATTRIBUTE_EMPTY_VALUE,
                          label: option || getOptionalAttributeLabel(attribute.label),
                        }));
                        const rowValue = row.values[attribute.key] ?? '';
                        const selectValue = attribute.optional && !rowValue ? OPTIONAL_ATTRIBUTE_EMPTY_VALUE : rowValue;
                        const handleAttributeChange = (nextValue: string) => {
                          onRowAttributeChange?.(
                            index,
                            attribute.key,
                            nextValue === OPTIONAL_ATTRIBUTE_EMPTY_VALUE ? '' : nextValue
                          );
                        };

                        return manualRows ? (
                          attribute.searchable ? (
                            <SearchableSelect
                              value={selectValue}
                              onChange={handleAttributeChange}
                              placeholder={`Selecciona ${attribute.label.toLowerCase()}`}
                              searchPlaceholder={`Buscar ${attribute.label.toLowerCase()}...`}
                              emptyLabel={`No se encontro ${attribute.label.toLowerCase()}.`}
                              options={selectOptions}
                              disabled={attributeControlsDisabled}
                              allowCreate={attribute.allowCustom}
                              createLabel={`Crear "${attribute.label.toLowerCase()}"`}
                              onCreate={(value) => onAddAttributeValue(attribute.key, value)}
                              triggerClassName="min-h-11 sm:min-h-10"
                            />
                          ) : (
                            <Select
                              value={selectValue || undefined}
                              onValueChange={handleAttributeChange}
                              disabled={attributeControlsDisabled}
                            >
                              <SelectTrigger className="w-full min-w-[7rem] sm:w-[140px]">
                                <SelectValue placeholder={`Selecciona ${attribute.label.toLowerCase()}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {selectOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        ) : attribute.searchable && !attribute.fixed ? (
                          <SearchableSelect
                            value={selectValue}
                            onChange={(value) => onToggleAttributeValue(attribute.key, value)}
                            placeholder={`Selecciona ${attribute.label.toLowerCase()}`}
                            searchPlaceholder={`Buscar ${attribute.label.toLowerCase()}...`}
                            emptyLabel={`No se encontro ${attribute.label.toLowerCase()}.`}
                            options={selectOptions}
                            disabled
                          />
                        ) : (
                          <span className="text-sm text-slate-700 dark:text-slate-200">{row.values[attribute.key] ?? attribute.label}</span>
                        );
                      })()}
                    </TableCell>
                  ))}
                  {!globalPrice ? (
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={Number(row.salePrice ?? 0)}
                        onChange={(event) => onRowSalePriceChange?.(index, Number(event.target.value || 0))}
                        onFocus={(event) => {
                          if (event.target.value === '0') {
                            event.target.select();
                          }
                        }}
                        className="w-full min-w-[6.25rem] sm:w-[110px]"
                      />
                    </TableCell>
                  ) : null}
                  {showStockColumn ? (
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min="0"
                        value={row.stock}
                        disabled={structureLocked}
                        onChange={(event) => onRowStockChange(index, Number(event.target.value || 0))}
                        onFocus={(event) => {
                          if (event.target.value === '0') {
                            event.target.select();
                          }
                        }}
                        className="w-full min-w-[5.75rem] sm:w-[96px]"
                      />
                    </TableCell>
                  ) : null}
                  {!hiddenColumnSet.has('sku') ? (
                    <TableCell className="align-top">
                      <Input
                        value={row.sku}
                        placeholder="Opcional"
                        disabled={structureLocked}
                        onChange={(event) => onRowSkuChange(index, event.target.value)}
                        className="w-full min-w-[7rem] sm:w-[130px]"
                      />
                    </TableCell>
                  ) : null}
                  {!hiddenColumnSet.has('status') ? (
                    <TableCell className="align-top">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={row.status !== 'inactive'}
                          disabled={structureLocked}
                          onCheckedChange={(checked) => onRowStatusChange(index, checked ? 'active' : 'inactive')}
                        />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {row.status === 'inactive' ? 'No' : 'Si'}
                        </span>
                      </div>
                    </TableCell>
                  ) : null}
                  {showDeleteColumn ? (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={structureLocked}
                        onClick={() => onRemoveRow?.(index)}
                        aria-label="Eliminar variante"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={
                    attributes.length +
                    (globalPrice ? 0 : 1) +
                    (showStockColumn ? 1 : 0) +
                    (hiddenColumnSet.has('sku') ? 0 : 1) +
                    (hiddenColumnSet.has('status') ? 0 : 1) +
                    (showDeleteColumn ? 1 : 0)
                  }
                  className="py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  Agrega una variante para empezar a cargar combinaciones reales.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
