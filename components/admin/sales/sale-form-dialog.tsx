'use client';

import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MinusCircle, PlusCircle } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatNumber, getProductRealUnitCost, getProductStock } from '@/lib/admin/calculations';
import type { InventoryMovement, Product, Purchase } from '@/lib/admin/types';

const allowedGiftCategories = new Set(['estuches', 'guantes']);

const saleGiftItemSchema = z.object({
  productId: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(0),
});

const saleSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  soldAt: z.string().min(1, 'Selecciona la fecha'),
  quantity: z.coerce.number().positive('Ingresa una cantidad valida'),
  unitPrice: z.coerce.number().min(0, 'Ingresa un precio valido'),
  includeGift: z.boolean().default(false),
  giftItems: z.array(saleGiftItemSchema).default([]),
  customerName: z.string().min(2, 'Ingresa el nombre del cliente o referencia'),
  notes: z.string().default(''),
}).superRefine((values, context) => {
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
  productId: '',
  soldAt: new Date().toISOString().slice(0, 10),
  quantity: 1,
  unitPrice: 0,
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
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'giftItems',
  });

  useEffect(() => {
    if (!open) return;
    form.reset(initialValues ?? defaultValues);
  }, [form, initialValues, open]);

  const values = form.watch();
  const selectedProduct = products.find((product) => product.id === values.productId);
  const giftProducts = products.filter(
    (product) =>
      product.id !== values.productId &&
      product.status === 'active' &&
      allowedGiftCategories.has(product.category)
  );
  const availableStock = selectedProduct ? getProductStock(movements, selectedProduct.id) : 0;
  const realUnitCost = selectedProduct ? getProductRealUnitCost(purchases, selectedProduct.id) : 0;
  const quantity = Number(values.quantity) || 0;
  const unitPrice = Number(values.unitPrice) || 0;
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
    const totalSale = quantity * unitPrice;
    const totalGiftCost = giftSummaries.reduce((sum, item) => sum + item.totalCost, 0);
    const totalCost = quantity * realUnitCost + totalGiftCost;
    return {
      totalSale,
      totalCost,
      totalGiftCost,
      grossProfit: totalSale - totalCost,
    };
  }, [giftSummaries, quantity, realUnitCost, unitPrice]);

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
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Producto</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        const product = products.find((item) => item.id === value);
                        if (product) {
                          form.setValue('unitPrice', product.salePrice, { shouldValidate: true });
                        }
                        const currentGiftItems = form.getValues('giftItems').map((giftItem) =>
                          giftItem.productId === value ? { ...giftItem, productId: '' } : giftItem
                        );
                        form.setValue('giftItems', currentGiftItems, { shouldValidate: true });
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona producto" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {products.map((product) => (
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

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max={Math.max(availableStock, 1)} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio por unidad</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
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
                            replace([{ productId: '', quantity: 1 }]);
                          } else if (form.getValues('giftItems').length === 0) {
                            replace([{ productId: '', quantity: 1 }]);
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
                {fields.map((giftField, index) => {
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
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
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
                    onClick={() => append({ productId: '', quantity: 1 })}
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
                  <p className="mt-1 font-semibold text-slate-900">{formatNumber(availableStock)} uds</p>
                </div>
                {!hideFinancialSummary && (
                  <>
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs text-slate-500">Costo unitario</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatCurrency(realUnitCost)}</p>
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
              {selectedProduct && availableStock === 0 ? (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  Este producto no tiene stock disponible.
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
