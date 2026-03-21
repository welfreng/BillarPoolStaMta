'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, Eye, Plus, Search } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { MovementReasonBadge } from '@/components/admin/shared/status-badges';
import { MovementFormDialog } from '@/components/admin/inventory/movement-form-dialog';
import { InitialStockDialog } from '@/components/admin/inventory/initial-stock-dialog';
import { SaleDetailsDialog } from '@/components/admin/sales/sale-details-dialog';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
import { movementReasonLabels, movementTypeLabels } from '@/lib/admin/catalogs';
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  getProductById,
  getProductRealUnitCost,
  getProductStock,
  getStockAlert,
  getStockAlertLabel,
} from '@/lib/admin/calculations';
import { useToast } from '@/hooks/use-toast';

export default function InventarioPage() {
  const { movements, products, purchases, sales, registerMovement, registerInitialStock } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [openInitialStockDialog, setOpenInitialStockDialog] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [productId, setProductId] = useState('all');
  const isSalesUser = role === 'sales';
  const selectedSale = selectedSaleId ? sales.find((sale) => sale.id === selectedSaleId) ?? null : null;

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      const product = getProductById(products, movement.productId);
      if (!product) return false;
      const matchesQuery = `${product.name} ${movement.notes} ${movement.reason}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesType = type === 'all' || movement.type === type;
      const matchesProduct = productId === 'all' || movement.productId === productId;
      return matchesQuery && matchesType && matchesProduct;
    });
  }, [movements, productId, products, query, type]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesQuery = `${product.name} ${product.brand} ${product.category} ${product.subcategory}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesProduct = productId === 'all' || product.id === productId;
      return matchesQuery && matchesProduct && product.status === 'active';
    });
  }, [productId, products, query]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Control diario"
        title={isSalesUser ? 'Stock disponible para vender' : 'Inventario facil de entender'}
        description={
          isSalesUser
            ? 'Consulta rapidamente que productos hay disponibles, cuantas unidades quedan y cual es su precio de venta.'
            : 'Registra entradas, salidas y ajustes con palabras claras. El historial queda organizado por producto para que el control diario sea mas sencillo.'
        }
        actions={
          !isSalesUser ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setOpenInitialStockDialog(true)}
                className="w-full rounded-xl sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" /> Carga inicial
              </Button>
              <Button onClick={() => setOpenDialog(true)} className="w-full rounded-xl sm:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Registrar movimiento
              </Button>
            </div>
          ) : null
        }
      />

      <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className={`grid gap-3 ${isSalesUser ? 'sm:grid-cols-1 xl:grid-cols-[1.5fr_0.9fr]' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
          <div className={`relative ${isSalesUser ? '' : 'sm:col-span-2 xl:col-span-2'}`}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isSalesUser
                  ? 'Buscar por producto, marca o categoria'
                  : 'Buscar por producto, observacion o motivo'
              }
              className="pl-9"
            />
          </div>

          {!isSalesUser ? (
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                <SelectItem value="entry">{movementTypeLabels.entry}</SelectItem>
                <SelectItem value="exit">{movementTypeLabels.exit}</SelectItem>
                <SelectItem value="adjustment">{movementTypeLabels.adjustment}</SelectItem>
                <SelectItem value="purchase">{movementTypeLabels.purchase}</SelectItem>
              </SelectContent>
            </Select>
          ) : null}

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

        {isSalesUser ? (
          filteredProducts.length > 0 ? (
            <div className="min-w-0">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Precio de venta</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const stock = getProductStock(movements, product.id);
                    const alert = getStockAlert(product, movements);
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{product.name}</p>
                            <p className="text-xs text-slate-500">{product.brand}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{product.category}</p>
                            <p className="text-xs text-slate-500">{product.subcategory}</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatNumber(stock)}</TableCell>
                        <TableCell>{formatCurrency(product.salePrice)}</TableCell>
                        <TableCell>
                          <span className={alert === 'out' ? 'font-medium text-rose-700' : 'font-medium text-emerald-700'}>
                            {getStockAlertLabel(alert)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardList className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>No hay productos para esos filtros</EmptyTitle>
                <EmptyDescription>
                  Ajusta la busqueda para consultar lo disponible en venta.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        ) : filteredMovements.length > 0 ? (
          <div className="min-w-0">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {filteredMovements.map((movement) => {
                    const product = getProductById(products, movement.productId);
                    const isReturn = movement.reason === 'return';
                    const relatedSale = movement.saleId
                      ? sales.find((sale) => sale.id === movement.saleId) ?? null
                      : null;
                    return (
                      <TableRow
                        key={movement.id}
                        className={isReturn ? 'bg-amber-50/60' : undefined}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{product?.name}</p>
                          <p className="text-xs text-slate-500">{product?.brand}</p>
                        </div>
                      </TableCell>
                      <TableCell>{movementTypeLabels[movement.type]}</TableCell>
                        <TableCell>
                          {movement.quantity > 0 ? '+' : ''}
                          {formatNumber(movement.quantity)}
                        </TableCell>
                        <TableCell>
                          {isReturn ? (
                            <div className="space-y-1">
                              <MovementReasonBadge reason={movement.reason} />
                              <p className="text-xs text-amber-700">Producto devuelto al inventario</p>
                            </div>
                          ) : (
                            movementReasonLabels[movement.reason]
                          )}
                        </TableCell>
                        <TableCell>{movement.responsibleUser}</TableCell>
                        <TableCell>{formatCurrency(movement.relatedUnitCost)}</TableCell>
                        <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                        <TableCell className="text-right">
                          {relatedSale ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => setSelectedSaleId(relatedSale.id)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Ver venta
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">Sin detalle</span>
                          )}
                        </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
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

      {!isSalesUser ? (
        <>
          <InitialStockDialog
            open={openInitialStockDialog}
            onOpenChange={setOpenInitialStockDialog}
            products={products}
            onSubmit={async (values) => {
              try {
                await registerInitialStock({
                  ...values,
                  occurredAt: new Date(values.occurredAt).toISOString(),
                  responsibleUser:
                    profile?.nombre?.trim() || user?.displayName || user?.email || 'Administrador',
                });
                setOpenInitialStockDialog(false);
                toast({
                  title: 'Carga inicial registrada',
                  description: 'El inventario quedo cargado sin exigir proveedor ni soporte.',
                });
              } catch (error) {
                console.error('Error registrando carga inicial en Firestore:', error);
                toast({
                  title: 'No se pudo registrar la carga inicial',
                  description: 'Revisa la configuracion y permisos de Firebase.',
                  variant: 'destructive',
                });
                throw error;
              }
            }}
          />

          <MovementFormDialog
            open={openDialog}
            onOpenChange={setOpenDialog}
            products={products}
            onSubmit={async (values) => {
              try {
                await registerMovement({
                  ...values,
                  responsibleUser:
                    profile?.nombre?.trim() || user?.displayName || user?.email || values.responsibleUser,
                  relatedUnitCost: getProductRealUnitCost(purchases, values.productId),
                });
                setOpenDialog(false);
                toast({
                  title: 'Movimiento registrado',
                  description: 'El stock fue actualizado correctamente.',
                });
              } catch (error) {
                console.error('Error registrando movimiento en Firestore:', error);
                toast({
                  title: 'No se pudo registrar el movimiento',
                  description: 'Revisa la configuracion y permisos de Firebase.',
                  variant: 'destructive',
                });
                throw error;
              }
            }}
          />

          <SaleDetailsDialog
            open={Boolean(selectedSale)}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setSelectedSaleId(null);
              }
            }}
            sale={selectedSale}
            sales={sales}
            products={products}
          />
        </>
      ) : null}
    </div>
  );
}
