'use client';

import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import type { AppUserAccount } from '@/lib/admin/types';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const userBaseSchema = z.object({
  nombre: z.string().min(2, 'Ingresa el nombre'),
  email: z.string().email('Email invalido'),
  telefono: z.string().min(7, 'Ingresa un telefono valido'),
  role: z.enum(['superadmin', 'admin', 'sales']),
  status: z.enum(['active', 'inactive']),
});

const createUserSchema = userBaseSchema.extend({
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
  confirmPassword: z.string().min(6, 'Confirma la contrasena'),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'Las contrasenas no coinciden',
  path: ['confirmPassword'],
});

const updateUserSchema = userBaseSchema.extend({
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
}).superRefine((values, context) => {
  const hasPassword = Boolean(values.password?.trim() || values.confirmPassword?.trim());
  if (!hasPassword) return;

  if ((values.password?.length ?? 0) < 6) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La contrasena debe tener al menos 6 caracteres',
      path: ['password'],
    });
  }

  if ((values.password ?? '') !== (values.confirmPassword ?? '')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Las contrasenas no coinciden',
      path: ['confirmPassword'],
    });
  }
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
export type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

const defaultValues: CreateUserFormValues = {
  nombre: '',
  email: '',
  telefono: '',
  password: '',
  confirmPassword: '',
  role: 'sales',
  status: 'active',
};

export function UserFormDialog({
  open,
  onOpenChange,
  initialUser,
  canManagePasswords = false,
  canManageEmails = false,
  canAssignSuperadmin = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUser?: AppUserAccount;
  canManagePasswords?: boolean;
  canManageEmails?: boolean;
  canAssignSuperadmin?: boolean;
  onSubmit: (values: CreateUserFormValues | UpdateUserFormValues) => Promise<void> | void;
}) {
  const dialogModeKey = initialUser?.id ?? 'new-user';
  const isEditing = Boolean(initialUser);
  const userFormId = useId();
  const form = useForm<CreateUserFormValues | UpdateUserFormValues>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    defaultValues,
  });

  useEffect(() => {
    if (!initialUser) {
      form.reset(defaultValues);
      return;
    }

    form.reset({
      nombre: initialUser.nombre,
      email: initialUser.email,
      telefono: initialUser.telefono,
      password: '',
      confirmPassword: '',
      role: initialUser.role,
      status: initialUser.status,
    });
  }, [form, initialUser]);

  return (
    <AdminResponsiveDialog
      key={dialogModeKey}
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Editar usuario' : 'Nuevo usuario'}
      description={
        isEditing
          ? 'Actualiza los datos operativos del usuario. El superadmin tambien puede corregir correo y contrasena.'
          : 'Crea un usuario del sistema y asigna su rol de acceso.'
      }
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button form={userFormId} type="submit">
            {isEditing ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={userFormId}
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(defaultValues);
            })}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} disabled={isEditing && !canManageEmails} />
                    </FormControl>
                    {isEditing ? (
                      <FormDescription>
                        {canManageEmails
                          ? 'Como superadmin puedes corregir el correo. El cambio se aplicara de forma segura en Firebase Auth y en el perfil del sistema.'
                          : 'El email tambien pertenece a Firebase Auth. Para cambiarlo de forma segura hace falta un backend con privilegios de administrador.'}
                      </FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telefono"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isEditing && (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contrasena</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar contrasena</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {isEditing && canManagePasswords ? (
              <div className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 md:grid-cols-2 dark:border-amber-900/40 dark:bg-amber-950/20">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nueva contrasena</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormDescription>
                        Solo un superadmin puede cambiar la contrasena de otro perfil.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar nueva contrasena</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {canAssignSuperadmin ? <SelectItem value="superadmin">Superadmin</SelectItem> : null}
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="sales">Ventas</SelectItem>
                      </SelectContent>
                    </Select>
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

          </form>
        </Form>
    </AdminResponsiveDialog>
  );
}
