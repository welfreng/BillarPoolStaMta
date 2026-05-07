'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { movementReasonLabels, movementReasonsByType, movementTypeLabels } from '@/lib/admin/catalogs';
import type { Product } from '@/lib/admin/types';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const movementSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  variantId: z.string().default(''),
  type: z.enum(['entry', 'exit', 'adjustment']),
  reason: z.enum(['purchase', 'sale', 'gift', 'manual-adjustment', 'damage', 'initial-load', 'transfer']),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  notes: z.string().min(4, 'Agrega una observacion breve'),
  responsibleUser: z.string().min(2, 'Ingresa el responsable'),
});

export type MovementFormValues = z.infer<typeof movementSchema>;

const defaultValues: MovementFormValues = {
  productId: '',
  variantId: '',
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
  const movementFormId = useId();
  const form = useForm<MovementFormValues>({
    resolver: zodResolver(
      movementSchema
        .superRefine((values, ctx) => {
          const selectedProduct = products.find((product) => product.id === values.productId);
          if (!selectedProduct) return;

          if ((selectedProduct.variants?.length ?? 0) > 0 && !values.variantId.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Selecciona la variante para registrar este movimiento.',
              path: ['variantId'],
            });
          }
        })
    ),
    defaultValues,
  });
  const selectedType = form.watch('type');
  const selectedProductId = form.watch('productId');
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const selectedVariantOptions = selectedProduct?.variants ?? [];
  const availableReasons = useMemo(
    () => [...(movementReasonsByType[selectedType] ?? movementReasonsByType.entry)] as MovementFormValues['reason'][],
    [selectedType]
  );

  useEffect(() => {
    const currentReason = form.getValues('reason') as MovementFormValues['reason'];
    if (!availableReasons.includes(currentReason)) {
      form.setValue('reason', availableReasons[0], { shouldValidate: true });
    }
  }, [availableReasons, form]);

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar movimiento de inventario"
      description="Usa opciones simples para registrar entradas, salidas o ajustes del stock."
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button form={movementFormId} type="submit">
            Guardar movimiento
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={movementFormId}
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(defaultValues);
            })}
            className="space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Producto</FormLabel>
                    <FormControl>
                            <SearchableSelect
                              value={field.value}
                              onChange={(value) => {
                                field.onChange(value);
                                form.setValue('variantId', '', { shouldValidate: true });
                              }}
                              placeholder="Selecciona producto"
                              searchPlaceholder="Buscar producto..."
                              emptyLabel="No se encontraron productos."
                              recentStorageKey="inventory-movement-products"
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
              {selectedVariantOptions.length > 0 ? (
                <FormField
                  control={form.control}
                  name="variantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{selectedProduct?.variantLabel || 'Variante'}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecciona una variante" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {selectedVariantOptions.map((variant) => (
                            <SelectItem key={variant.id} value={variant.id}>
                              {variant.name} ({variant.stock})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-slate-500">
                        Este producto maneja stock por variante. Debes elegir una antes de guardar.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
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

          </form>
        </Form>
    </AdminResponsiveDialog>
  );
}
