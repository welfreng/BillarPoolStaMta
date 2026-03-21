'use client';

import { useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { formatNumber } from '@/lib/admin/calculations';

const saleReturnSchema = z.object({
  returnedAt: z.string().min(1, 'Selecciona la fecha'),
  quantity: z.coerce.number().positive('Ingresa una cantidad valida'),
  notes: z.string().default(''),
});

export type SaleReturnFormValues = z.infer<typeof saleReturnSchema>;

const defaultValues: SaleReturnFormValues = {
  returnedAt: new Date().toISOString().slice(0, 10),
  quantity: 1,
  notes: '',
};

export function SaleReturnDialog({
  open,
  onOpenChange,
  remainingQuantity,
  productName,
  customerName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remainingQuantity: number;
  productName: string;
  customerName: string;
  onSubmit: (values: SaleReturnFormValues) => Promise<void> | void;
}) {
  const form = useForm<SaleReturnFormValues>({
    resolver: zodResolver(saleReturnSchema),
    defaultValues,
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      ...defaultValues,
      quantity: remainingQuantity > 0 ? 1 : 0,
    });
  }, [form, open, remainingQuantity]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg px-4 sm:w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Registrar devolucion</DialogTitle>
          <DialogDescription>
            Esta devolucion regresara unidades al inventario y ajustara la venta original.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">{productName}</p>
          <p className="mt-1">Cliente: {customerName}</p>
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
              <Button type="submit" disabled={remainingQuantity <= 0}>
                Guardar devolucion
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
