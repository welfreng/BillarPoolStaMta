'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!isSubmitting}>
        {isSubmitting ? (
          <div className="absolute inset-0 z-40 grid place-items-center rounded-[26px] bg-background/82 px-4 text-center backdrop-blur-sm">
            <div className="grid max-w-sm place-items-center gap-3 rounded-xl border bg-card p-5 shadow-lg">
              <Spinner className="h-7 w-7 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {category ? 'Guardando categoria...' : 'Creando categoria...'}
                </p>
                <p className="text-xs text-muted-foreground">Espera la confirmacion antes de continuar.</p>
              </div>
            </div>
          </div>
        ) : null}
        <DialogHeader>
          <DialogTitle>{category ? 'Editar categoria' : 'Nueva categoria'}</DialogTitle>
          <DialogDescription>
            Crea una categoria base reutilizable para el catalogo de productos.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : category ? 'Guardar cambios' : 'Crear categoria'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
