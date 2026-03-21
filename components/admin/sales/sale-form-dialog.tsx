'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown, MinusCircle, PlusCircle } from 'lucide-react';
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

const allowedGiftCategories = new Set(['estuches', 'guantes']);

const saleLineItemSchema = z.object({
  productId: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(0),
  unitPrice: z.coerce.number().min(0, 'Ingresa un precio valido').default(0),
});

const saleGiftItemSchema = z.object({
  productId: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(0),
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
          <CommandList>
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
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
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

const saleSchema = z.object({
  soldAt: z.string().min(1, 'Selecciona la fecha'),
  items: z.array(saleLineItemSchema).min(1, 'Agrega al menos un producto'),
  includeGift: z.boolean().default(false),
  giftItems: z.array(saleGiftItemSchema).default([]),
  customerName: z.string().min(2, 'Ingresa el nombre del cliente o referencia'),
  notes: z.string().default(''),
}).superRefine((values, context) => {
  values.items.forEach((item, index) => {
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
  });

  if (!values.includeGift) return;
  if (values.giftItems.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['giftItems'],
      message: 'Agrega al menos un obsequio',
    });
  }

  values.giftItems.forEach((item, index) => {
    if (!item.productId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['giftItems', index, 'productId'],
        message: 'Selecciona el producto obsequiado',
      });
    }

    if (item.quantity <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['giftItems', index, 'quantity'],
        message: 'La cantidad del obsequio debe ser mayor a cero',
      });
    }
  });
});

export type SaleFormValues = z.infer<typeof saleSchema>;

const defaultValues: SaleFormValues = {
  soldAt: new Date().toISOString().slice(0, 10),
  items: [{ productId: '', quantity: 1, unitPrice: 0 }],
  includeGift: false,
  giftItems: [{ productId: '', quantity: 1 }],
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
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const {
    fields: giftFields,
    append: appendGift,
    remove: removeGift,
    replace: replaceGifts,
  } = useFieldArray({
    control: form.control,
    name: 'giftItems',
  });

  useEffect(() => {
    if (!open) return;
    form.reset(initialValues ?? defaultValues);
  }, [form, initialValues, open]);

  useEffect(() => {
    if (!open) return;
    if (!initialValues?.items?.[0]?.productId) return;

    const focusTimer = window.setTimeout(() => {
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
    }, 50);

    return () => window.clearTimeout(focusTimer);
  }, [initialValues?.items, open]);

  const values = form.watch();
  const selectedProductIds = new Set(values.items.map((item) => item.productId).filter(Boolean));
  const giftProducts = products.filter(
    (product) =>
      !selectedProductIds.has(product.id) &&
      product.status === 'active' &&
      allowedGiftCategories.has(product.category)
  );
  const saleSummaries = values.items.map((saleItem) => {
    const product = products.find((item) => item.id === saleItem.productId);
    const stock = product ? getProductStock(movements, product.id) : 0;
    const realUnitCost = product ? getProductRealUnitCost(purchases, product.id) : 0;
    const quantity = Number(saleItem.quantity) || 0;
    const unitPrice = Number(saleItem.unitPrice) || 0;
    return {
      product,
      stock,
      quantity,
      unitPrice,
      realUnitCost,
      totalSale: quantity * unitPrice,
      totalCost: quantity * realUnitCost,
    };
  });
  const giftSummaries = values.includeGift
    ? values.giftItems.map((giftItem) => {
        const product = products.find((item) => item.id === giftItem.productId);
        const stock = product ? getProductStock(movements, product.id) : 0;
        const unitCost = product ? getProductRealUnitCost(purchases, product.id) : 0;
        const giftQuantity = Number(giftItem.quantity) || 0;
        return {
          product,
          stock,
          quantity: giftQuantity,
          totalCost: giftQuantity * unitCost,
        };
      })
    : [];

  const totals = useMemo(() => {
    const totalSale = saleSummaries.reduce((sum, item) => sum + item.totalSale, 0);
    const totalGiftCost = giftSummaries.reduce((sum, item) => sum + item.totalCost, 0);
    const totalCost = saleSummaries.reduce((sum, item) => sum + item.totalCost, 0) + totalGiftCost;
    return {
      totalSale,
      totalCost,
      totalGiftCost,
      grossProfit: totalSale - totalCost,
    };
  }, [giftSummaries, saleSummaries]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto px-4 sm:w-[calc(100vw-2rem)]">
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
            className="space-y-5"
          >
            <div className="grid gap-5 lg:grid-cols-[1.35fr_0.95fr]">
              <div className="space-y-4 lg:col-span-2">
                {fields.map((saleField, index) => {
                  const selectedProduct = products.find((product) => product.id === values.items[index]?.productId);
                  const availableStock = selectedProduct ? getProductStock(movements, selectedProduct.id) : 0;
                  return (
                    <div key={saleField.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productId`}
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
                                    form.setValue(`items.${index}.unitPrice`, product.salePrice, { shouldValidate: true });
                                  }
                                  const currentGiftItems = form.getValues('giftItems').map((giftItem) =>
                                    giftItem.productId === value ? { ...giftItem, productId: '' } : giftItem
                                  );
                                  form.setValue('giftItems', currentGiftItems, { shouldValidate: true });
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

                      <div className="grid gap-4 sm:grid-cols-[minmax(120px,0.7fr)_minmax(160px,1fr)_auto] sm:items-end">
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cantidad</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  max={Math.max(availableStock, 1)}
                                  {...field}
                                  ref={(element) => {
                                    field.ref(element);
                                    if (index === 0) quantityInputRef.current = element;
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitPrice`}
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
                        <div className="flex items-end sm:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                          >
                            <MinusCircle className="mr-2 h-4 w-4" />
                            Quitar
                          </Button>
                        </div>
                      </div>

                      {selectedProduct ? (
                        <div className="rounded-2xl bg-white p-3 text-sm text-slate-600">
                          <span className="font-medium text-slate-900">Stock:</span> {formatNumber(availableStock)} uds
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => append({ productId: '', quantity: 1, unitPrice: 0 })}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar producto
                  </Button>
                </div>
              </div>

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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

            <FormField
              control={form.control}
              name="includeGift"
              render={({ field }) => (
                <FormItem className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          const nextValue = checked === true;
                          field.onChange(nextValue);
                          if (!nextValue) {
                            replaceGifts([{ productId: '', quantity: 1 }]);
                          } else if (form.getValues('giftItems').length === 0) {
                            replaceGifts([{ productId: '', quantity: 1 }]);
                          }
                        }}
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel className="text-sm font-medium text-slate-950">
                        Incluye productos obsequiados
                      </FormLabel>
                      <p className="text-sm text-slate-500">
                        Usa este bloque para registrar estuches o guantes obsequiados en la venta.
                      </p>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {values.includeGift ? (
              <div className="space-y-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                {giftFields.map((giftField, index) => {
                  const selectedGiftProduct = products.find(
                    (product) => product.id === values.giftItems[index]?.productId
                  );
                  const availableGiftStock = selectedGiftProduct ? getProductStock(movements, selectedGiftProduct.id) : 0;

                  return (
                    <div key={giftField.id} className="grid gap-4 rounded-2xl bg-white p-4 sm:grid-cols-[1.4fr_0.7fr_auto]">
                      <FormField
                        control={form.control}
                        name={`giftItems.${index}.productId`}
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Producto obsequiado</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Selecciona estuche o guante" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {giftProducts.map((product) => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`giftItems.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cantidad</FormLabel>
                            <FormControl>
                              <Input type="number" min="1" max={Math.max(availableGiftStock, 1)} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => removeGift(index)}
                          disabled={giftFields.length === 1}
                        >
                          <MinusCircle className="mr-2 h-4 w-4" />
                          Quitar
                        </Button>
                      </div>
                      {selectedGiftProduct ? (
                        <div className="sm:col-span-3 rounded-2xl bg-violet-50 p-3 text-sm text-slate-600">
                          <span className="font-medium text-slate-900">Stock:</span> {formatNumber(availableGiftStock)} uds
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl bg-white"
                    onClick={() => appendGift({ productId: '', quantity: 1 })}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar obsequio
                  </Button>
                </div>
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Ejemplo: venta en mostrador o pedido especial" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-5">
              <p className="text-sm font-medium text-cyan-950">Resumen de la venta</p>
              <div className={`mt-4 grid gap-3 ${hideFinancialSummary ? 'sm:grid-cols-1 xl:grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs text-slate-500">Stock disponible</p>
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
                      <p className="text-xs text-slate-500">Costo del obsequio</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.totalGiftCost)}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs text-slate-500">Utilidad neta</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.grossProfit)}</p>
                    </div>
                  </>
                )}
              </div>
              {saleSummaries.some((item) => item.product && item.stock === 0) ? (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  Uno de los productos de la venta no tiene stock disponible.
                </p>
              ) : null}
              {values.includeGift && giftSummaries.some((gift) => gift.product && gift.stock === 0) ? (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  Uno de los productos obsequiados no tiene stock disponible.
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">{initialValues ? 'Actualizar venta' : 'Guardar venta'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
