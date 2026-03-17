'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { MovementFormDialog } from '@/components/admin/inventory/movement-form-dialog';
import { useAdminData } from '@/components/admin/admin-data-context';
import { formatCurrency, formatDateTime, formatNumber, getKardexByProduct, getProductById } from '@/lib/admin/calculations';
import { useToast } from '@/hooks/use-toast';

export default function InventarioPage() {
  const { movements, products, registerMovement } = useAdminData();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [productId, setProductId] = useState('all');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? '');

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      const product = getProductById(products, movement.productId);
      const matchesQuery = `${product?.name ?? ''} ${movement.notes} ${movement.reason}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesType = type === 'all' || movement.type === type;
      const matchesProduct = productId === 'all' || movement.productId === productId;
      return matchesQuery && matchesType && matchesProduct;
    });
  }, [movements, productId, products, query, type]);

  const kardex = useMemo(
    () => getKardexByProduct(movements, selectedProductId),
    [movements, selectedProductId]
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Trazabilidad"
        title="Movimientos y control de inventario"
        description="Registra entradas, salidas y ajustes manuales. Cada movimiento alimenta el historial y el kardex por producto."
        actions={
          <Button onClick={() => setOpenDialog(true)} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> Nuevo movimiento
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por producto o motivo"
                className="pl-9"
              />
            </div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="entry">Entrada</SelectItem>
                <SelectItem value="exit">Salida</SelectItem>
                <SelectItem value="adjustment">Ajuste</SelectItem>
                <SelectItem value="purchase">Compra</SelectItem>
              </SelectContent>
            </Select>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Producto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los productos</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredMovements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement) => {
                  const product = getProductById(products, movement.productId);
                  return (
                    <TableRow
                      key={movement.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedProductId(movement.productId)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{product?.name}</p>
                          <p className="text-xs text-slate-500">{product?.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{movement.type}</TableCell>
                      <TableCell>
                        {movement.quantity > 0 ? '+' : ''}
                        {formatNumber(movement.quantity)}
                      </TableCell>
                      <TableCell>{movement.reason}</TableCell>
                      <TableCell>{movement.responsibleUser}</TableCell>
                      <TableCell>{formatCurrency(movement.relatedUnitCost)}</TableCell>
                      <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardList className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>No hay movimientos para esos filtros</EmptyTitle>
                <EmptyDescription>
                  Crea el primer movimiento o ajusta la busqueda para inspeccionar el historial.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <p className="text-sm font-medium text-cyan-700">Kardex por producto</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">
              {getProductById(products, selectedProductId)?.name ?? 'Selecciona un producto'}
            </h3>
          </div>

          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="mb-4 w-full">
              <SelectValue placeholder="Selecciona producto" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-3">
            {kardex.map((movement) => (
              <div key={movement.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900 capitalize">{movement.type}</p>
                    <p className="text-sm text-slate-500">{movement.notes}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-slate-900">
                      {movement.quantity > 0 ? '+' : ''}
                      {formatNumber(movement.quantity)} uds
                    </p>
                    <p className="text-slate-500">{formatDateTime(movement.occurredAt)}</p>
                  </div>
                </div>
              </div>
            ))}
            {kardex.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Este producto aun no tiene movimientos registrados.
              </div>
            )}
          </div>
        </div>
      </div>

      <MovementFormDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        products={products}
        onSubmit={(values) => {
          registerMovement({
            ...values,
            relatedUnitCost: getProductById(products, values.productId)?.realUnitCost,
          });
          setOpenDialog(false);
          toast({
            title: 'Movimiento registrado',
            description: 'El stock fue actualizado correctamente.',
          });
        }}
      />
    </div>
  );
}
