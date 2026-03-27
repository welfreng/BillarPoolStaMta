'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Download, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { useAdminData } from '@/components/admin/admin-data-context';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDateTime, formatNumber, getProductById } from '@/lib/admin/calculations';
import { serviceTypeLabels } from '@/lib/admin/catalogs';

const currentMonth = new Date().toISOString().slice(0, 7);

export default function ReportesPage() {
  const { products, sales, services } = useAdminData();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const saleGroups = useMemo(() => {
    const groups = new Map<string, { key: string; sales: typeof sales }>();

    sales.forEach((sale) => {
      const soldMonth = sale.soldAt.slice(0, 7);
      if (soldMonth !== selectedMonth) return;

      const key = sale.saleBatchId ?? sale.id;
      const existing = groups.get(key);
      if (existing) {
        existing.sales.push(sale);
        return;
      }

      groups.set(key, { key, sales: [sale] });
    });

    return Array.from(groups.values())
      .map((group) => {
        const orderedSales = [...group.sales].sort((a, b) => a.id.localeCompare(b.id));
        const baseSale = orderedSales[0];
        const lineItems = orderedSales.flatMap((sale) => sale.lineItems);
        const totalUnits = orderedSales.reduce((sum, sale) => sum + sale.quantity, 0);
        const returnedUnits = orderedSales.reduce((sum, sale) => sum + (sale.returnedQuantity ?? 0), 0);
        const grossRevenue = orderedSales.reduce((sum, sale) => sum + sale.totalSale, 0);
        const returnedRevenue = orderedSales.reduce((sum, sale) => sum + (sale.returnedSaleAmount ?? 0), 0);
        const netRevenue = grossRevenue - returnedRevenue;
        const netCost = orderedSales.reduce((sum, sale) => sum + sale.totalCost - (sale.returnedCostAmount ?? 0), 0);
        const netProfit = orderedSales.reduce(
          (sum, sale) => sum + sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0)),
          0
        );

        return {
          key: group.key,
          sale: baseSale,
          lineItems,
          totalUnits,
          returnedUnits,
          grossRevenue,
          returnedRevenue,
          netRevenue,
          netCost,
          netProfit,
        };
      })
      .sort((a, b) => new Date(b.sale.soldAt).getTime() - new Date(a.sale.soldAt).getTime());
  }, [sales, selectedMonth]);

  const monthServices = useMemo(
    () =>
      services
        .filter((service) => service.performedAt.slice(0, 7) === selectedMonth)
        .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()),
    [selectedMonth, services]
  );

  const monthlyTotals = useMemo(() => {
    const salesTotals = saleGroups.reduce(
      (accumulator, group) => {
        accumulator.invoices += 1;
        accumulator.salesGrossRevenue += group.grossRevenue;
        accumulator.returnedRevenue += group.returnedRevenue;
        accumulator.salesNetRevenue += group.netRevenue;
        accumulator.salesNetProfit += group.netProfit;
        accumulator.totalUnits += group.totalUnits - group.returnedUnits;
        return accumulator;
      },
      {
        invoices: 0,
        salesGrossRevenue: 0,
        returnedRevenue: 0,
        salesNetRevenue: 0,
        salesNetProfit: 0,
        totalUnits: 0,
      }
    );

    const serviceTotals = monthServices.reduce(
      (accumulator, service) => {
        accumulator.count += 1;
        accumulator.revenue += service.totalRevenue;
        accumulator.cost += service.totalMaterialCost;
        accumulator.profit += service.grossProfit;
        return accumulator;
      },
      { count: 0, revenue: 0, cost: 0, profit: 0 }
    );

    return {
      ...salesTotals,
      ...serviceTotals,
      combinedRevenue: salesTotals.salesNetRevenue + serviceTotals.revenue,
      combinedProfit: salesTotals.salesNetProfit + serviceTotals.profit,
    };
  }, [monthServices, saleGroups]);

  const topProducts = useMemo(() => {
    const totals = new Map<string, { quantity: number; revenue: number }>();

    saleGroups.forEach((group) => {
      group.lineItems.forEach((item) => {
        const current = totals.get(item.productId) ?? { quantity: 0, revenue: 0 };
        current.quantity += item.quantity;
        current.revenue += item.totalSale;
        totals.set(item.productId, current);
      });
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
  }, [products, saleGroups]);

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

  return (
    <div className="space-y-6 print:space-y-4">
      <SectionHeader
        eyebrow="Facturacion mensual"
        title="Reporte mensual"
        description="Consolida ventas y servicios del torno para revisar facturacion, costos, devoluciones y utilidad del periodo."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between rounded-xl bg-white sm:w-[220px] print:hidden"
                >
                  <span className="truncate capitalize">{monthLabel}</span>
                  <CalendarDays className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto rounded-2xl p-0 print:hidden" align="start">
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
            <Button type="button" onClick={() => window.print()} className="w-full rounded-xl sm:w-auto print:hidden">
              <Download className="mr-2 h-4 w-4" />
              Crear PDF
            </Button>
          </div>
        }
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
        <div className="mb-4 hidden border-b border-slate-200 pb-4 print:block">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Informe comercial</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Billar Pool Santa Marta</h1>
          <p className="mt-1 text-sm text-slate-500">Reporte mensual de ventas y servicios</p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Resumen del periodo</p>
        <h2 className="mt-2 text-2xl font-semibold capitalize text-slate-950">{monthLabel}</h2>
        <p className="mt-2 text-sm text-slate-500">
          El informe separa la facturacion por ventas y los trabajos del torno, y luego muestra el consolidado total del negocio.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6 print:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-slate-500">Ventas netas</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(monthlyTotals.salesNetRevenue)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-slate-500">Servicios</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(monthlyTotals.revenue)}</p>
        </div>
        <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-cyan-800">Facturacion total</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-950">{formatCurrency(monthlyTotals.combinedRevenue)}</p>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-rose-800">Devoluciones</p>
          <p className="mt-2 text-2xl font-semibold text-rose-950">{formatCurrency(monthlyTotals.returnedRevenue)}</p>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-amber-800">Costo servicios</p>
          <p className="mt-2 text-2xl font-semibold text-amber-950">{formatCurrency(monthlyTotals.cost)}</p>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-emerald-800">Utilidad total</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-950">{formatCurrency(monthlyTotals.combinedProfit)}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] print:grid-cols-1">
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Detalle de ventas</p>
              <p className="text-sm text-slate-500">Facturas registradas en el mes seleccionado.</p>
            </div>
            <p className="text-sm text-slate-500">{formatNumber(monthlyTotals.invoices)} facturas</p>
          </div>

          {saleGroups.length > 0 ? (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ingreso neto</TableHead>
                  <TableHead>Utilidad</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleGroups.map((group) => {
                  const productsSummary = group.lineItems
                    .map((item) => `${getProductById(products, item.productId)?.name ?? 'Producto'} x ${formatNumber(item.quantity)}`)
                    .join(', ');

                  return (
                    <TableRow key={group.key}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{productsSummary}</p>
                          <p className="text-xs text-slate-500">
                            {formatNumber(group.totalUnits - group.returnedUnits)} unidades netas
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{group.sale.customerName}</TableCell>
                      <TableCell>{formatCurrency(group.netRevenue)}</TableCell>
                      <TableCell className="font-medium text-emerald-700">{formatCurrency(group.netProfit)}</TableCell>
                      <TableCell>{formatDateTime(group.sale.soldAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 py-10">
              <EmptyHeader>
                <EmptyTitle>Sin ventas en este mes</EmptyTitle>
                <EmptyDescription>No se encontraron ventas registradas para el periodo seleccionado.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
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

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-100 p-2 text-cyan-700">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">Servicios del torno</p>
                <p className="text-sm text-slate-500">{formatNumber(monthlyTotals.count)} trabajos registrados en el mes.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {monthServices.length > 0 ? (
                monthServices.map((service) => (
                  <div key={service.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="font-medium text-slate-900">{serviceTypeLabels[service.serviceType]}</p>
                    <p className="text-sm text-slate-500">{service.customerName} · {service.cueReference}</p>
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

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
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
