'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { movementReasonLabels, movementReasonsByType, movementTypeLabels } from '@/lib/admin/catalogs';
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
import { Textarea } from '@/components/ui/textarea';

const movementSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  type: z.enum(['entry', 'exit', 'adjustment']),
  reason: z.enum(['purchase', 'sale', 'manual-adjustment', 'damage', 'initial-load', 'transfer']),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  notes: z.string().min(4, 'Agrega una observacion breve'),
  responsibleUser: z.string().min(2, 'Ingresa el responsable'),
});

export type MovementFormValues = z.infer<typeof movementSchema>;

const defaultValues: MovementFormValues = {
  productId: '',
  type: 'entry',
  reason: 'purchase',
  quantity: 1,
  notes: '',
  responsibleUser: 'Administrador',
};

export function MovementFormDialog({
  open,
  onOpenChange,
  products,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onSubmit: (values: MovementFormValues) => Promise<void> | void;
}) {
  const form = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues,
  });
  const selectedType = form.watch('type');
  const availableReasons = useMemo(
    () => movementReasonsByType[selectedType] ?? movementReasonsByType.entry,
    [selectedType]
  );

  useEffect(() => {
    const currentReason = form.getValues('reason');
    if (!availableReasons.includes(currentReason)) {
      form.setValue('reason', availableReasons[0], { shouldValidate: true });
    }
  }, [availableReasons, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto px-4 sm:w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Registrar movimiento de inventario</DialogTitle>
          <DialogDescription>
            Usa opciones simples para registrar entradas, salidas o ajustes del stock.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
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
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de movimiento</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="entry">{movementTypeLabels.entry}</SelectItem>
                        <SelectItem value="exit">{movementTypeLabels.exit}</SelectItem>
                        <SelectItem value="adjustment">{movementTypeLabels.adjustment}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableReasons.map((reason) => (
                          <SelectItem key={reason} value={reason}>
                            {movementReasonLabels[reason]}
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
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responsibleUser"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuario responsable</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>Observaciones</FormLabel>
                    <FormControl>
                      <Textarea rows={4} placeholder="Ejemplo: salida por venta en local o ajuste por conteo fisico" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar movimiento</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
