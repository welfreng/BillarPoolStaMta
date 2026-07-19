'use client';

import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { ProductCategoryRecord, ProductSubcategory } from '@/lib/admin/types';

const schema = z.object({
  label: z.string().min(2, 'Ingresa un nombre valido'),
  status: z.enum(['active', 'inactive']).default('active'),
});

export type SubcategoryFormValues = z.infer<typeof schema>;

export function SubcategoryFormDialog({
  open,
  onOpenChange,
  category,
  subcategory,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: ProductCategoryRecord;
  subcategory?: ProductSubcategory;
  onSubmit: (values: SubcategoryFormValues) => Promise<void> | void;
}) {
  const subcategoryFormId = useId();
  const form = useForm<SubcategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: '',
      status: 'active',
    },
  });
  const isSubmitting = form.formState.isSubmitting;

  useEffect(() => {
    form.reset({
      label: subcategory?.label ?? '',
      status: subcategory?.status ?? 'active',
    });
  }, [form, open, subcategory]);

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title={subcategory ? 'Editar subcategoria' : 'Nueva subcategoria'}
      description={
        category
          ? `Administra la estructura interna de ${category.label}.`
          : 'Selecciona primero una categoria.'
      }
      busy={isSubmitting}
      busyTitle={subcategory ? 'Guardando subcategoria...' : 'Creando subcategoria...'}
      busyDescription="Espera la confirmacion antes de continuar."
      desktopContentClassName="sm:max-w-md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form={subcategoryFormId} type="submit" disabled={!category || isSubmitting}>
            {isSubmitting ? 'Guardando...' : subcategory ? 'Guardar cambios' : 'Crear subcategoria'}
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form id={subcategoryFormId} onSubmit={form.handleSubmit(async (values) => onSubmit(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Grafito" {...field} disabled={!category} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {subcategory ? (
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
