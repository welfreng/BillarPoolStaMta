'use client';

import { useMemo, useState } from 'react';
import { CornerUpLeft, Eye, Pencil, Plus, Receipt, Search } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { SaleDetailsDialog } from '@/components/admin/sales/sale-details-dialog';
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
  const { sales, products, purchases, movements, registerSale, updateSaleBatch, registerSaleReturn } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingSaleBatchId, setEditingSaleBatchId] = useState<string | null>(null);
  const [returningSaleId, setReturningSaleId] = useState<string | null>(null);
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const isSalesUser = role === 'sales';

  const saleGroups = useMemo(() => {
    const groups = new Map<string, { key: string; sales: typeof sales }>();
    sales.forEach((sale) => {
      const key = sale.saleBatchId ?? sale.id;
      const existing = groups.get(key);
      if (existing) {
        existing.sales.push(sale);
        return;
      }
      groups.set(key, { key, sales: [sale] });
    });
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        sales: [...group.sales].sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => new Date(b.sales[0]?.soldAt ?? 0).getTime() - new Date(a.sales[0]?.soldAt ?? 0).getTime());
  }, [sales]);

  const editingGroup = editingSaleBatchId
    ? saleGroups.find((group) => group.key === editingSaleBatchId) ?? null
    : null;
  const editingSale = editingGroup?.sales[0] ?? null;
  const returningGroup = returningSaleId
    ? saleGroups.find((group) => group.key === returningSaleId || group.sales.some((sale) => sale.id === returningSaleId)) ?? null
    : null;
  const returningSale = returningGroup?.sales[0] ?? null;
  const detailsSale = detailsSaleId ? sales.find((sale) => sale.id === detailsSaleId) ?? null : null;
  const initialSaleValues: SaleFormValues | null = editingSale
    ? {
        soldAt: editingSale.soldAt.slice(0, 10),
        items: (editingGroup?.sales ?? [editingSale]).flatMap((sale) =>
          sale.lineItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            giftItems: sale.giftItems.map((giftItem) => ({
              productId: giftItem.productId,
              quantity: giftItem.quantity,
            })),
          }))
        ),
        customerName: editingSale.customerName,
        notes: editingSale.notes,
      }
    : null;
  const filteredSales = useMemo(() => {
    return saleGroups.filter((group) => {
      const baseSale = group.sales[0];
      const productNames = group.sales
        .flatMap((sale) => sale.lineItems.map((item) => getProductById(products, item.productId)?.name ?? ''))
        .join(' ');
      return `${productNames} ${baseSale?.customerName ?? ''} ${baseSale?.notes ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase());
    });
  }, [products, query, saleGroups]);

  const totals = useMemo(
    () =>
      filteredSales.reduce(
        (accumulator, group) => {
          group.sales.forEach((sale) => {
            accumulator.totalRevenue += sale.totalSale - (sale.returnedSaleAmount ?? 0);
            accumulator.totalProfit +=
              sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0));
            accumulator.totalUnits += sale.quantity - (sale.returnedQuantity ?? 0);
          });
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
              setEditingSaleBatchId(null);
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
                {filteredSales.map((group) => {
                  const baseSale = group.sales[0];
                  const returnedQuantity = group.sales.reduce((sum, sale) => sum + (sale.returnedQuantity ?? 0), 0);
                  const totalQuantity = group.sales.reduce((sum, sale) => sum + sale.quantity, 0);
                  const netTotalSale = group.sales.reduce(
                    (sum, sale) => sum + sale.totalSale - (sale.returnedSaleAmount ?? 0),
                    0
                  );
                  const netProfit = group.sales.reduce(
                    (sum, sale) => sum + sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0)),
                    0
                  );
                  const giftSummary = group.sales
                    .flatMap((sale) => sale.giftItems)
                    .map((item) => {
                      const product = getProductById(products, item.productId);
                      return product ? `${product.name} x ${formatNumber(item.quantity)}` : null;
                    })
                    .filter(Boolean)
                    .join(', ');
                  const lineSummary = group.sales
                    .flatMap((sale) =>
                      sale.lineItems.map((item) => {
                        const product = getProductById(products, item.productId);
                        return product ? `${product.name} x ${formatNumber(item.quantity)}` : null;
                      })
                    )
                    .filter(Boolean)
                    .join(', ');
                  const returnStatus =
                    returnedQuantity <= 0
                      ? 'Sin devolucion'
                      : returnedQuantity >= totalQuantity
                        ? 'Devuelta'
                        : `Parcial (${formatNumber(returnedQuantity)})`;
                  return (
                    <TableRow key={group.key}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{lineSummary}</p>
                          <p className="text-xs text-slate-500">Productos en la venta: {formatNumber(group.sales.length)}</p>
                          {giftSummary ? (
                            <p className="text-xs text-violet-700">
                              Obsequios: {giftSummary}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{baseSale.customerName}</TableCell>
                      <TableCell>
                        <div>
                          <p>{formatNumber(totalQuantity)}</p>
                          {returnedQuantity > 0 ? (
                            <p className="text-xs text-amber-700">Devuelto: {formatNumber(returnedQuantity)}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{group.sales.length > 1 ? 'Varios' : formatCurrency(baseSale.unitPrice)}</TableCell>
                      {!isSalesUser && <TableCell>{formatCurrency(netTotalSale)}</TableCell>}
                      {!isSalesUser && <TableCell>{formatCurrency(netProfit)}</TableCell>}
                      <TableCell>{returnStatus}</TableCell>
                      <TableCell>{formatDateTime(baseSale.soldAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => setDetailsSaleId(baseSale.id)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Ver detalle
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => {
                              setEditingSaleBatchId(group.key);
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
                            disabled={group.sales.every((sale) => (sale.quantity - (sale.returnedQuantity ?? 0)) <= 0)}
                            onClick={() => setReturningSaleId(group.key)}
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
            setEditingSaleBatchId(null);
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
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            };
            if (editingSaleBatchId) {
              await updateSaleBatch(editingSaleBatchId, payload);
            } else {
              await registerSale(payload);
            }
            setOpenDialog(false);
            setEditingSaleBatchId(null);
            toast({
              title: editingSaleBatchId ? 'Venta actualizada' : 'Venta registrada',
              description: 'El stock y los indicadores comerciales fueron actualizados.',
            });
          } catch (error) {
            toast({
              title: editingSaleBatchId ? 'No se pudo actualizar la venta' : 'No se pudo registrar la venta',
              description: error instanceof Error ? error.message : 'Verifica el stock disponible.',
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />

      <SaleDetailsDialog
        open={Boolean(detailsSale)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDetailsSaleId(null);
          }
        }}
        sale={detailsSale}
        sales={sales}
        products={products}
        showAdminView={!isSalesUser}
      />

      <SaleReturnDialog
        open={Boolean(returningSale)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setReturningSaleId(null);
          }
        }}
        sales={returningGroup?.sales ?? []}
        products={products}
        customerName={returningSale?.customerName ?? 'Cliente'}
        onSubmit={async (values: SaleReturnFormValues) => {
          if (!returningGroup) return;
          try {
            await registerSaleReturn({
              saleId: values.saleId,
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
