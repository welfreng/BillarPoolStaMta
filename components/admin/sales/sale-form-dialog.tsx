'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown, MinusCircle, Pencil, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatNumber, getProductRealUnitCost, getProductStock } from '@/lib/admin/calculations';
import type { InventoryMovement, Product, Purchase } from '@/lib/admin/types';
import { cn } from '@/lib/utils';

const giftEligibleSaleCategories = new Set(['tacos']);
const allowedGiftCategories = new Set(['estuches', 'guantes']);
const saleGiftItemSchema = z.object({
  productId: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(0),
});

const saleLineItemSchema = z.object({
  productId: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(0),
  unitPrice: z.coerce.number().min(0, 'Ingresa un precio valido').default(0),
  giftItems: z.array(saleGiftItemSchema).default([]),
});

function SearchableSelect({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full min-w-0 justify-between overflow-hidden px-3 font-normal"
        >
          <span className="truncate text-left">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList
            ref={listRef}
            onWheel={(event) => {
              const element = listRef.current;
              if (!element) return;
              element.scrollTop += event.deltaY;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const saleSchema = z
  .object({
    soldAt: z.string().min(1, 'Selecciona la fecha'),
    items: z.array(saleLineItemSchema).min(1, 'Agrega al menos un producto'),
    customerName: z.string().min(2, 'Ingresa el nombre del cliente o referencia'),
    notes: z.string().default(''),
  })
  .superRefine((values, context) => {
    values.items.forEach((item, index) => {
      const selectedGiftCategories = new Set<string>();

      if (!item.productId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'productId'],
          message: 'Selecciona el producto',
        });
      }

      if (item.quantity <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'quantity'],
          message: 'La cantidad debe ser mayor a cero',
        });
      }

      item.giftItems.forEach((giftItem, giftIndex) => {
        if (!giftItem.productId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'productId'],
            message: 'Selecciona el obsequio',
          });
        }

        if (giftItem.quantity <= 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'quantity'],
            message: 'La cantidad del obsequio debe ser mayor a cero',
          });
        }

        if (giftItem.quantity !== 1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'quantity'],
            message: 'Cada obsequio debe llevar cantidad 1',
          });
        }

        const giftCategory = giftItem.productId ? giftItem.productId : '';
        if (selectedGiftCategories.has(giftCategory)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'productId'],
            message: 'No repitas el mismo obsequio en esta linea',
          });
        }
        selectedGiftCategories.add(giftCategory);
      });
    });
  });

export type SaleFormValues = z.infer<typeof saleSchema>;
type SaleLineFormValue = SaleFormValues['items'][number];
type GiftCategory = 'guantes' | 'estuches';

function createDefaultLineItem(): SaleLineFormValue {
  return {
    productId: '',
    quantity: 1,
    unitPrice: 0,
    giftItems: [],
  };
}

function normalizeGiftItems(items: SaleLineFormValue['giftItems'], products: Product[]) {
  const seenCategories = new Set<string>();

  return items.reduce<SaleLineFormValue['giftItems']>((accumulator, item) => {
    const productId = item.productId?.trim();
    if (!productId) return accumulator;

    const product = products.find((current) => current.id === productId);
    if (!product) return accumulator;
    if (!allowedGiftCategories.has(product.category)) return accumulator;
    if (seenCategories.has(product.category)) return accumulator;

    seenCategories.add(product.category);
    accumulator.push({ productId, quantity: 1 });
    return accumulator;
  }, []);
}

function getGiftProductIdByCategory(
  items: SaleLineFormValue['giftItems'],
  products: Product[],
  category: GiftCategory
) {
  return items.find((item) => products.find((product) => product.id === item.productId)?.category === category)?.productId ?? '';
}

function setGiftSelectionByCategory(
  line: SaleLineFormValue,
  products: Product[],
  category: GiftCategory,
  productId: string,
  enabled: boolean
) {
  const nextItems = normalizeGiftItems(
    line.giftItems.filter((item) => {
      const product = products.find((current) => current.id === item.productId);
      return product?.category !== category;
    }),
    products
  );

  if (enabled && productId) {
    nextItems.push({ productId, quantity: 1 });
  }

  return {
    ...line,
    giftItems: nextItems,
  };
}

const defaultValues: SaleFormValues = {
  soldAt: new Date().toISOString().slice(0, 10),
  items: [createDefaultLineItem()],
  customerName: 'Cliente mostrador',
  notes: '',
};

export function SaleFormDialog({
  open,
  onOpenChange,
  products,
  purchases,
  movements,
  initialValues,
  hideFinancialSummary = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  purchases: Purchase[];
  movements: InventoryMovement[];
  initialValues?: SaleFormValues | null;
  hideFinancialSummary?: boolean;
  onSubmit: (values: SaleFormValues) => Promise<void> | void;
}) {
  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues,
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [draftLine, setDraftLine] = useState<SaleLineFormValue>(createDefaultLineItem());
  const [lineError, setLineError] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const nextValues = initialValues
      ? {
          ...initialValues,
          items:
            initialValues.items.length > 0
              ? initialValues.items.map((item) => ({
                  ...item,
                  giftItems: normalizeGiftItems(item.giftItems, products),
                }))
              : [createDefaultLineItem()],
        }
      : defaultValues;
    form.reset(nextValues);
  }, [form, initialValues, open, products]);

  const values = form.watch();
  const firstItem = values.items[0] ?? createDefaultLineItem();

  const saleSummaries = values.items.map((saleItem) => {
    const product = products.find((item) => item.id === saleItem.productId);
    const stock = product ? getProductStock(movements, product.id) : 0;
    const realUnitCost = product ? getProductRealUnitCost(purchases, product.id) : 0;
    const quantity = Number(saleItem.quantity) || 0;
    const unitPrice = Number(saleItem.unitPrice) || 0;
    const giftItems = saleItem.giftItems.map((giftItem) => {
      const giftProduct = products.find((item) => item.id === giftItem.productId);
      const giftStock = giftProduct ? getProductStock(movements, giftProduct.id) : 0;
      const giftQuantity = Number(giftItem.quantity) || 0;
      const giftUnitCost = giftProduct ? getProductRealUnitCost(purchases, giftProduct.id) : 0;
      return {
        productId: giftItem.productId,
        product: giftProduct,
        stock: giftStock,
        quantity: giftQuantity,
        totalCost: giftQuantity * giftUnitCost,
      };
    });

    return {
      product,
      stock,
      quantity,
      unitPrice,
      totalSale: quantity * unitPrice,
      totalCost: quantity * realUnitCost,
      giftItems,
      giftTotalCost: giftItems.reduce((sum, item) => sum + item.totalCost, 0),
    };
  });

  const totals = useMemo(() => {
    const totalSale = saleSummaries.reduce((sum, item) => sum + item.totalSale, 0);
    const totalGiftCost = saleSummaries.reduce((sum, item) => sum + item.giftTotalCost, 0);
    const totalCost = saleSummaries.reduce((sum, item) => sum + item.totalCost, 0) + totalGiftCost;
    return {
      totalSale,
      totalCost,
      totalGiftCost,
      grossProfit: totalSale - totalCost,
    };
  }, [saleSummaries]);
  const firstLineSummary = saleSummaries[0] ?? null;
  const firstItemProduct = products.find((product) => product.id === firstItem.productId) ?? null;
  const firstItemCanHaveGift = firstItemProduct ? giftEligibleSaleCategories.has(firstItemProduct.category) : false;
  const draftProduct = products.find((product) => product.id === draftLine.productId) ?? null;
  const draftCanHaveGift = draftProduct ? giftEligibleSaleCategories.has(draftProduct.category) : false;

  const availableGiftOptionsByCategory = useMemo(() => {
    const baseOptions = products.filter((product) => product.status === 'active');
    return {
      guantes: baseOptions.filter((product) => product.category === 'guantes'),
      estuches: baseOptions.filter((product) => product.category === 'estuches'),
    } satisfies Record<GiftCategory, Product[]>;
  }, [products]);

  const openNewLineDialog = () => {
    setEditingLineIndex(null);
    setDraftLine(createDefaultLineItem());
    setLineError('');
    setLineDialogOpen(true);
  };

  const openEditLineDialog = (index: number) => {
    setEditingLineIndex(index);
    setDraftLine(values.items[index] ?? createDefaultLineItem());
    setLineError('');
    setLineDialogOpen(true);
  };

  const saveDraftLine = () => {
    const normalizedDraftLine = {
      ...draftLine,
      giftItems: normalizeGiftItems(draftLine.giftItems, products),
    };

    if (!normalizedDraftLine.productId) {
      setLineError('Selecciona el producto.');
      return;
    }
    if ((Number(normalizedDraftLine.quantity) || 0) <= 0) {
      setLineError('La cantidad debe ser mayor a cero.');
      return;
    }
    if (normalizedDraftLine.giftItems.length > 0) {
      const invalidGift = normalizedDraftLine.giftItems.find(
        (giftItem) => !giftItem.productId || Number(giftItem.quantity) !== 1
      );
      if (invalidGift) {
        setLineError('Revisa los obsequios de esta linea.');
        return;
      }
    }

    if (editingLineIndex === null) {
      append(normalizedDraftLine);
    } else {
      update(editingLineIndex, normalizedDraftLine);
    }

    setLineDialogOpen(false);
    setEditingLineIndex(null);
    setDraftLine(createDefaultLineItem());
    setLineError('');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[96vw] overflow-y-auto px-4 pb-24 sm:w-[calc(100vw-2rem)] sm:px-5 lg:max-w-[740px] lg:px-6 xl:px-7">
          <DialogHeader>
            <DialogTitle>{initialValues ? 'Editar venta' : 'Registrar venta'}</DialogTitle>
            <DialogDescription>
              {hideFinancialSummary
                ? 'Cada venta descuenta stock y mantiene actualizado el inventario.'
                : 'Cada venta descuenta stock y deja trazabilidad para los reportes del negocio.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(async (submittedValues) => {
                await onSubmit(submittedValues);
                form.reset(defaultValues);
              })}
              className="space-y-6"
            >
              <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Cliente o referencia</FormLabel>
                      <FormControl>
                        <Input placeholder="Cliente mostrador" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="soldAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de venta</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <section className="min-w-0 space-y-5 rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 lg:p-6">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Productos de la venta</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    El primer producto se elige aqui. Usa `Agregar producto` solo cuando la venta tenga mas lineas.
                  </p>
                </div>

                {fields.length <= 1 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-700">
                        #1
                      </span>
                      <p className="text-sm font-medium text-slate-900">Producto principal</p>
                    </div>
                    {firstLineSummary?.product ? (
                      <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">
                        Stock: {formatNumber(firstLineSummary.stock)} uds
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="items.0.productId"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel>Producto</FormLabel>
                          <FormControl>
                            <SearchableSelect
                              value={field.value}
                              onChange={(value) => {
                                field.onChange(value);
                                const product = products.find((item) => item.id === value);
                                if (product) {
                                  form.setValue('items.0.unitPrice', product.salePrice, { shouldValidate: true });
                                }
                                form.setValue(
                                  'items.0.giftItems',
                                  form.getValues('items.0.giftItems').filter((giftItem) => giftItem.productId !== value),
                                  { shouldValidate: true }
                                );
                              }}
                              placeholder="Selecciona producto"
                              searchPlaceholder="Buscar producto..."
                              emptyLabel="No se encontraron productos."
                              options={products.map((product) => ({
                                value: product.id,
                                label: `${product.name} - ${product.brand}`,
                              }))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 sm:grid-cols-[minmax(124px,0.72fr)_minmax(160px,0.92fr)] sm:items-end">
                      <FormField
                        control={form.control}
                        name="items.0.quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cantidad</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                max={Math.max(firstLineSummary?.stock ?? 1, 1)}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="items.0.unitPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Precio unidad</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {firstItemCanHaveGift ? (
                      <div className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                        <div>
                          <div>
                            <p className="text-sm font-medium text-slate-950">Obsequios de este taco</p>
                            <p className="text-sm text-slate-500">Solo aplica 1 guante y 1 estuche. No necesitas indicar cantidades.</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {(['guantes', 'estuches'] as GiftCategory[]).map((category) => {
                            const selectedProductId = getGiftProductIdByCategory(firstItem.giftItems, products, category);
                            const options = availableGiftOptionsByCategory[category];

                            return (
                              <div key={category} className="grid gap-3 rounded-2xl bg-white p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                                <label className="flex items-center gap-3">
                                  <Checkbox
                                    checked={Boolean(selectedProductId)}
                                    onCheckedChange={(checked) => {
                                      const enabled = checked === true;
                                      const fallbackProductId = options[0]?.id ?? '';
                                      const nextValue = enabled ? selectedProductId || fallbackProductId : '';
                                      form.setValue(
                                        'items.0',
                                        setGiftSelectionByCategory(
                                          form.getValues('items.0'),
                                          products,
                                          category,
                                          nextValue,
                                          enabled
                                        ),
                                        { shouldValidate: true }
                                      );
                                    }}
                                  />
                                  <span className="text-sm font-medium text-slate-900">
                                    {category === 'guantes' ? 'Incluir guante' : 'Incluir estuche'}
                                  </span>
                                </label>

                                <Select
                                  value={selectedProductId}
                                  onValueChange={(value) =>
                                    form.setValue(
                                      'items.0',
                                      setGiftSelectionByCategory(form.getValues('items.0'), products, category, value, true),
                                      { shouldValidate: true }
                                    )
                                  }
                                  disabled={!selectedProductId || options.length === 0}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue
                                      placeholder={
                                        category === 'guantes'
                                          ? 'Selecciona el guante a obsequiar'
                                          : 'Selecciona el estuche a obsequiar'
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {options.map((product) => (
                                      <SelectItem key={product.id} value={product.id}>
                                        {product.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : firstItem.productId ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                        Los obsequios solo aplican para tacos de billar.
                      </div>
                    ) : null}
                  </div>

                  {firstLineSummary?.product ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                      <span className="truncate">{firstLineSummary.product.name} - {firstLineSummary.product.brand || 'Sin marca'}</span>
                      <span className="font-medium text-slate-900">Total linea: {formatCurrency(firstLineSummary.totalSale)}</span>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {fields.length > 1 ? (
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const summary = saleSummaries[index];
                      return (
                        <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium text-slate-900">
                                {summary.product?.name ?? 'Producto'} x {formatNumber(summary.quantity)}
                              </p>
                              <p className="text-sm text-slate-500">
                                Precio unidad: {formatCurrency(summary.unitPrice)}
                              </p>
                              <p className="text-sm text-slate-500">
                                Total linea: {formatCurrency(summary.totalSale)}
                              </p>
                              {summary.giftItems.length > 0 ? (
                                <p className="text-sm text-violet-700">
                                  Obsequios: {summary.giftItems.map((giftItem) => `${giftItem.product?.name ?? 'Producto'} x ${formatNumber(giftItem.quantity)}`).join(', ')}
                                </p>
                              ) : (
                                <p className="text-sm text-slate-400">Sin obsequio</p>
                              )}
                            </div>

                            <div className="flex gap-2 sm:shrink-0">
                              <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => openEditLineDialog(index)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => remove(index)}>
                                <MinusCircle className="mr-2 h-4 w-4" />
                                Quitar
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    Si la venta tiene mas de un producto, usa `Agregar producto` para sumarlo a la lista.
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="items"
                  render={() => <FormMessage />}
                />

                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl bg-white"
                    onClick={openNewLineDialog}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar producto
                  </Button>

                  <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-emerald-950">Total acumulado de la compra</p>
                      <p className="text-xs text-emerald-800">
                        {formatNumber(saleSummaries.reduce((sum, item) => sum + item.quantity, 0))} unidades en {
                          formatNumber(fields.length)
                        } lineas
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-emerald-950">{formatCurrency(totals.totalSale)}</p>
                  </div>
                </div>
              </section>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea rows={4} placeholder="Ejemplo: venta en mostrador o pedido especial" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-5 sm:p-6">
                <p className="text-sm font-medium text-cyan-950">Resumen de la venta</p>
                <div className={`mt-4 grid gap-3 ${hideFinancialSummary ? 'sm:grid-cols-1 lg:grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs text-slate-500">Unidades en venta</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatNumber(saleSummaries.reduce((sum, item) => sum + item.quantity, 0))} uds
                    </p>
                  </div>
                  {!hideFinancialSummary && (
                    <>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Costo total productos</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(saleSummaries.reduce((sum, item) => sum + item.totalCost, 0))}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Ingreso total</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.totalSale)}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Costo total obsequios</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.totalGiftCost)}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Utilidad neta</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.grossProfit)}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="fixed inset-x-3 bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:inset-x-6 lg:hidden">
                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="rounded-xl">
                    {initialValues ? 'Actualizar venta' : 'Registrar venta'}
                  </Button>
                </div>
              </div>

              <DialogFooter className="hidden gap-3 border-t border-slate-200 pt-4 sm:flex sm:pt-5">
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="w-full sm:w-auto">
                  {initialValues ? 'Actualizar venta' : 'Registrar venta'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-xl px-4 sm:w-[calc(100vw-2rem)] sm:px-5">
          <DialogHeader>
            <DialogTitle>{editingLineIndex === null ? 'Agregar producto a la venta' : 'Editar producto de la venta'}</DialogTitle>
            <DialogDescription>
              Configura esta linea y al guardarla quedara en la lista de productos solicitados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Producto</Label>
              <SearchableSelect
                value={draftLine.productId}
                onChange={(value) => {
                  const product = products.find((item) => item.id === value);
                  setDraftLine((current) => ({
                    ...current,
                    productId: value,
                    unitPrice: product?.salePrice ?? current.unitPrice,
                    giftItems: current.giftItems.filter((giftItem) => giftItem.productId !== value),
                  }));
                  setLineError('');
                }}
                placeholder="Selecciona producto"
                searchPlaceholder="Buscar producto..."
                emptyLabel="No se encontraron productos."
                options={products.map((product) => ({
                  value: product.id,
                  label: `${product.name} - ${product.brand}`,
                }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  max={Math.max(draftLine.productId ? getProductStock(movements, draftLine.productId) : 1, 1)}
                  value={draftLine.quantity}
                  onChange={(event) => {
                    setDraftLine((current) => ({ ...current, quantity: Number(event.target.value) }));
                    setLineError('');
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Precio unidad</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftLine.unitPrice}
                  onChange={(event) => {
                    setDraftLine((current) => ({ ...current, unitPrice: Number(event.target.value) }));
                    setLineError('');
                  }}
                />
              </div>
            </div>

            {draftCanHaveGift ? (
              <div className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                <div>
                  <div>
                    <p className="text-sm font-medium text-slate-950">Obsequios de este taco</p>
                    <p className="text-sm text-slate-500">Solo aplica 1 guante y 1 estuche. No necesitas indicar cantidades.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(['guantes', 'estuches'] as GiftCategory[]).map((category) => {
                    const selectedProductId = getGiftProductIdByCategory(draftLine.giftItems, products, category);
                    const options = availableGiftOptionsByCategory[category];

                    return (
                      <div key={category} className="grid gap-3 rounded-2xl bg-white p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                        <label className="flex items-center gap-3">
                          <Checkbox
                            checked={Boolean(selectedProductId)}
                            onCheckedChange={(checked) => {
                              const enabled = checked === true;
                              const fallbackProductId = options[0]?.id ?? '';
                              const nextValue = enabled ? selectedProductId || fallbackProductId : '';
                              setDraftLine((current) =>
                                setGiftSelectionByCategory(current, products, category, nextValue, enabled)
                              );
                              setLineError('');
                            }}
                          />
                          <span className="text-sm font-medium text-slate-900">
                            {category === 'guantes' ? 'Incluir guante' : 'Incluir estuche'}
                          </span>
                        </label>

                        <Select
                          value={selectedProductId}
                          onValueChange={(value) => {
                            setDraftLine((current) =>
                              setGiftSelectionByCategory(current, products, category, value, true)
                            );
                            setLineError('');
                          }}
                          disabled={!selectedProductId || options.length === 0}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={
                                category === 'guantes'
                                  ? 'Selecciona el guante a obsequiar'
                                  : 'Selecciona el estuche a obsequiar'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : draftLine.productId ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Los obsequios solo aplican para tacos de billar.
              </div>
            ) : null}

            {lineError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {lineError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={() => setLineDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveDraftLine}>
              {editingLineIndex === null ? 'Agregar producto' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
