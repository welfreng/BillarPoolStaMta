'use client';

import { useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { useAdminData } from '@/components/admin/admin-data-context';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDateTime, formatNumber, getProductById } from '@/lib/admin/calculations';

const currentMonth = new Date().toISOString().slice(0, 7);

export default function ReportesPage() {
  const { products, sales } = useAdminData();
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

  const monthlyTotals = useMemo(
    () =>
      saleGroups.reduce(
        (accumulator, group) => {
          accumulator.invoices += 1;
          accumulator.grossRevenue += group.grossRevenue;
          accumulator.returnedRevenue += group.returnedRevenue;
          accumulator.netRevenue += group.netRevenue;
          accumulator.netProfit += group.netProfit;
          accumulator.totalUnits += group.totalUnits - group.returnedUnits;
          return accumulator;
        },
        {
          invoices: 0,
          grossRevenue: 0,
          returnedRevenue: 0,
          netRevenue: 0,
          netProfit: 0,
          totalUnits: 0,
        }
      ),
    [saleGroups]
  );

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

  const monthLabel = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, 1);
    return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);
  const selectedMonthDate = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, (month || 1) - 1, 1);
  }, [selectedMonth]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <SectionHeader
        eyebrow="Facturacion mensual"
        title="Reporte mensual de ventas"
        description="Consulta cuanto se facturo en el mes, cuanto se devolvio y cual fue la utilidad neta del periodo."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl justify-between bg-white sm:w-[220px] print:hidden"
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
            <Button
              type="button"
              onClick={handlePrint}
              className="w-full rounded-xl sm:w-auto print:hidden"
            >
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
          <p className="mt-1 text-sm text-slate-500">Reporte mensual de facturacion y utilidad</p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Resumen del periodo</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950 capitalize">{monthLabel}</h2>
        <p className="mt-2 text-sm text-slate-500">
          Este resumen toma las ventas registradas en el mes seleccionado y calcula la facturacion neta despues de devoluciones.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 print:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-slate-500">Facturacion bruta</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(monthlyTotals.grossRevenue)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-slate-500">Devoluciones</p>
          <p className="mt-2 text-2xl font-semibold text-rose-700">{formatCurrency(monthlyTotals.returnedRevenue)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-slate-500">Facturacion neta</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(monthlyTotals.netRevenue)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-slate-500">Utilidad neta</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{formatCurrency(monthlyTotals.netProfit)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <p className="text-sm text-slate-500">Ventas del mes</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(monthlyTotals.invoices)}</p>
          <p className="mt-1 text-sm text-slate-500">{formatNumber(monthlyTotals.totalUnits)} unidades netas</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr] print:grid-cols-1">
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">Detalle de ventas del mes</h3>
          {saleGroups.length > 0 ? (
            <div className="min-w-0">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Productos</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Facturado</TableHead>
                    <TableHead>Utilidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saleGroups.map((group) => {
                    const lineSummary = group.lineItems
                      .map((item) => {
                        const product = getProductById(products, item.productId);
                        return `${formatNumber(item.quantity)} x ${product?.name ?? 'Producto'}`;
                      })
                      .join(', ');

                    return (
                      <TableRow key={group.key}>
                        <TableCell>{formatDateTime(group.sale.soldAt)}</TableCell>
                        <TableCell>{group.sale.customerName}</TableCell>
                        <TableCell className="max-w-[320px]">
                          <span className="block truncate">{lineSummary}</span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{formatNumber(group.totalUnits - group.returnedUnits)}</p>
                            {group.returnedUnits > 0 ? (
                              <p className="text-xs text-amber-700">Devuelto: {formatNumber(group.returnedUnits)}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(group.netRevenue)}</TableCell>
                        <TableCell>{formatCurrency(group.netProfit)}</TableCell>
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
                  <BarChart3 className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Sin ventas en este mes</EmptyTitle>
                <EmptyDescription>
                  Cambia el mes o registra ventas para ver la facturacion consolidada.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:shadow-none">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">Productos mas vendidos</h3>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((product) => (
                <div
                  key={product.productId}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{product.name}</p>
                    <p className="text-sm text-slate-500">{formatNumber(product.quantity)} unidades</p>
                  </div>
                  <p className="font-semibold text-slate-950">{formatCurrency(product.revenue)}</p>
                </div>
              ))}
            </div>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Sin datos para ranking</EmptyTitle>
                <EmptyDescription>
                  Cuando existan ventas en el mes, aqui veras los productos con mejor salida.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}
