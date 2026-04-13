'use client';

import { useMemo, useState } from 'react';
import { Building2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { SupplierFormDialog, type SupplierFormValues } from '@/components/admin/suppliers/supplier-form-dialog';
import { ResponsiveRowActions } from '@/components/admin/shared/responsive-row-actions';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useToast } from '@/hooks/use-toast';
import type { Supplier } from '@/lib/admin/types';

export default function ProveedoresPage() {
  const { suppliers, purchases, createSupplier, updateSupplier, deleteSupplier } = useAdminData();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [query, setQuery] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>();

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) =>
      `${supplier.name} ${supplier.contactName} ${supplier.city} ${supplier.phone}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [query, suppliers]);

  const handleSave = async (values: SupplierFormValues) => {
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, values);
        toast({ title: 'Proveedor actualizado', description: 'Los cambios ya quedaron guardados.' });
      } else {
        await createSupplier(values);
        toast({ title: 'Proveedor creado', description: 'Ya puedes usarlo al registrar compras.' });
      }

      setEditingSupplier(undefined);
      setOpenDialog(false);
    } catch (error) {
      console.error('Error guardando proveedor en Firestore:', error);
      toast({
        title: 'No se pudo guardar el proveedor',
        description: 'Revisa la configuracion y permisos de Firebase.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    const purchasesCount = purchases.filter((purchase) => purchase.supplierId === supplier.id || purchase.supplier === supplier.name).length;
    if (purchasesCount > 0) {
      toast({
        title: 'No se puede eliminar',
        description: 'Este proveedor ya aparece en compras registradas.',
        variant: 'destructive',
      });
      return;
    }

    if (!window.confirm(`Deseas eliminar ${supplier.name}?`)) return;
    try {
      await deleteSupplier(supplier.id);
      toast({ title: 'Proveedor eliminado', description: 'El registro fue removido del panel.' });
    } catch (error) {
      console.error('Error eliminando proveedor en Firestore:', error);
      toast({
        title: 'No se pudo eliminar el proveedor',
        description: 'Firestore rechazo la operacion o la conexion fallo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Abastecimiento"
        title="Proveedores"
        description="Mantiene a la mano quien te vende cada linea de productos, con contacto y ciudad para facilitar compras futuras."
        actions={
          <Button
            onClick={() => {
              setEditingSupplier(undefined);
              setOpenDialog(true);
            }}
            className="w-full rounded-xl sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo proveedor
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Proveedores activos</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {suppliers.filter((supplier) => supplier.status === 'active').length}
          </p>
          <p className="mt-2 text-sm text-slate-500">Base de apoyo para compras recurrentes.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Total registrados</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{suppliers.length}</p>
          <p className="mt-2 text-sm text-slate-500">Control centralizado para evitar duplicados.</p>
        </div>
        <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4 shadow-sm sm:col-span-2 sm:p-6 lg:col-span-1">
          <p className="text-sm text-cyan-800">Uso recomendado</p>
          <p className="mt-3 text-lg font-semibold text-cyan-950">Primero crea el proveedor y luego registra la compra</p>
          <p className="mt-2 text-sm text-cyan-900">Asi el historial queda mas limpio y facil de consultar.</p>
        </div>
      </div>

      <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar proveedor, contacto o ciudad"
            className="pl-9"
          />
        </div>

        {filteredSuppliers.length > 0 ? (
          <div className="min-w-0">
            <div className="space-y-3 md:hidden">
              {filteredSuppliers.map((supplier) => (
                <div key={supplier.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{supplier.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{supplier.contactName}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {supplier.city} · {supplier.phone}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {supplier.status === 'active' ? 'Activo' : 'Inactivo'}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">{supplier.notes || 'Sin notas'}</p>
                    </div>
                    <ResponsiveRowActions
                      actions={[
                        {
                          label: 'Editar',
                          icon: <Pencil className="h-4 w-4" />,
                          onClick: () => {
                            setEditingSupplier(supplier);
                            setOpenDialog(true);
                          },
                        },
                        {
                          label: 'Eliminar',
                          icon: <Trash2 className="h-4 w-4" />,
                          onClick: () => handleDelete(supplier),
                          destructive: true,
                        },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-2 hidden text-xs text-slate-500 md:block">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
            <div className="hidden overflow-x-auto pb-2 md:block">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="sticky right-0 z-10 bg-white text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)]">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((supplier) => {
                  const rowHoverSummary = [
                    supplier.name,
                    `Contacto: ${supplier.contactName}`,
                    `Telefono: ${supplier.phone}`,
                    `Ciudad: ${supplier.city}`,
                    `Estado: ${supplier.status === 'active' ? 'Activo' : 'Inactivo'}`,
                    supplier.notes ? `Notas: ${supplier.notes}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n');
                  return (
                  <TableRow key={supplier.id} title={rowHoverSummary}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{supplier.name}</p>
                        <p className="text-xs text-slate-500">{supplier.notes || 'Sin notas'}</p>
                      </div>
                    </TableCell>
                    <TableCell>{supplier.contactName}</TableCell>
                    <TableCell>{supplier.phone}</TableCell>
                    <TableCell>{supplier.city}</TableCell>
                    <TableCell>{supplier.status === 'active' ? 'Activo' : 'Inactivo'}</TableCell>
                    <TableCell className="sticky right-0 bg-white text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)]">
                      <ResponsiveRowActions
                        actions={[
                          {
                            label: 'Editar',
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => {
                              setEditingSupplier(supplier);
                              setOpenDialog(true);
                            },
                          },
                          {
                            label: 'Eliminar',
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => handleDelete(supplier),
                            destructive: true,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
            </div>
          </div>
        ) : (
          <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2 className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No hay proveedores registrados</EmptyTitle>
              <EmptyDescription>
                Crea tu primer proveedor para organizar mejor las compras del negocio.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <SupplierFormDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        initialSupplier={editingSupplier}
        onSubmit={handleSave}
      />
    </div>
  );
}
