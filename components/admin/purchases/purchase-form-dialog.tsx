'use client';

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown, MinusCircle, PlusCircle } from 'lucide-react';
import {
  calculatePurchaseTotals,
  formatCurrency,
  formatNumber,
} from '@/lib/admin/calculations';
import type { Product, Supplier } from '@/lib/admin/types';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

const purchaseLineSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  presentationQuantity: z.coerce.number().positive('Cantidad invalida'),
  purchaseUnitValue: z.coerce.number().min(0),
  suggestedSalePrice: z.coerce.number().min(0),
});

const purchaseSchema = z.object({
  supplierId: z.string().optional(),
  supplier: z.string().min(2, 'Ingresa el proveedor'),
  purchasedAt: z.string().min(1, 'Selecciona la fecha'),
  shippingValueTotal: z.coerce.number().min(0),
  items: z.array(purchaseLineSchema).min(1, 'Agrega al menos un producto'),
});

export type PurchaseFormValues = z.infer<typeof purchaseSchema>;

const defaultLine: PurchaseFormValues['items'][number] = {
  productId: '',
  presentationQuantity: 1,
  purchaseUnitValue: 0,
  suggestedSalePrice: 0,
};

const defaultValues: PurchaseFormValues = {
  supplierId: '',
  supplier: '',
  purchasedAt: new Date().toISOString().slice(0, 10),
  shippingValueTotal: 0,
  items: [defaultLine],
};

function isPackOf12Product(product?: Product) {
  if (!product) return false;
  return /x\s*12/i.test(product.subcategory) || /x\s*12/i.test(product.name);
}

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

export function PurchaseFormDialog({
  open,
  onOpenChange,
  products,
  suppliers,
  initialValues,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  suppliers: Supplier[];
  initialValues?: PurchaseFormValues;
  onSubmit: (values: PurchaseFormValues) => Promise<void> | void;
}) {
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: initialValues ?? defaultValues,
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const [pack12NormalizedByField, setPack12NormalizedByField] = useState<Record<string, boolean>>({});

  useEffect(() => {
    form.reset(initialValues ?? defaultValues);
    setPack12NormalizedByField({});
  }, [form, initialValues, open]);

  const values = form.watch();
  const selectedSupplier = suppliers.find((supplier) => supplier.id === values.supplierId);

  useEffect(() => {
    if (!selectedSupplier) return;
    form.setValue('supplier', selectedSupplier.contactName || selectedSupplier.name, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [form, selectedSupplier]);
  const totalPurchaseValue = values.items.reduce(
    (sum, item) => sum + ((Number(item.purchaseUnitValue) || 0) * (Number(item.presentationQuantity) || 0)),
    0
  );
  const totalPurchasedUnits = values.items.reduce(
    (sum, item) => sum + (Number(item.presentationQuantity) || 0),
    0
  );

  const previewItems = useMemo(
    () =>
      values.items.map((item, index) => {
        const quantityPurchased = Number(item.presentationQuantity) || 0;
        const purchaseValueTotal = (Number(item.purchaseUnitValue) || 0) * (Number(item.presentationQuantity) || 0);
        const shippingShareBase =
          totalPurchasedUnits > 0
            ? Number((((Number(values.shippingValueTotal) || 0) * quantityPurchased) / totalPurchasedUnits).toFixed(2))
            : Number((((Number(values.shippingValueTotal) || 0) / Math.max(values.items.length, 1))).toFixed(2));
        const previousShipping = values.items
          .slice(0, index)
          .reduce((sum, previousItem) => {
            const previousUnits = Number(previousItem.presentationQuantity) || 0;
            const previousBase =
              totalPurchasedUnits > 0
                ? Number((((Number(values.shippingValueTotal) || 0) * previousUnits) / totalPurchasedUnits).toFixed(2))
                : Number((((Number(values.shippingValueTotal) || 0) / Math.max(values.items.length, 1))).toFixed(2));
            return sum + previousBase;
          }, 0);
        const shippingShare =
          index === values.items.length - 1
            ? Number((((Number(values.shippingValueTotal) || 0) - previousShipping)).toFixed(2))
            : shippingShareBase;
        const totals = calculatePurchaseTotals(
          purchaseValueTotal,
          shippingShare,
          quantityPurchased
        );
        return {
          index,
          purchaseValueTotal,
          quantityPurchased,
          shippingShare,
          totals,
        };
      }),
    [totalPurchasedUnits, values.items, values.shippingValueTotal]
  );
  const shippingPerUnit = totalPurchasedUnits > 0 ? (Number(values.shippingValueTotal) || 0) / totalPurchasedUnits : 0;

  const moveFocusToNextField = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLButtonElement && target.type === 'submit') return;

    event.preventDefault();

    const formElement = event.currentTarget;
    const focusableElements = Array.from(
      formElement.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), button:not([disabled]), [role="combobox"]:not([aria-disabled="true"])'
      )
    ).filter((element) => {
      if (element.getAttribute('type') === 'submit') return false;
      return element.offsetParent !== null;
    });

    const currentIndex = focusableElements.indexOf(target);
    if (currentIndex === -1) return;

    const nextElement = focusableElements[currentIndex + 1];
    nextElement?.focus();
  };

  const resetPack12Normalization = (fieldId: string) => {
    setPack12NormalizedByField((current) => ({
      ...current,
      [fieldId]: false,
    }));
  };

  const normalizePack12Line = (index: number, fieldId: string) => {
    if (pack12NormalizedByField[fieldId]) return;

    const item = form.getValues(`items.${index}`);
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!isPackOf12Product(product)) return;

    const quantityEntered = Number(item.presentationQuantity) || 0;
    const unitValueEntered = Number(item.purchaseUnitValue) || 0;

    if (quantityEntered < 12 || unitValueEntered <= 0) return;

    form.setValue(`items.${index}.presentationQuantity`, Number((quantityEntered / 12).toFixed(2)), {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue(`items.${index}.purchaseUnitValue`, Number((unitValueEntered * 12).toFixed(2)), {
      shouldValidate: true,
      shouldDirty: true,
    });
    setPack12NormalizedByField((current) => ({
      ...current,
      [fieldId]: true,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto px-3 sm:w-[calc(100vw-2rem)] sm:px-6">
        <DialogHeader>
          <DialogTitle>{initialValues ? 'Editar compra' : 'Registrar compra'}</DialogTitle>
          <DialogDescription>
            Registra una compra con uno o varios productos del mismo proveedor.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (submittedValues) => {
              await onSubmit(submittedValues);
              form.reset(defaultValues);
            })}
            onKeyDown={moveFocusToNextField}
            className="space-y-6"
          >
            <section className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6">
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-900">Datos generales de la compra</p>
                  <p className="text-sm text-slate-500">Selecciona o escribe el proveedor, define la fecha y luego registra el envio total del pedido.</p>
                </div>

                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Proveedor registrado</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            value={field.value ?? ''}
                            onChange={(value) => {
                              field.onChange(value);
                              const selectedSupplier = suppliers.find((supplier) => supplier.id === value);
                              if (selectedSupplier) {
                                form.setValue('supplier', selectedSupplier.name, { shouldValidate: true });
                              }
                            }}
                            placeholder="Selecciona proveedor"
                            searchPlaceholder="Buscar proveedor..."
                            emptyLabel="No se encontraron proveedores."
                            options={suppliers
                              .filter((supplier) => supplier.status === 'active')
                              .map((supplier) => ({
                                value: supplier.id,
                                label: supplier.name,
                              }))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <FormField
                    control={form.control}
                    name="purchasedAt"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Fecha de compra</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
                    <FormField
                      control={form.control}
                      name="shippingValueTotal"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="text-amber-950">Valor total de envio</FormLabel>
                          <FormControl>
                            <Input
                              className="min-w-0 h-12 border-amber-300 bg-white text-lg font-semibold"
                              type="number"
                              min="0"
                              step="0.01"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
            </section>

            <div className="space-y-4">
              <div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Productos de la compra</p>
                  <p className="text-sm text-slate-500">Agrega todas las referencias incluidas en este pedido.</p>
                </div>
              </div>

              {fields.map((field, index) => {
                const preview = previewItems[index];
                const selectedProduct = products.find((item) => item.id === values.items[index]?.productId);
                const isPack12 = isPackOf12Product(selectedProduct);
                return (
                  <div key={field.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-medium text-slate-900">Producto {index + 1}</p>
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                          <MinusCircle className="mr-2 h-4 w-4" />
                          Quitar
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-12">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field }) => (
                          <FormItem className="min-w-0 xl:col-span-12">
                            <FormLabel>Producto</FormLabel>
                            <FormControl>
                              <SearchableSelect
                                value={field.value}
                                onChange={(value) => {
                                  field.onChange(value);
                                  resetPack12Normalization(field.id);
                                  const product = products.find((item) => item.id === value);
                                  if (product) {
                                    form.setValue(`items.${index}.suggestedSalePrice`, product.salePrice, {
                                      shouldValidate: true,
                                    });
                                  }
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
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-12">
                      <FormField
                        control={form.control}
                        name={`items.${index}.presentationQuantity`}
                        render={({ field }) => (
                          <FormItem className="min-w-0 xl:col-span-4">
                            <FormLabel>{isPack12 ? 'Cantidad comprada en unidades' : 'Cantidad comprada'}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                {...field}
                                onChange={(event) => {
                                  field.onChange(event);
                                  resetPack12Normalization(fields[index].id);
                                }}
                                onBlur={(event) => {
                                  field.onBlur();
                                  normalizePack12Line(index, fields[index].id);
                                }}
                              />
                            </FormControl>
                            {isPack12 ? (
                              <p className="text-xs leading-5 text-slate-500">
                                Ingresa las unidades. Al salir del campo, el sistema las convierte a paquetes de 12.
                              </p>
                            ) : null}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.purchaseUnitValue`}
                        render={({ field }) => (
                          <FormItem className="min-w-0 xl:col-span-4">
                            <FormLabel>{isPack12 ? 'Valor unitario por pieza' : 'Valor unitario de compra'}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...field}
                                onChange={(event) => {
                                  field.onChange(event);
                                  resetPack12Normalization(fields[index].id);
                                }}
                                onBlur={() => {
                                  field.onBlur();
                                  normalizePack12Line(index, fields[index].id);
                                }}
                              />
                            </FormControl>
                            {isPack12 ? (
                              <p className="text-xs leading-5 text-slate-500">
                                Ingresa el valor por unidad. El sistema lo multiplica por 12 para dejar el valor por paquete.
                              </p>
                            ) : null}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.suggestedSalePrice`}
                        render={({ field }) => (
                          <FormItem className="min-w-0 xl:col-span-4">
                            <FormLabel>Precio sugerido de venta</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">
                          {isPack12 ? 'Cantidad convertida a paquetes' : 'Cantidad comprada'}
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatNumber(preview?.quantityPurchased ?? 0)} articulos
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Valor total compra</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(preview?.purchaseValueTotal ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Envio asignado</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(preview?.shippingShare ?? 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-start">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append({ ...defaultLine })}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Agregar producto
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">{initialValues ? 'Guardar cambios' : 'Registrar compra'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
