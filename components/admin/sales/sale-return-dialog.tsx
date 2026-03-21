'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import type { Product, Sale } from '@/lib/admin/types';

const saleReturnSchema = z.object({
  saleId: z.string().min(1, 'Selecciona el producto a devolver'),
  returnedAt: z.string().min(1, 'Selecciona la fecha'),
  quantity: z.coerce.number().positive('Ingresa una cantidad valida'),
  notes: z.string().default(''),
});

export type SaleReturnFormValues = z.infer<typeof saleReturnSchema>;

const defaultValues: SaleReturnFormValues = {
  saleId: '',
  returnedAt: new Date().toISOString().slice(0, 10),
  quantity: 1,
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

  const returnableSales = useMemo(
    () =>
      sales.filter((sale) => {
        const remainingQuantity = sale.quantity - (sale.returnedQuantity ?? 0);
        return remainingQuantity > 0;
      }),
    [sales]
  );

  const selectedSaleId = form.watch('saleId');
  const selectedSale = returnableSales.find((sale) => sale.id === selectedSaleId) ?? returnableSales[0] ?? null;
  const remainingQuantity = selectedSale
    ? Math.max(selectedSale.quantity - (selectedSale.returnedQuantity ?? 0), 0)
    : 0;
  const productName = selectedSale
    ? getProductById(products, selectedSale.productId)?.name ?? 'Producto'
    : 'Producto';

  useEffect(() => {
    if (!open) return;
    form.reset({
      ...defaultValues,
      saleId: returnableSales[0]?.id ?? '',
      quantity: returnableSales.length > 0 ? 1 : 0,
    });
  }, [form, open, returnableSales]);

  useEffect(() => {
    if (!selectedSale) return;
    form.setValue('quantity', remainingQuantity > 0 ? 1 : 0, { shouldValidate: true });
  }, [form, remainingQuantity, selectedSaleId, selectedSale]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg px-4 sm:w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Registrar devolucion</DialogTitle>
          <DialogDescription>
            Selecciona el producto de la factura que vas a devolver y la cantidad correspondiente.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Cliente: {customerName}</p>
          <p className="mt-1">Producto: {productName}</p>
          <p className="mt-1">Pendiente por devolver: {formatNumber(remainingQuantity)} uds</p>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(defaultValues);
            })}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="saleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Producto de la venta</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona producto" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {returnableSales.map((sale) => {
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
                  <FormMessage />
                </FormItem>
              )}
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
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad devuelta</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max={Math.max(remainingQuantity, 1)} {...field} />
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
                    <Textarea rows={3} placeholder="Motivo de la devolucion" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={returnableSales.length === 0 || remainingQuantity <= 0}>
                Guardar devolucion
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
