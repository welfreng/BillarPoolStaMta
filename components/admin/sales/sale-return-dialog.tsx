'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber, getProductById } from '@/lib/admin/calculations';
import { getTodayDateInputValue } from '@/lib/admin/date-utils';
import type { Product, Sale } from '@/lib/admin/types';

const saleReturnLineSchema = z.object({
  saleId: z.string().min(1),
  quantity: z.coerce.number().min(1, 'Ingresa una cantidad valida'),
});

const saleReturnSchema = z
  .object({
    returnedAt: z.string().min(1, 'Selecciona la fecha'),
    items: z.array(saleReturnLineSchema).default([]),
    notes: z.string().default(''),
  })
  .superRefine((values, context) => {
    if (values.items.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Agrega al menos un producto para devolver.',
      });
    }
  });

export type SaleReturnFormValues = z.infer<typeof saleReturnSchema>;

const defaultValues: SaleReturnFormValues = {
  returnedAt: getTodayDateInputValue(),
  items: [],
  notes: '',
};

export function SaleReturnDialog({
  open,
  onOpenChange,
  sales,
  products,
  customerName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: Sale[];
  products: Product[];
  customerName: string;
  onSubmit: (values: SaleReturnFormValues) => Promise<void> | void;
}) {
  const returnFormId = useId();
  const form = useForm<SaleReturnFormValues>({
    resolver: zodResolver(saleReturnSchema),
    defaultValues,
  });
  const isSubmitting = form.formState.isSubmitting;

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const [selectedSaleId, setSelectedSaleId] = useState('');

  const returnableSales = useMemo(
    () =>
      sales.filter((sale) => {
        const remainingQuantity = sale.quantity - (sale.returnedQuantity ?? 0);
        return remainingQuantity > 0;
      }),
    [sales]
  );

  const selectedSale = returnableSales.find((sale) => sale.id === selectedSaleId) ?? null;
  const selectedSalePending = selectedSale
    ? Math.max(selectedSale.quantity - (selectedSale.returnedQuantity ?? 0), 0)
    : 0;
  const selectedSaleProduct = selectedSale ? getProductById(products, selectedSale.productId) : null;
  const selectedReturnItems = form.watch('items');
  const selectedProductsCount = selectedReturnItems.length;
  const selectedUnitsCount = selectedReturnItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  useEffect(() => {
    if (!open) return;
    form.reset({
      returnedAt: getTodayDateInputValue(),
      items: [],
      notes: '',
    });
    setSelectedSaleId(returnableSales[0]?.id ?? '');
  }, [form, open, returnableSales]);

  const selectedItemIds = new Set(fields.map((field) => field.saleId));
  const selectableSales = returnableSales.filter((sale) => !selectedItemIds.has(sale.id));

  const handleAddSale = () => {
    if (!selectedSale) return;
    append({ saleId: selectedSale.id, quantity: 1 });
    const remainingOptions = selectableSales.filter((sale) => sale.id !== selectedSale.id);
    setSelectedSaleId(remainingOptions[0]?.id ?? '');
  };

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title="Registrar devolucion"
      description="Selecciona los productos que vuelven, valida cantidades pendientes y deja la trazabilidad de la devolucion."
      busy={isSubmitting}
      busyTitle="Guardando devolucion..."
      busyDescription="Espera la confirmacion para evitar duplicados o cierres accidentales."
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
          <div className="hidden min-w-[190px] rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60 md:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">A devolver</p>
            <p className="font-semibold text-foreground">
              {formatNumber(selectedUnitsCount)} uds · {formatNumber(selectedProductsCount)} productos
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button form={returnFormId} type="submit" disabled={fields.length === 0 || isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar devolucion'}
            </Button>
          </div>
        </div>
      }
    >
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-slate-100">Cliente: {customerName}</p>
          <p className="mt-1">Puedes agregar varios productos a la misma devolucion sin llenar una lista larga.</p>
        </div>

        <Form {...form}>
          <form
            id={returnFormId}
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(defaultValues);
            })}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-border bg-card/92 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_auto] lg:items-end">
                <div className="space-y-2">
                  <FormLabel>Producto a devolver</FormLabel>
                  <Select value={selectedSaleId} onValueChange={setSelectedSaleId} disabled={selectableSales.length === 0}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona el producto" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableSales.map((sale) => {
                        const product = getProductById(products, sale.productId);
                        const pending = sale.quantity - (sale.returnedQuantity ?? 0);
                        return (
                          <SelectItem key={sale.id} value={sale.id}>
                            {(product?.name ?? 'Producto') + ` · Pendiente ${formatNumber(pending)}`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <Button type="button" className="rounded-xl" onClick={handleAddSale} disabled={!selectedSale}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar producto
                </Button>
              </div>

              {selectedSale ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-700 dark:text-cyan-200">Producto</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{selectedSaleProduct?.name ?? 'Producto'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-700 dark:text-cyan-200">Unidades compradas</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatNumber(selectedSale.quantity)} uds</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-700 dark:text-cyan-200">Pendiente por devolver</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatNumber(selectedSalePending)} uds</p>
                  </div>
                </div>
              ) : null}
            </div>

            {fields.length > 0 ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/22">
                  <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">Resumen de la devolucion</p>
                  <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200/80">
                    {formatNumber(selectedProductsCount)} producto(s) agregados · {formatNumber(selectedUnitsCount)} unidad(es) a devolver
                  </p>
                </div>

                {fields.map((field, index) => {
                  const sale = returnableSales.find((item) => item.id === field.saleId);
                  if (!sale) return null;

                  const product = getProductById(products, sale.productId);
                  const pending = Math.max(sale.quantity - (sale.returnedQuantity ?? 0), 0);
                  const selectedQuantity = Number(form.watch(`items.${index}.quantity`) ?? 1);

                  return (
                    <div key={field.id} className="rounded-2xl border border-border bg-card/92 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{product?.name ?? 'Producto'}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Compradas: {formatNumber(sale.quantity)} uds · Pendiente: {formatNumber(pending)} uds
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs text-slate-500">Cantidad a devolver</FormLabel>
                                <FormControl>
                                  <div
                                    className={`flex items-center overflow-hidden rounded-2xl border shadow-sm transition-colors ${
                                      selectedQuantity >= pending
                                        ? 'border-emerald-300 bg-emerald-50'
                                        : 'border-slate-200 bg-slate-50'
                                    }`}
                                  >
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className={`h-11 w-11 rounded-none border-r ${
                                        selectedQuantity >= pending ? 'border-emerald-200' : 'border-slate-200'
                                      }`}
                                      onClick={() =>
                                        form.setValue(`items.${index}.quantity`, Math.max(selectedQuantity - 1, 1), {
                                          shouldValidate: true,
                                        })
                                      }
                                      disabled={selectedQuantity <= 1}
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>
                                    <Input
                                      type="number"
                                      min="1"
                                      max={pending}
                                      {...field}
                                      className={`h-11 w-20 border-0 text-center text-base font-semibold shadow-none focus-visible:ring-0 ${
                                        selectedQuantity >= pending ? 'bg-emerald-50 text-emerald-800' : 'bg-white'
                                      }`}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className={`h-11 w-11 rounded-none border-l ${
                                        selectedQuantity >= pending ? 'border-emerald-200' : 'border-slate-200'
                                      }`}
                                      onClick={() =>
                                        form.setValue(`items.${index}.quantity`, Math.min(selectedQuantity + 1, pending), {
                                          shouldValidate: true,
                                        })
                                      }
                                      disabled={selectedQuantity >= pending}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </FormControl>
                                {selectedQuantity >= pending ? (
                                  <p className="mt-2 text-xs font-medium text-emerald-700">
                                    Llegaste al maximo pendiente para este producto.
                                  </p>
                                ) : null}
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                Agrega uno o varios productos para empezar la devolucion.
              </div>
            )}

            <FormField
              control={form.control}
              name="items"
              render={() => <FormMessage />}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="returnedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de devolucion</FormLabel>
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Motivo general de la devolucion" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </form>
        </Form>
    </AdminResponsiveDialog>
  );
}
