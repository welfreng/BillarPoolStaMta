'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  calculateMargin,
  calculatePurchaseTotals,
  formatCurrency,
  formatNumber,
} from '@/lib/admin/calculations';
import { presentationKindLabels } from '@/lib/admin/catalogs';
import type { Product } from '@/lib/admin/types';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const purchaseSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  supplier: z.string().min(2, 'Ingresa el proveedor'),
  purchasedAt: z.string().min(1, 'Selecciona la fecha'),
  presentationQuantity: z.coerce.number().positive('Cantidad invalida'),
  purchasePresentation: z.enum(['unit', 'dozen', 'box-12']),
  conversionFactor: z.coerce.number().min(1, 'Debe ser al menos 1'),
  purchaseValueTotal: z.coerce.number().min(0),
  shippingValueTotal: z.coerce.number().min(0),
  suggestedSalePrice: z.coerce.number().min(0),
});

export type PurchaseFormValues = z.infer<typeof purchaseSchema>;

const defaultValues: PurchaseFormValues = {
  productId: '',
  supplier: '',
  purchasedAt: new Date().toISOString().slice(0, 10),
  presentationQuantity: 1,
  purchasePresentation: 'unit',
  conversionFactor: 1,
  purchaseValueTotal: 0,
  shippingValueTotal: 0,
  suggestedSalePrice: 0,
};

export function PurchaseFormDialog({
  open,
  onOpenChange,
  products,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onSubmit: (values: PurchaseFormValues) => void;
}) {
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues,
  });

  const values = form.watch();
  const quantityPurchased = values.presentationQuantity * values.conversionFactor;
  const totals = useMemo(
    () => calculatePurchaseTotals(values.purchaseValueTotal, values.shippingValueTotal, quantityPurchased),
    [quantityPurchased, values.purchaseValueTotal, values.shippingValueTotal]
  );
  const estimatedMargin = calculateMargin(totals.realUnitCost, values.suggestedSalePrice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            El costo unitario real se calcula automaticamente para impactar el costo del producto.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((submittedValues) => {
              onSubmit(submittedValues);
              form.reset(defaultValues);
            })}
            className="space-y-5"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Producto</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
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
                name="supplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proveedor</FormLabel>
                    <FormControl>
                      <Input placeholder="Distribuidor oficial" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <FormField
                control={form.control}
                name="purchasedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de compra</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purchasePresentation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Presentacion</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unit">Unidad</SelectItem>
                        <SelectItem value="dozen">Docena</SelectItem>
                        <SelectItem value="box-12">Caja de 12</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="presentationQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad comprada</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="conversionFactor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Factor de conversion</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="purchaseValueTotal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor total de compra</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shippingValueTotal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor total de envio</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="suggestedSalePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio sugerido de venta</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
              <p className="text-sm font-medium text-emerald-950">Formula financiera aplicada</p>
              <p className="mt-2 text-sm leading-6 text-emerald-900">
                costo_unitario_real = (valor_total_compra + valor_total_envio) / cantidad_comprada
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs text-slate-500">Presentacion</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {presentationKindLabels[values.purchasePresentation]}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs text-slate-500">Unidades base</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatNumber(quantityPurchased)}</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs text-slate-500">Costo unitario real</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.realUnitCost)}</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs text-slate-500">Margen estimado</p>
                  <p className="mt-1 font-semibold text-slate-900">{estimatedMargin.toFixed(1)}%</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                El stock se impacta en unidades base para no romper el control entre unidad, docena y caja.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">Registrar compra</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
