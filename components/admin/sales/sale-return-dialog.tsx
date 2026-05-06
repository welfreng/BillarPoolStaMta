'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Minus, Plus, Trash2 } from 'lucide-react';
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
  const form = useForm<SaleReturnFormValues>({
    resolver: zodResolver(saleReturnSchema),
    defaultValues,
  });

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[96vw] overflow-y-auto px-4 pb-24 sm:w-[calc(100vw-2rem)] sm:px-5 sm:pb-6 lg:max-w-4xl lg:px-6">
        <DialogHeader>
          <DialogTitle>Registrar devolucion</DialogTitle>
          <DialogDescription>
            Selecciona un producto de la venta, mira cuantas unidades compro el cliente y ajusta la devolucion con botones rapidos.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Cliente: {customerName}</p>
          <p className="mt-1">Puedes agregar varios productos a la misma devolucion sin llenar una lista larga.</p>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(defaultValues);
            })}
            className="space-y-4"
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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
                <div className="mt-4 grid gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">Producto</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedSaleProduct?.name ?? 'Producto'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">Unidades compradas</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatNumber(selectedSale.quantity)} uds</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">Pendiente por devolver</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatNumber(selectedSalePending)} uds</p>
                  </div>
                </div>
              ) : null}
            </div>

            {fields.length > 0 ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                  <p className="text-sm font-medium text-emerald-950">Resumen de la devolucion</p>
                  <p className="mt-1 text-sm text-emerald-800">
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
                    <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{product?.name ?? 'Producto'}</p>
                          <p className="mt-1 text-sm text-slate-500">
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
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
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

            <DialogFooter className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={fields.length === 0}>
                Guardar devolucion
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
