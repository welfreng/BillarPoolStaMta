'use client';

import { useMemo, useState } from 'react';
import { CornerUpLeft, Pencil, Plus, Receipt, Search } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { SaleFormDialog, type SaleFormValues } from '@/components/admin/sales/sale-form-dialog';
import { SaleReturnDialog, type SaleReturnFormValues } from '@/components/admin/sales/sale-return-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDateTime, formatNumber, getProductById, getProductStock } from '@/lib/admin/calculations';

export default function VentasPage() {
  const { sales, products, purchases, movements, registerSale, updateSale, registerSaleReturn } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [returningSaleId, setReturningSaleId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const isSalesUser = role === 'sales';

  const editingSale = editingSaleId ? sales.find((sale) => sale.id === editingSaleId) ?? null : null;
  const returningSale = returningSaleId ? sales.find((sale) => sale.id === returningSaleId) ?? null : null;
  const initialSaleValues: SaleFormValues | null = editingSale
      ? {
        productId: editingSale.productId,
        soldAt: editingSale.soldAt.slice(0, 10),
        quantity: editingSale.quantity,
        unitPrice: editingSale.unitPrice,
        includeGift: editingSale.giftItems.length > 0,
        giftItems:
          editingSale.giftItems.length > 0
            ? editingSale.giftItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              }))
            : [{ productId: '', quantity: 1 }],
        customerName: editingSale.customerName,
        notes: editingSale.notes,
      }
    : null;
  const remainingReturnQuantity = returningSale
    ? Math.max(returningSale.quantity - (returningSale.returnedQuantity ?? 0), 0)
    : 0;

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const product = getProductById(products, sale.productId);
      return `${product?.name ?? ''} ${sale.customerName} ${sale.notes}`
        .toLowerCase()
        .includes(query.toLowerCase());
    });
  }, [products, query, sales]);

  const totals = useMemo(
    () =>
      filteredSales.reduce(
        (accumulator, sale) => {
          accumulator.totalRevenue += sale.totalSale - (sale.returnedSaleAmount ?? 0);
          accumulator.totalProfit +=
            sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0));
          accumulator.totalUnits += sale.quantity - (sale.returnedQuantity ?? 0);
          return accumulator;
        },
        { totalRevenue: 0, totalProfit: 0, totalUnits: 0 }
      ),
    [filteredSales]
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Operacion comercial"
        title="Ventas"
        description={
          isSalesUser
            ? 'Registra cada venta para descontar stock y mantener el inventario al dia.'
            : 'Registra cada venta para descontar stock, medir ingresos y dejar un historial claro para el negocio.'
        }
        actions={
          <Button
            onClick={() => {
              setEditingSaleId(null);
              setOpenDialog(true);
            }}
            className="w-full rounded-xl sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" /> Registrar venta
          </Button>
        }
      />

      <div className={`grid gap-4 sm:gap-6 ${isSalesUser ? 'sm:grid-cols-1 lg:grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Ventas registradas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatNumber(filteredSales.length)}</p>
          <p className="mt-2 text-sm text-slate-500">Historial de ventas del periodo visible.</p>
        </div>
        {!isSalesUser && (
          <>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <p className="text-sm text-slate-500">Ingresos</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(totals.totalRevenue)}</p>
              <p className="mt-2 text-sm text-slate-500">Suma de las ventas filtradas.</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:col-span-2 sm:p-6 lg:col-span-1">
              <p className="text-sm text-emerald-800">Utilidad bruta</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-950">{formatCurrency(totals.totalProfit)}</p>
              <p className="mt-2 text-sm text-emerald-900">Calculada contra el costo real del inventario.</p>
            </div>
          </>
        )}
      </div>

      <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por producto, cliente o nota"
            className="pl-9"
          />
        </div>

        {filteredSales.length > 0 ? (
          <div className="min-w-0">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Precio unidad</TableHead>
                  {!isSalesUser && <TableHead>Total venta</TableHead>}
                  {!isSalesUser && <TableHead>Utilidad</TableHead>}
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => {
                  const product = getProductById(products, sale.productId);
                  const returnedQuantity = sale.returnedQuantity ?? 0;
                  const netTotalSale = sale.totalSale - (sale.returnedSaleAmount ?? 0);
                  const netProfit =
                    sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0));
                  const giftSummary = sale.giftItems
                    .map((item) => {
                      const product = getProductById(products, item.productId);
                      return product ? `${product.name} x ${formatNumber(item.quantity)}` : null;
                    })
                    .filter(Boolean)
                    .join(', ');
                  const returnStatus =
                    returnedQuantity <= 0
                      ? 'Sin devolucion'
                      : returnedQuantity >= sale.quantity
                        ? 'Devuelta'
                        : `Parcial (${formatNumber(returnedQuantity)})`;
                  return (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{product?.name ?? 'Producto'}</p>
                          <p className="text-xs text-slate-500">
                            Stock restante: {formatNumber(product ? getProductStock(movements, product.id) : 0)}
                          </p>
                          {giftSummary ? (
                            <p className="text-xs text-violet-700">
                              Obsequios: {giftSummary}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{sale.customerName}</TableCell>
                      <TableCell>
                        <div>
                          <p>{formatNumber(sale.quantity)}</p>
                          {returnedQuantity > 0 ? (
                            <p className="text-xs text-amber-700">Devuelto: {formatNumber(returnedQuantity)}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(sale.unitPrice)}</TableCell>
                      {!isSalesUser && <TableCell>{formatCurrency(netTotalSale)}</TableCell>}
                      {!isSalesUser && <TableCell>{formatCurrency(netProfit)}</TableCell>}
                      <TableCell>{returnStatus}</TableCell>
                      <TableCell>{formatDateTime(sale.soldAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => {
                              setEditingSaleId(sale.id);
                              setOpenDialog(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            disabled={returnedQuantity >= sale.quantity}
                            onClick={() => setReturningSaleId(sale.id)}
                          >
                            <CornerUpLeft className="mr-2 h-4 w-4" />
                            Devolucion
                          </Button>
                        </div>
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
                <Receipt className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No hay ventas registradas</EmptyTitle>
              <EmptyDescription>
                Registra la primera venta para empezar a llevar el control operativo del modulo.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <SaleFormDialog
        open={openDialog}
        onOpenChange={(nextOpen) => {
          setOpenDialog(nextOpen);
          if (!nextOpen) {
            setEditingSaleId(null);
          }
        }}
        products={products}
        purchases={purchases}
        movements={movements}
        initialValues={initialSaleValues}
        hideFinancialSummary={isSalesUser}
        onSubmit={async (values) => {
          try {
            const payload = {
              ...values,
              soldAt: new Date(values.soldAt).toISOString(),
              giftItems: values.includeGift ? values.giftItems : [],
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            };
            if (editingSaleId) {
              await updateSale(editingSaleId, payload);
            } else {
              await registerSale(payload);
            }
            setOpenDialog(false);
            setEditingSaleId(null);
            toast({
              title: editingSaleId ? 'Venta actualizada' : 'Venta registrada',
              description: 'El stock y los indicadores comerciales fueron actualizados.',
            });
          } catch (error) {
            toast({
              title: editingSaleId ? 'No se pudo actualizar la venta' : 'No se pudo registrar la venta',
              description: error instanceof Error ? error.message : 'Verifica el stock disponible.',
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />

      <SaleReturnDialog
        open={Boolean(returningSale)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setReturningSaleId(null);
          }
        }}
        remainingQuantity={remainingReturnQuantity}
        productName={getProductById(products, returningSale?.productId ?? '')?.name ?? 'Producto'}
        customerName={returningSale?.customerName ?? 'Cliente'}
        onSubmit={async (values: SaleReturnFormValues) => {
          if (!returningSale) return;
          try {
            await registerSaleReturn({
              saleId: returningSale.id,
              returnedAt: new Date(values.returnedAt).toISOString(),
              quantity: values.quantity,
              notes: values.notes,
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            });
            setReturningSaleId(null);
            toast({
              title: 'Devolucion registrada',
              description: 'La venta y el inventario fueron actualizados correctamente.',
            });
          } catch (error) {
            toast({
              title: 'No se pudo registrar la devolucion',
              description: error instanceof Error ? error.message : 'Verifica la cantidad a devolver.',
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />
    </div>
  );
}
