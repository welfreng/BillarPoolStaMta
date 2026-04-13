'use client';

import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import type { Supplier } from '@/lib/admin/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const supplierSchema = z.object({
  name: z.string().min(2, 'Ingresa el nombre del proveedor'),
  contactName: z.string().min(2, 'Ingresa el nombre del contacto'),
  phone: z.string().min(7, 'Ingresa un telefono valido'),
  city: z.string().min(2, 'Ingresa la ciudad'),
  notes: z.string().default(''),
  status: z.enum(['active', 'inactive']),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;

const defaultValues: SupplierFormValues = {
  name: '',
  contactName: '',
  phone: '',
  city: 'Santa Marta',
  notes: '',
  status: 'active',
};

export function SupplierFormDialog({
  open,
  onOpenChange,
  initialSupplier,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSupplier?: Supplier;
  onSubmit: (values: SupplierFormValues) => Promise<void> | void;
}) {
  const supplierFormId = useId();
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues,
  });

  useEffect(() => {
    if (!initialSupplier) {
      form.reset(defaultValues);
      return;
    }

    form.reset({
      name: initialSupplier.name,
      contactName: initialSupplier.contactName,
      phone: initialSupplier.phone,
      city: initialSupplier.city,
      notes: initialSupplier.notes,
      status: initialSupplier.status,
    });
  }, [form, initialSupplier]);

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}
      description="Registra los datos clave del proveedor para usarlo luego en las compras."
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button form={supplierFormId} type="submit">
            {initialSupplier ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={supplierFormId}
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(defaultValues);
            })}
            className="space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proveedor</FormLabel>
                    <FormControl>
                      <Input placeholder="Distribuidora Norte" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contacto</FormLabel>
                    <FormControl>
                      <Input placeholder="Carlos Perez" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input placeholder="+57 300 000 0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ciudad</FormLabel>
                    <FormControl>
                      <Input placeholder="Santa Marta" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="inactive">Inactivo</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Textarea rows={4} placeholder="Marcas que maneja, tiempos de entrega, observaciones..." {...field} />
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
