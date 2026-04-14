'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, FileText, ShoppingBag, TrendingUp, Wallet, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { useAdminData } from '@/components/admin/admin-data-context';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber, getProductById } from '@/lib/admin/calculations';
import { serviceTypeLabels } from '@/lib/admin/catalogs';
import {
  buildSalesReportDataset,
  buildSalesReportPdf,
} from '@/lib/admin/report-export';
import { useToast } from '@/hooks/use-toast';

const currentMonth = new Date().toISOString().slice(0, 7);

export default function ReportesPage() {
  const { products, sales, services } = useAdminData();
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const monthServices = useMemo(
    () =>
      services
        .filter((service) => service.performedAt.slice(0, 7) === selectedMonth)
        .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()),
    [selectedMonth, services]
  );

  const dataset = useMemo(
    () =>
      buildSalesReportDataset({
        products,
        sales,
        services,
        selectedMonth,
      }),
    [products, sales, selectedMonth, services]
  );

  const monthlyTotals = useMemo(
    () => ({
      transactions: dataset.summaryRows.length,
      totalRevenue: dataset.summaryRows.reduce((sum, row) => sum + row.totalRevenue, 0),
      totalCost: dataset.summaryRows.reduce((sum, row) => sum + row.totalCost, 0),
      totalProfit: dataset.summaryRows.reduce((sum, row) => sum + row.totalProfit, 0),
      totalQuantity: dataset.summaryRows.reduce((sum, row) => sum + row.totalQuantity, 0),
      serviceCount: dataset.detailRows.filter((row) => row.itemType === 'service').length,
    }),
    [dataset]
  );

  const executiveSummary = useMemo(() => {
    const salesDetailRows = dataset.detailRows.filter((row) => row.itemType === 'product');
    const serviceDetailRows = dataset.detailRows.filter((row) => row.itemType === 'service');
    const averageTicket = monthlyTotals.transactions > 0 ? monthlyTotals.totalRevenue / monthlyTotals.transactions : 0;
    const profitMargin = monthlyTotals.totalRevenue > 0 ? (monthlyTotals.totalProfit / monthlyTotals.totalRevenue) * 100 : 0;
    const salesRevenue = salesDetailRows.reduce((sum, row) => sum + row.subtotal, 0);
    const salesProfit = salesDetailRows.reduce((sum, row) => sum + row.utility, 0);
    const serviceRevenue = serviceDetailRows.reduce((sum, row) => sum + row.subtotal, 0);
    const serviceProfit = serviceDetailRows.reduce((sum, row) => sum + row.utility, 0);
    const serviceCost = serviceDetailRows.reduce((sum, row) => sum + row.unitCost, 0);
    const bestSellerMap = new Map<string, { revenue: number; profit: number; transactions: number }>();

    dataset.summaryRows.forEach((row) => {
      const current = bestSellerMap.get(row.seller) ?? { revenue: 0, profit: 0, transactions: 0 };
      current.revenue += row.totalRevenue;
      current.profit += row.totalProfit;
      current.transactions += 1;
      bestSellerMap.set(row.seller, current);
    });

    const topSeller = Array.from(bestSellerMap.entries())
      .map(([seller, totals]) => ({ seller, ...totals }))
      .sort((left, right) => right.profit - left.profit || right.revenue - left.revenue)[0] ?? null;

    return {
      averageTicket,
      profitMargin,
      salesRevenue,
      salesProfit,
      serviceRevenue,
      serviceProfit,
      serviceCost,
      topSeller,
    };
  }, [dataset.detailRows, dataset.summaryRows, monthlyTotals.totalProfit, monthlyTotals.totalRevenue, monthlyTotals.transactions]);

  const topProducts = useMemo(() => {
    const totals = new Map<string, { quantity: number; revenue: number }>();

    dataset.detailRows
      .filter((row) => row.itemType === 'product')
      .forEach((row) => {
        const current = totals.get(row.reference) ?? { quantity: 0, revenue: 0 };
        current.quantity += row.quantity;
        current.revenue += row.subtotal;
        totals.set(row.reference, current);
      });

    return Array.from(totals.entries())
      .map(([productId, totalsByProduct]) => ({
        productId,
        name: getProductById(products, productId)?.name ?? 'Producto',
        quantity: totalsByProduct.quantity,
        revenue: totalsByProduct.revenue,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
  }, [dataset.detailRows, products]);

  const topServiceMaterials = useMemo(() => {
    const totals = new Map<string, { quantity: number; cost: number }>();

    monthServices.forEach((service) => {
      service.materials.forEach((item) => {
        const current = totals.get(item.productId) ?? { quantity: 0, cost: 0 };
        current.quantity += item.quantity;
        current.cost += item.totalCost;
        totals.set(item.productId, current);
      });
    });

    return Array.from(totals.entries())
      .map(([productId, totalsByProduct]) => ({
        productId,
        name: getProductById(products, productId)?.name ?? 'Producto',
        quantity: totalsByProduct.quantity,
        cost: totalsByProduct.cost,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
  }, [monthServices, products]);

  const monthLabel = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, 1);
    return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const selectedMonthDate = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, (month || 1) - 1, 1);
  }, [selectedMonth]);

  const exportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const doc = buildSalesReportPdf(dataset, monthLabel);
      doc.save(`reporte-ventas-${selectedMonth}.pdf`);
      toast({
        title: 'PDF generado',
        description: 'Se descargo el reporte legible con cliente, items y totales.',
      });
    } catch (error) {
      console.error('Error exportando PDF de ventas:', error);
      toast({
        title: 'No se pudo generar el PDF',
        description: error instanceof Error ? error.message : 'La exportacion fallo.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Control gerencial"
        title="Reportes del negocio"
        description="Vista ejecutiva para controlar ventas, servicios, costos y utilidad del mes sin depender solo de exportaciones."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between rounded-xl bg-white sm:w-[220px]">
                  <span className="truncate capitalize">{monthLabel}</span>
                  <CalendarDays className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto rounded-2xl p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedMonthDate}
                  month={selectedMonthDate}
                  onMonthChange={(date) => {
                    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    setSelectedMonth(nextMonth);
                  }}
                  onSelect={(date) => {
                    if (!date) return;
                    const nextMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    setSelectedMonth(nextMonth);
                    setCalendarOpen(false);
                  }}
                  captionLayout="dropdown"
                  showOutsideDays={false}
                />
              </PopoverContent>
            </Popover>
            <Button type="button" onClick={() => void exportPdf()} disabled={isExportingPdf} className="rounded-xl">
              <FileText className="mr-2 h-4 w-4" />
              {isExportingPdf ? 'Generando PDF...' : 'Descargar reporte PDF'}
            </Button>
          </div>
        }
      />

      <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.82)_100%)] p-4 text-sm text-amber-900 shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
        El panel ya consolida ingresos, costos y utilidad real del mes. `Metodo de pago` todavia no existe como dato real en `sales/services`, y el `estado` se infiere desde devoluciones, asi que esos dos campos conviene tratarlos como referencia operativa y no como auditoria final.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-slate-500">Transacciones</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(monthlyTotals.transactions)}</p>
          <p className="mt-2 text-sm text-slate-500">Ventas consolidadas del periodo.</p>
        </div>
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-slate-500">Ticket promedio</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(executiveSummary.averageTicket)}</p>
          <p className="mt-2 text-sm text-slate-500">Ingreso promedio por transaccion.</p>
        </div>
        <div className="rounded-[28px] border border-cyan-200 bg-[linear-gradient(180deg,rgba(236,254,255,0.98)_0%,rgba(207,250,254,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-cyan-800">Ingreso total</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-950">{formatCurrency(monthlyTotals.totalRevenue)}</p>
          <p className="mt-2 text-sm text-cyan-900">Ventas y servicios del periodo.</p>
        </div>
        <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-amber-800">Costo total</p>
          <p className="mt-2 text-2xl font-semibold text-amber-950">{formatCurrency(monthlyTotals.totalCost)}</p>
          <p className="mt-2 text-sm text-amber-900">Costo de productos y servicios.</p>
        </div>
        <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(209,250,229,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-emerald-800">Utilidad total</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-950">{formatCurrency(monthlyTotals.totalProfit)}</p>
          <p className="mt-2 text-sm text-emerald-900">Margen {executiveSummary.profitMargin.toFixed(1)}%.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-cyan-100 p-2 text-cyan-700">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Resumen ejecutivo</p>
              <p className="text-sm text-slate-500">Lectura rapida del negocio para el mes seleccionado.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Items facturados</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{formatNumber(dataset.detailRows.length)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Utilidad neta</p>
              <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(monthlyTotals.totalProfit)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Margen</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{executiveSummary.profitMargin.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Servicios</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{formatNumber(monthlyTotals.serviceCount)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Responsable destacado</p>
              <p className="text-sm text-slate-500">Quien mas aporta en utilidad dentro del periodo.</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            {executiveSummary.topSeller ? (
              <>
                <p className="text-lg font-semibold text-slate-950">{executiveSummary.topSeller.seller}</p>
                <p className="mt-1 text-sm text-slate-500">{formatNumber(executiveSummary.topSeller.transactions)} transacciones</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Ingreso</p>
                    <p className="mt-1 font-semibold text-slate-950">{formatCurrency(executiveSummary.topSeller.revenue)}</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Utilidad</p>
                    <p className="mt-1 font-semibold text-emerald-700">{formatCurrency(executiveSummary.topSeller.profit)}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Aun no hay ventas suficientes para destacar un responsable.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-slate-100 p-2 text-slate-700">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Linea de ventas</p>
              <p className="text-sm text-slate-500">Comportamiento comercial de productos vendidos.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ingreso</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{formatCurrency(executiveSummary.salesRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Utilidad</p>
              <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(executiveSummary.salesProfit)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Items</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {formatNumber(dataset.detailRows.filter((row) => row.itemType === 'product').length)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-cyan-100 p-2 text-cyan-700">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Linea de servicios</p>
              <p className="text-sm text-slate-500">Control del torno, materiales y utilidad del trabajo.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ingreso</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{formatCurrency(executiveSummary.serviceRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Costo</p>
              <p className="mt-2 text-xl font-semibold text-amber-700">{formatCurrency(executiveSummary.serviceCost)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Utilidad</p>
              <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(executiveSummary.serviceProfit)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Resumen por venta</p>
            <p className="text-sm text-slate-500">Cada fila consolida lo que compro el cliente en una misma transaccion.</p>
          </div>
          <p className="text-sm text-slate-500">{formatNumber(dataset.summaryRows.length)} registros</p>
        </div>

        {dataset.summaryRows.length > 0 ? (
          <Table className="min-w-[1260px]">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Metodo pago</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Cantidad total</TableHead>
                <TableHead>Ingreso</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Utilidad</TableHead>
                <TableHead>Observaciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataset.summaryRows.map((row) => (
                <TableRow key={row.transactionKey}>
                  <TableCell>{row.saleDate.slice(0, 16).replace('T', ' ')}</TableCell>
                  <TableCell>{row.saleId}</TableCell>
                  <TableCell className="max-w-[220px] whitespace-normal">{row.customer}</TableCell>
                  <TableCell>{row.customerPhone || 'Sin telefono'}</TableCell>
                  <TableCell>{row.seller}</TableCell>
                  <TableCell>{row.paymentMethod}</TableCell>
                  <TableCell>{row.saleStatus}</TableCell>
                  <TableCell>{formatNumber(row.itemCount)}</TableCell>
                  <TableCell>{formatNumber(row.totalQuantity)}</TableCell>
                  <TableCell>{formatCurrency(row.totalRevenue)}</TableCell>
                  <TableCell>{formatCurrency(row.totalCost)}</TableCell>
                  <TableCell className="font-medium text-emerald-700">{formatCurrency(row.totalProfit)}</TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal">{row.observations || 'Sin observaciones'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 py-10">
            <EmptyHeader>
              <EmptyTitle>Sin ventas en este mes</EmptyTitle>
              <EmptyDescription>No se encontraron transacciones para el periodo seleccionado.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Detalle por item vendido</p>
            <p className="text-sm text-slate-500">Cada fila representa un producto o servicio con contexto completo de la venta.</p>
          </div>
          <p className="text-sm text-slate-500">{formatNumber(dataset.detailRows.length)} filas</p>
        </div>

        {dataset.detailRows.length > 0 ? (
          <Table className="min-w-[1640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Metodo pago</TableHead>
                <TableHead>Total venta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Subcategoria</TableHead>
                <TableHead>Variante</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio unit.</TableHead>
                <TableHead>Costo unit.</TableHead>
                <TableHead>Subtotal</TableHead>
                <TableHead>Utilidad</TableHead>
                <TableHead>Observaciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataset.detailRows.map((row, index) => (
                <TableRow key={`${row.transactionKey}-${row.itemType}-${row.reference}-${index}`}>
                  <TableCell>{row.saleDate.slice(0, 16).replace('T', ' ')}</TableCell>
                  <TableCell>{row.saleId}</TableCell>
                  <TableCell className="max-w-[220px] whitespace-normal">{row.customer}</TableCell>
                  <TableCell>{row.seller}</TableCell>
                  <TableCell>{row.paymentMethod}</TableCell>
                  <TableCell>{formatCurrency(row.saleTotal)}</TableCell>
                  <TableCell>{row.saleStatus}</TableCell>
                  <TableCell>{row.itemType === 'product' ? 'Producto' : 'Servicio'}</TableCell>
                  <TableCell className="max-w-[260px] whitespace-normal">{row.itemName}</TableCell>
                  <TableCell>{row.category || 'Sin categoria'}</TableCell>
                  <TableCell>{row.subcategory || 'Sin subcategoria'}</TableCell>
                  <TableCell>{row.variant || 'Sin variante'}</TableCell>
                  <TableCell>{row.sku || 'Sin SKU'}</TableCell>
                  <TableCell>{row.reference}</TableCell>
                  <TableCell>{formatNumber(row.quantity)}</TableCell>
                  <TableCell>{formatCurrency(row.unitPrice)}</TableCell>
                  <TableCell>{formatCurrency(row.unitCost)}</TableCell>
                  <TableCell>{formatCurrency(row.subtotal)}</TableCell>
                  <TableCell className="font-medium text-emerald-700">{formatCurrency(row.utility)}</TableCell>
                  <TableCell className="max-w-[320px] whitespace-normal">{row.observations || 'Sin observaciones'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 py-10">
            <EmptyHeader>
              <EmptyTitle>Sin items para mostrar</EmptyTitle>
              <EmptyDescription>No hay productos o servicios vendidos en el periodo seleccionado.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm font-semibold text-slate-950">Productos mas vendidos</p>
          <p className="mt-1 text-sm text-slate-500">Top del mes por unidades facturadas.</p>
          <div className="mt-4 space-y-3">
            {topProducts.length > 0 ? (
              topProducts.map((product) => (
                <div key={product.productId} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-sm text-slate-500">{formatNumber(product.quantity)} unidades</p>
                  <p className="text-sm text-slate-500">{formatCurrency(product.revenue)}</p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Aun no hay productos vendidos en este periodo.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-100 p-2 text-cyan-700">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">Servicios del torno</p>
                <p className="text-sm text-slate-500">{formatNumber(monthlyTotals.serviceCount)} items de servicio en el mes.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {monthServices.length > 0 ? (
                monthServices.map((service) => (
                  <div key={service.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="font-medium text-slate-900">{serviceTypeLabels[service.serviceType]}</p>
                    <p className="text-sm text-slate-500">{service.customerName} · {service.cueReference || 'Sin referencia'}</p>
                    <p className="text-sm text-slate-500">
                      {formatCurrency(service.totalRevenue)} ingreso · {formatCurrency(service.grossProfit)} utilidad
                    </p>
                  </div>
                ))
              ) : (
                <Empty className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-8">
                  <EmptyHeader>
                    <EmptyMedia className="bg-cyan-100 text-cyan-700">
                      <Wrench className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyTitle>Sin servicios en este mes</EmptyTitle>
                    <EmptyDescription>No hay trabajos del torno registrados para este periodo.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
        <p className="text-sm font-semibold text-slate-950">Materiales mas usados en servicios</p>
        <p className="mt-1 text-sm text-slate-500">Te ayuda a ver que insumos del torno se estan consumiendo con mayor frecuencia.</p>
        <div className="mt-4">
          {topServiceMaterials.length > 0 ? (
            <Table className="min-w-[540px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Cantidad usada</TableHead>
                  <TableHead>Costo acumulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topServiceMaterials.map((material) => (
                  <TableRow key={material.productId}>
                    <TableCell>{material.name}</TableCell>
                    <TableCell>{formatNumber(material.quantity)}</TableCell>
                    <TableCell>{formatCurrency(material.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Aun no hay consumo de materiales en servicios para este mes.</p>
          )}
        </div>
      </div>
    </div>
  );
}
