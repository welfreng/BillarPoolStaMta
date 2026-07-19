'use client';

import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { ProductCategoryRecord } from '@/lib/admin/types';

const schema = z.object({
  label: z.string().min(2, 'Ingresa un nombre valido'),
  status: z.enum(['active', 'inactive']).default('active'),
});

export type CategoryFormValues = z.infer<typeof schema>;

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: ProductCategoryRecord;
  onSubmit: (values: CategoryFormValues) => Promise<void> | void;
}) {
  const categoryFormId = useId();
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: '',
      status: 'active',
    },
  });
  const isSubmitting = form.formState.isSubmitting;

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors();
    try {
      await onSubmit(values);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la categoria. Revisa el nombre e intenta de nuevo.';

      form.setError('label', {
        type: 'manual',
        message,
      });
    }
  });

  useEffect(() => {
    form.reset({
      label: category?.label ?? '',
      status: category?.status ?? 'active',
    });
  }, [category, form, open]);

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title={category ? 'Editar categoria' : 'Nueva categoria'}
      description="Crea una categoria base reutilizable para el catalogo de productos."
      busy={isSubmitting}
      busyTitle={category ? 'Guardando categoria...' : 'Creando categoria...'}
      busyDescription="Espera la confirmacion antes de continuar."
      desktopContentClassName="sm:max-w-md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form={categoryFormId} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : category ? 'Guardar cambios' : 'Crear categoria'}
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form id={categoryFormId} onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Tacos" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {category ? (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl>
                      <select
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                        className="flex h-10 w-full rounded-xl border border-border bg-background/88 px-3 py-2 text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-100"
                      >
                        <option value="active">Activa</option>
                        <option value="inactive">Inactiva</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </form>
        </Form>
    </AdminResponsiveDialog>
  );
}
