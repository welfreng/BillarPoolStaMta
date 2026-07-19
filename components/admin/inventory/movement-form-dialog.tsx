'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Activity, CalendarDays, PackageCheck } from 'lucide-react';
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
import { getTodayDateInputValue } from '@/lib/admin/date-utils';

const movementSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  variantId: z.string().default(''),
  type: z.enum(['entry', 'exit', 'adjustment']),
  reason: z.enum(['purchase', 'sale', 'gift', 'manual-adjustment', 'damage', 'initial-load', 'transfer']),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  occurredAt: z.string().min(1, 'Selecciona la fecha del movimiento'),
  notes: z.string().min(4, 'Agrega una observacion breve'),
  responsibleUser: z.string().min(2, 'Ingresa el responsable'),
});

export type MovementFormValues = z.infer<typeof movementSchema>;

function createDefaultValues(values?: Partial<MovementFormValues>): MovementFormValues {
  return {
    productId: '',
    variantId: '',
    type: 'entry',
    reason: 'purchase',
    quantity: 1,
    occurredAt: getTodayDateInputValue(),
    notes: '',
    responsibleUser: 'Administrador',
    ...values,
  };
}

export function MovementFormDialog({
  open,
  onOpenChange,
  products,
  onSubmit,
  initialValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onSubmit: (values: MovementFormValues) => Promise<void> | void;
  initialValues?: Partial<MovementFormValues>;
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
    defaultValues: createDefaultValues(),
  });
  const isSubmitting = form.formState.isSubmitting;
  const selectedType = form.watch('type');
  const selectedProductId = form.watch('productId');
  const selectedReason = form.watch('reason');
  const selectedQuantity = Number(form.watch('quantity') || 0);
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const selectedVariantOptions = selectedProduct?.variants ?? [];
  const availableReasons = useMemo(
    () => [...(movementReasonsByType[selectedType] ?? movementReasonsByType.entry)] as MovementFormValues['reason'][],
    [selectedType]
  );

  useEffect(() => {
    if (!open) return;
    form.reset(createDefaultValues(initialValues));
  }, [form, initialValues, open]);

  useEffect(() => {
    const currentReason = form.getValues('reason') as MovementFormValues['reason'];
    if (!availableReasons.includes(currentReason)) {
      form.setValue('reason', availableReasons[0], { shouldValidate: true });
    }
  }, [availableReasons, form]);

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title="Registrar movimiento de inventario"
      busy={isSubmitting}
      busyTitle="Guardando movimiento..."
      busyDescription="Espera la confirmacion para evitar movimientos duplicados."
      description="Usa opciones simples para registrar entradas, salidas o ajustes del stock."
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form={movementFormId} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar movimiento'}
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={movementFormId}
          onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(createDefaultValues());
            })}
            className="space-y-4"
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#071a3d_0%,#0d2b78_54%,#102b4e_100%)] text-white shadow-[0_18px_44px_rgba(8,22,47,0.22)] dark:border-slate-800">
              <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                <div className="sm:col-span-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                    <Activity className="h-3.5 w-3.5" />
                    Movimiento
                  </div>
                  <p className="mt-3 line-clamp-1 text-xl font-semibold tracking-[-0.02em]">
                    {selectedProduct?.name ?? 'Selecciona un producto'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Tipo</p>
                  <p className="mt-1 text-sm font-semibold">{movementTypeLabels[selectedType]}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Motivo</p>
                  <p className="mt-1 line-clamp-1 text-sm font-semibold">{movementReasonLabels[selectedReason]}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Cantidad</p>
                  <p className="mt-1 text-sm font-semibold">{selectedQuantity || 0} uds</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-border bg-card/92 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/78 sm:p-5 md:grid-cols-2">
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
              {selectedProduct ? (
                <div className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900/55 md:col-span-2">
                  <p className="inline-flex items-center gap-2 font-medium text-foreground">
                    <PackageCheck className="h-4 w-4 text-primary" />
                    {selectedProduct.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedVariantOptions.length > 0
                      ? 'Este producto maneja variantes; confirma la opcion exacta antes de guardar.'
                      : 'Producto simple; el movimiento afectara el stock general.'}
                  </p>
                </div>
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

            <div className="grid gap-4 rounded-2xl border border-border bg-muted/45 p-3 dark:border-slate-800 dark:bg-slate-900/45 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
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
                name="occurredAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      Fecha
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
