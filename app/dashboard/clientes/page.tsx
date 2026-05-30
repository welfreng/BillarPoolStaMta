'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Pencil, Plus, Search, UserRound } from 'lucide-react';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { ResponsiveRowActions } from '@/components/admin/shared/responsive-row-actions';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/admin/calculations';
import type { Customer } from '@/lib/admin/types';

type CustomerFormState = {
  fullName: string;
  phone: string;
  documentNumber: string;
};

const emptyForm: CustomerFormState = {
  fullName: '',
  phone: '',
  documentNumber: '',
};

function getInitialForm(customer?: Customer | null): CustomerFormState {
  return {
    fullName: customer?.fullName ?? '',
    phone: customer?.phone ?? '',
    documentNumber: customer?.documentNumber ?? '',
  };
}

export default function ClientesPage() {
  const { customers, createCustomer, updateCustomer } = useAdminData();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formState, setFormState] = useState<CustomerFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return customers;

    return customers.filter((customer) =>
      `${customer.fullName} ${customer.phone ?? ''} ${customer.documentNumber ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [customers, query]);

  const customersWithPhone = customers.filter((customer) => customer.phone?.trim()).length;
  const identifiedCustomers = customers.filter((customer) => customer.documentNumber?.trim()).length;
  const totalCustomerRevenue = customers.reduce((sum, customer) => sum + customer.totalRevenue, 0);

  const openNewCustomerDialog = () => {
    setEditingCustomer(null);
    setFormState(emptyForm);
    setOpenDialog(true);
  };

  const openEditCustomerDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormState(getInitialForm(customer));
    setOpenDialog(true);
  };

  const handleSubmit = async () => {
    try {
      setIsSaving(true);
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, formState);
        toast({ title: 'Cliente actualizado', description: 'Los datos quedaron guardados.' });
      } else {
        await createCustomer(formState);
        toast({ title: 'Cliente creado', description: 'Ya puedes seleccionarlo al registrar ventas.' });
      }

      setOpenDialog(false);
      setEditingCustomer(null);
      setFormState(emptyForm);
    } catch (error) {
      console.error('Error guardando cliente:', error);
      toast({
        title: 'No se pudo guardar el cliente',
        description: error instanceof Error ? error.message : 'Revisa los datos e intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Relaciones comerciales"
        title="Clientes"
        description="Administra una base simple de clientes para acelerar ventas, facturas e historial sin volver pesado el registro."
        actions={
          <Button onClick={openNewCustomerDialog} className="w-full rounded-xl sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo cliente
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Clientes registrados</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatNumber(customers.length)}</p>
        </div>
        <div className="rounded-[28px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Con telefono</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatNumber(customersWithPhone)}</p>
        </div>
        <div className="rounded-[28px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Con CC/NIT</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatNumber(identifiedCustomers)}</p>
        </div>
        <div className="rounded-[28px] border border-cyan-200 bg-cyan-50/90 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-cyan-900/70 dark:bg-cyan-950/25 sm:p-6">
          <p className="text-sm text-cyan-800 dark:text-cyan-200">Ventas asociadas</p>
          <p className="mt-3 text-2xl font-semibold text-cyan-950 dark:text-cyan-50">{formatCurrency(totalCustomerRevenue)}</p>
        </div>
      </div>

      <div className="min-w-0 space-y-4 rounded-[28px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, telefono o cedula"
            className="rounded-2xl border-slate-200 bg-white/90 pl-9 shadow-sm dark:border-slate-700 dark:bg-slate-900/75"
          />
        </div>

        {filteredCustomers.length > 0 ? (
          <>
            <div className="space-y-3 md:hidden">
              {filteredCustomers.map((customer) => (
                <div key={customer.id} className="rounded-[22px] border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950 dark:text-slate-100">{customer.fullName}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{customer.phone || 'Sin telefono'}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{customer.documentNumber || 'Sin CC/NIT'}</p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {formatNumber(customer.saleCount)} compras · {formatCurrency(customer.totalRevenue)}
                      </p>
                    </div>
                    <ResponsiveRowActions
                      actions={[
                        {
                          label: 'Editar',
                          icon: <Pencil className="h-4 w-4" />,
                          onClick: () => openEditCustomerDialog(customer),
                        },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden rounded-2xl border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-900/40 md:block">
              <Table className="min-w-[860px] bg-white/90 dark:bg-slate-950/40">
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefono</TableHead>
                    <TableHead>CC/NIT</TableHead>
                    <TableHead>Compras</TableHead>
                    <TableHead>Total comprado</TableHead>
                    <TableHead>Ultima compra</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.fullName}</TableCell>
                      <TableCell>{customer.phone || 'No registrado'}</TableCell>
                      <TableCell>{customer.documentNumber || 'No registrado'}</TableCell>
                      <TableCell>{formatNumber(customer.saleCount)}</TableCell>
                      <TableCell>{formatCurrency(customer.totalRevenue)}</TableCell>
                      <TableCell>
                        {customer.lastSaleAt ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                            {formatDateTime(customer.lastSaleAt)}
                          </span>
                        ) : (
                          'Sin compras'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <ResponsiveRowActions
                          actions={[
                            {
                              label: 'Editar',
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => openEditCustomerDialog(customer),
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <Empty>
            <EmptyMedia>
              <UserRound className="h-6 w-6" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No hay clientes para mostrar</EmptyTitle>
              <EmptyDescription>
                Crea un cliente manualmente o registra una venta con nombre real para alimentarlo automaticamente.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <AdminResponsiveDialog
        open={openDialog}
        onOpenChange={(nextOpen) => {
          if (isSaving) return;
          setOpenDialog(nextOpen);
        }}
        title={editingCustomer ? 'Editar cliente' : 'Nuevo cliente'}
        description="Guarda solo los datos necesarios para agilizar ventas y facturas."
        busy={isSaving}
        busyTitle="Guardando cliente..."
        desktopContentClassName="sm:max-w-lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpenDialog(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSaving}>
              {editingCustomer ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre completo</Label>
            <Input
              value={formState.fullName}
              onChange={(event) => setFormState((current) => ({ ...current, fullName: event.target.value }))}
              placeholder="Ej: Juan Perez"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input
                value={formState.phone}
                onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Opcional"
                inputMode="tel"
              />
            </div>
            <div className="space-y-2">
              <Label>Cedula o NIT</Label>
              <Input
                value={formState.documentNumber}
                onChange={(event) => setFormState((current) => ({ ...current, documentNumber: event.target.value }))}
                placeholder="Opcional"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>
      </AdminResponsiveDialog>
    </div>
  );
}
