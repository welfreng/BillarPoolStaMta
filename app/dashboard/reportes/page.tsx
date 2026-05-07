'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, FileText, ShoppingBag, TrendingUp, Wallet, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { useAdminData } from '@/components/admin/admin-data-context';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber, getOperationalProductStock, getProductById } from '@/lib/admin/calculations';
import { serviceTypeLabels } from '@/lib/admin/catalogs';
import {
  buildSalesReportDataset,
  buildSalesReportPdf,
} from '@/lib/admin/report-export';
import { useToast } from '@/hooks/use-toast';

const currentMonth = new Date().toISOString().slice(0, 7);
const LOW_STOCK_ALERT_THRESHOLD = 5;
const reportChartConfig = {
  revenue: { label: 'Ventas', color: '#0891b2' },
  profit: { label: 'Utilidad', color: '#059669' },
  quantity: { label: 'Unidades', color: '#f59e0b' },
} satisfies ChartConfig;

function shiftMonthValue(monthValue: string, offset: number) {
  const [year, month] = monthValue.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, (month || 1) - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthAxisLabel(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', {
    month: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(Date.UTC(year, (month || 1) - 1, 1)));
}

export default function ReportesPage() {
  const { products, sales, services, movements } = useAdminData();
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

  const monthlyTrend = useMemo(() => {
    const monthValues = Array.from({ length: 6 }, (_, index) => shiftMonthValue(selectedMonth, index - 5));
    return monthValues.map((monthValue) => {
      const monthRows = buildSalesReportDataset({
        products,
        sales,
        services,
        selectedMonth: monthValue,
      });
      const revenue = monthRows.summaryRows.reduce((sum, row) => sum + row.totalRevenue, 0);
      const cost = monthRows.summaryRows.reduce((sum, row) => sum + row.totalCost, 0);
      const profit = monthRows.summaryRows.reduce((sum, row) => sum + row.totalProfit, 0);
      const quantity = monthRows.summaryRows.reduce((sum, row) => sum + row.totalQuantity, 0);

      return {
        monthValue,
        label: formatMonthAxisLabel(monthValue),
        revenue,
        cost,
        profit,
        quantity,
      };
    });
  }, [products, sales, selectedMonth, services]);

  const topProductsChartData = useMemo(
    () =>
      topProducts.map((product) => ({
        name: product.name.length > 22 ? `${product.name.slice(0, 22)}…` : product.name,
        fullName: product.name,
        quantity: product.quantity,
        revenue: product.revenue,
      })),
    [topProducts]
  );

  const topBrands = useMemo(() => {
    const totals = new Map<string, { quantity: number; revenue: number; profit: number }>();

    dataset.detailRows
      .filter((row) => row.itemType === 'product')
      .forEach((row) => {
        const brand = getProductById(products, row.reference)?.brand?.trim() || 'Sin marca';
        const current = totals.get(brand) ?? { quantity: 0, revenue: 0, profit: 0 };
        current.quantity += row.quantity;
        current.revenue += row.subtotal;
        current.profit += row.utility;
        totals.set(brand, current);
      });

    return Array.from(totals.entries())
      .map(([brand, totalsByBrand]) => ({
        brand,
        quantity: totalsByBrand.quantity,
        revenue: totalsByBrand.revenue,
        profit: totalsByBrand.profit,
      }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 8);
  }, [dataset.detailRows, products]);

  const topCategories = useMemo(() => {
    const totals = new Map<string, { quantity: number; revenue: number; profit: number }>();

    dataset.detailRows
      .filter((row) => row.itemType === 'product')
      .forEach((row) => {
        const category = row.category?.trim() || 'Sin categoria';
        const current = totals.get(category) ?? { quantity: 0, revenue: 0, profit: 0 };
        current.quantity += row.quantity;
        current.revenue += row.subtotal;
        current.profit += row.utility;
        totals.set(category, current);
      });

    return Array.from(totals.entries())
      .map(([category, totalsByCategory]) => ({
        category,
        quantity: totalsByCategory.quantity,
        revenue: totalsByCategory.revenue,
        profit: totalsByCategory.profit,
      }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 8);
  }, [dataset.detailRows]);

  const purchaseAlerts = useMemo(() => {
    return topProducts
      .map((product) => {
        const productRecord = getProductById(products, product.productId);
        const currentStock = productRecord ? getOperationalProductStock(productRecord, movements) : 0;
        const monthlyDemand = Math.max(product.quantity, 0);
        const coverageRatio = monthlyDemand > 0 ? currentStock / monthlyDemand : currentStock;

        return {
          productId: product.productId,
          name: product.name,
          monthlyDemand,
          currentStock,
          revenue: product.revenue,
          brand: productRecord?.brand?.trim() || 'Sin marca',
          category: productRecord?.category?.trim() || 'Sin categoria',
          priority:
            currentStock <= 0
              ? 'critical'
              : currentStock <= LOW_STOCK_ALERT_THRESHOLD || coverageRatio < 0.5
                ? 'high'
                : coverageRatio <= 1
                  ? 'medium'
                  : 'ok',
          coverageLabel:
            currentStock <= 0
              ? 'Sin cobertura'
              : coverageRatio < 0.5
                ? 'Menos de medio mes'
                : coverageRatio <= 1
                  ? 'Menos de un mes'
                  : `${coverageRatio.toFixed(1)} meses aprox.`,
        };
      })
      .filter((item) => item.priority !== 'ok')
      .sort((left, right) => {
        const priorityWeight = { critical: 0, high: 1, medium: 2 } as const;
        return (
          priorityWeight[left.priority as keyof typeof priorityWeight] -
            priorityWeight[right.priority as keyof typeof priorityWeight] ||
          right.monthlyDemand - left.monthlyDemand
        );
      })
      .slice(0, 8);
  }, [movements, products, topProducts]);

  const brandRestockAlerts = useMemo(() => {
    const brandDemandMap = new Map<string, { units: number; riskyUnits: number; references: number }>();

    purchaseAlerts.forEach((alert) => {
      const current = brandDemandMap.get(alert.brand) ?? { units: 0, riskyUnits: 0, references: 0 };
      current.units += alert.monthlyDemand;
      current.riskyUnits += alert.currentStock;
      current.references += 1;
      brandDemandMap.set(alert.brand, current);
    });

    return Array.from(brandDemandMap.entries())
      .map(([brand, totals]) => ({
        brand,
        units: totals.units,
        riskyUnits: totals.riskyUnits,
        references: totals.references,
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);
  }, [purchaseAlerts]);

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
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between rounded-xl border-border bg-card/88 text-foreground dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-100 sm:w-[220px]"
            >
                  <span className="truncate capitalize">{monthLabel}</span>
                  <CalendarDays className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto rounded-2xl border border-border bg-card/95 p-0 text-foreground shadow-xl dark:border-slate-800 dark:bg-slate-950"
                align="start"
              >
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

      <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.82)_100%)] p-4 text-sm text-amber-900 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-amber-900/70 dark:bg-[linear-gradient(180deg,rgba(120,53,15,0.34)_0%,rgba(146,64,14,0.2)_100%)] dark:text-amber-100">
        El panel ya consolida ingresos, costos, utilidad y metodo de pago real del mes. El `estado` todavia se infiere desde devoluciones, asi que conviene leerlo como referencia operativa y no como auditoria final.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Transacciones</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{formatNumber(monthlyTotals.transactions)}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Ventas consolidadas del periodo.</p>
        </div>
        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Ticket promedio</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{formatCurrency(executiveSummary.averageTicket)}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Ingreso promedio por transaccion.</p>
        </div>
        <div className="rounded-[28px] border border-cyan-200 bg-[linear-gradient(180deg,rgba(236,254,255,0.98)_0%,rgba(207,250,254,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-cyan-900/70 dark:bg-[linear-gradient(180deg,rgba(8,47,73,0.52)_0%,rgba(14,116,144,0.24)_100%)] sm:p-6">
          <p className="text-sm text-cyan-800 dark:text-cyan-200">Ingreso total</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-950 dark:text-cyan-50">{formatCurrency(monthlyTotals.totalRevenue)}</p>
          <p className="mt-2 text-sm text-cyan-900 dark:text-cyan-100">Ventas y servicios del periodo.</p>
        </div>
        <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-amber-900/70 dark:bg-[linear-gradient(180deg,rgba(120,53,15,0.34)_0%,rgba(146,64,14,0.22)_100%)] sm:p-6">
          <p className="text-sm text-amber-800 dark:text-amber-200">Costo total</p>
          <p className="mt-2 text-2xl font-semibold text-amber-950 dark:text-amber-50">{formatCurrency(monthlyTotals.totalCost)}</p>
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">Costo de productos y servicios.</p>
        </div>
        <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(209,250,229,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-emerald-900/70 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.38)_0%,rgba(5,150,105,0.2)_100%)] sm:p-6">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">Utilidad total</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-950 dark:text-emerald-50">{formatCurrency(monthlyTotals.totalProfit)}</p>
          <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">Margen {executiveSummary.profitMargin.toFixed(1)}%.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Resumen ejecutivo</p>
              <p className="text-sm text-muted-foreground">Lectura rapida del negocio para el mes seleccionado.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Items facturados</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatNumber(dataset.detailRows.length)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Utilidad neta</p>
              <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(monthlyTotals.totalProfit)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Margen</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{executiveSummary.profitMargin.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Servicios</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatNumber(monthlyTotals.serviceCount)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Responsable destacado</p>
              <p className="text-sm text-muted-foreground">Quien mas aporta en utilidad dentro del periodo.</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            {executiveSummary.topSeller ? (
              <>
                <p className="text-lg font-semibold text-foreground">{executiveSummary.topSeller.seller}</p>
                <p className="mt-1 text-sm text-muted-foreground">{formatNumber(executiveSummary.topSeller.transactions)} transacciones</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background/88 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Ingreso</p>
                    <p className="mt-1 font-semibold text-foreground">{formatCurrency(executiveSummary.topSeller.revenue)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/88 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Utilidad</p>
                    <p className="mt-1 font-semibold text-emerald-700">{formatCurrency(executiveSummary.topSeller.profit)}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aun no hay ventas suficientes para destacar un responsable.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-muted p-2 text-foreground dark:bg-slate-900/80 dark:text-slate-100">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Linea de ventas</p>
              <p className="text-sm text-muted-foreground">Comportamiento comercial de productos vendidos.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ingreso</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatCurrency(executiveSummary.salesRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Utilidad</p>
              <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(executiveSummary.salesProfit)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Items</p>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {formatNumber(dataset.detailRows.filter((row) => row.itemType === 'product').length)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Linea de servicios</p>
              <p className="text-sm text-muted-foreground">Control del torno, materiales y utilidad del trabajo.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ingreso</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatCurrency(executiveSummary.serviceRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Costo</p>
              <p className="mt-2 text-xl font-semibold text-amber-700">{formatCurrency(executiveSummary.serviceCost)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Utilidad</p>
              <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(executiveSummary.serviceProfit)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Tendencia mensual</p>
              <p className="text-sm text-muted-foreground">Comparativo de ventas y utilidad de los ultimos 6 meses.</p>
            </div>
            <p className="text-sm text-muted-foreground">Corte en {monthLabel}</p>
          </div>
          <ChartContainer config={reportChartConfig} className="h-[320px] w-full">
            <LineChart data={monthlyTrend} margin={{ left: 12, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const numericValue = Number(value ?? 0);
                      const label = name === 'profit' ? 'Utilidad' : 'Ventas';
                      return (
                        <div className="flex min-w-[160px] items-center justify-between gap-3">
                          <span>{label}</span>
                          <span className="font-medium text-foreground">{formatCurrency(numericValue)}</span>
                        </div>
                      );
                    }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.monthValue ?? ''}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={3} dot={false} />
            </LineChart>
          </ChartContainer>
        </div>

        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground">Top productos del mes</p>
            <p className="text-sm text-muted-foreground">Grafica rapida de lo mas vendido por unidades.</p>
          </div>
          {topProductsChartData.length > 0 ? (
            <ChartContainer config={reportChartConfig} className="h-[320px] w-full">
              <BarChart data={topProductsChartData} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name, item) => {
                        const numericValue = Number(value ?? 0);
                        const payload = item?.payload as { fullName?: string } | undefined;
                        return (
                          <div className="grid gap-1">
                            <span className="font-medium text-foreground">{payload?.fullName ?? 'Producto'}</span>
                            <div className="flex min-w-[150px] items-center justify-between gap-3">
                              <span>{name === 'quantity' ? 'Unidades' : 'Ventas'}</span>
                              <span className="font-medium text-foreground">
                                {name === 'quantity' ? formatNumber(numericValue) : formatCurrency(numericValue)}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="quantity" fill="var(--color-quantity)" radius={10} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60">
              Aun no hay productos vendidos en este periodo para graficar.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Resumen por venta</p>
            <p className="text-sm text-muted-foreground">Cada fila consolida lo que compro el cliente en una misma transaccion.</p>
          </div>
          <p className="text-sm text-muted-foreground">{formatNumber(dataset.summaryRows.length)} registros</p>
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
          <Empty className="rounded-3xl border border-dashed border-border bg-muted/60 py-10 dark:border-slate-800 dark:bg-slate-900/55">
            <EmptyHeader>
              <EmptyTitle>Sin ventas en este mes</EmptyTitle>
              <EmptyDescription>No se encontraron transacciones para el periodo seleccionado.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Detalle por item vendido</p>
            <p className="text-sm text-muted-foreground">Cada fila representa un producto o servicio con contexto completo de la venta.</p>
          </div>
          <p className="text-sm text-muted-foreground">{formatNumber(dataset.detailRows.length)} filas</p>
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
          <Empty className="rounded-3xl border border-dashed border-border bg-muted/60 py-10 dark:border-slate-800 dark:bg-slate-900/55">
            <EmptyHeader>
              <EmptyTitle>Sin items para mostrar</EmptyTitle>
              <EmptyDescription>No hay productos o servicios vendidos en el periodo seleccionado.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
          <p className="text-sm font-semibold text-foreground">Productos mas vendidos</p>
          <p className="mt-1 text-sm text-muted-foreground">Top del mes por unidades facturadas.</p>
          <div className="mt-4 space-y-3">
            {topProducts.length > 0 ? (
              topProducts.map((product) => (
                <div
                  key={product.productId}
                  className="rounded-2xl border border-border bg-muted/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <p className="font-medium text-foreground">{product.name}</p>
                  <p className="text-sm text-muted-foreground">{formatNumber(product.quantity)} unidades</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(product.revenue)}</p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60">
                Aun no hay productos vendidos en este periodo.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
            <p className="text-sm font-semibold text-foreground">Marcas que mas venden</p>
            <p className="mt-1 text-sm text-muted-foreground">Te ayuda a decidir que marca reponer, empujar o negociar mejor.</p>
            <div className="mt-4 space-y-3">
              {topBrands.length > 0 ? (
                topBrands.map((brand) => (
                  <div
                    key={brand.brand}
                    className="rounded-2xl border border-border bg-muted/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <p className="font-medium text-foreground">{brand.brand}</p>
                    <p className="text-sm text-muted-foreground">{formatNumber(brand.quantity)} unidades</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(brand.revenue)} venta · {formatCurrency(brand.profit)} utilidad
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60">
                  Aun no hay marcas con ventas en este periodo.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Servicios del torno</p>
                <p className="text-sm text-muted-foreground">{formatNumber(monthlyTotals.serviceCount)} items de servicio en el mes.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {monthServices.length > 0 ? (
                monthServices.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-2xl border border-border bg-muted/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <p className="font-medium text-foreground">{service.serviceLabel?.trim() || serviceTypeLabels[service.serviceType]}</p>
                    <p className="text-sm text-muted-foreground">{service.customerName} · {service.cueReference || 'Sin referencia'}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(service.totalRevenue)} ingreso · {formatCurrency(service.grossProfit)} utilidad
                    </p>
                  </div>
                ))
              ) : (
                <Empty className="rounded-2xl border border-dashed border-border bg-muted/60 py-8 dark:border-slate-800 dark:bg-slate-900/55">
                  <EmptyHeader>
                    <EmptyMedia className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">
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

      <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
        <p className="text-sm font-semibold text-foreground">Categorias que mas rotan</p>
        <p className="mt-1 text-sm text-muted-foreground">Sirve para entender que familia de producto sostiene mas movimiento en el mes.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {topCategories.length > 0 ? (
            topCategories.map((category) => (
              <div
                key={category.category}
                className="rounded-2xl border border-border bg-muted/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <p className="font-medium text-foreground">{category.category}</p>
                <p className="text-sm text-muted-foreground">{formatNumber(category.quantity)} unidades</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(category.revenue)} venta</p>
                <p className="text-sm text-emerald-700">{formatCurrency(category.profit)} utilidad</p>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60 md:col-span-2 xl:col-span-4">
              Aun no hay categorias con ventas en este periodo.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
          <p className="text-sm font-semibold text-foreground">Alertas de compra</p>
          <p className="mt-1 text-sm text-muted-foreground">Cruza lo mas vendido del mes contra el stock actual para priorizar reposicion.</p>
          <div className="mt-4 space-y-3">
            {purchaseAlerts.length > 0 ? (
              purchaseAlerts.map((alert) => (
                <div
                  key={alert.productId}
                  className="rounded-2xl border border-border bg-muted/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{alert.name}</p>
                      <p className="text-sm text-muted-foreground">{alert.brand} · {alert.category}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        alert.priority === 'critical'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                          : alert.priority === 'high'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                            : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200'
                      }`}
                    >
                      {alert.priority === 'critical'
                        ? 'Urgente'
                        : alert.priority === 'high'
                          ? 'Alta'
                          : 'Media'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-background/88 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Vendio mes</p>
                      <p className="mt-1 font-semibold text-foreground">{formatNumber(alert.monthlyDemand)} uds</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/88 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Stock actual</p>
                      <p className="mt-1 font-semibold text-foreground">{formatNumber(alert.currentStock)} uds</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/88 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Cobertura</p>
                      <p className="mt-1 font-semibold text-foreground">{alert.coverageLabel}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60">
                No hay alertas de compra para este periodo. El stock actual cubre lo mas vendido del mes.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
          <p className="text-sm font-semibold text-foreground">Marcas con riesgo de reposicion</p>
          <p className="mt-1 text-sm text-muted-foreground">Te ayuda a negociar compras donde mas se te puede frenar la venta.</p>
          <div className="mt-4 space-y-3">
            {brandRestockAlerts.length > 0 ? (
              brandRestockAlerts.map((brand) => (
                <div
                  key={brand.brand}
                  className="rounded-2xl border border-border bg-muted/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <p className="font-medium text-foreground">{brand.brand}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatNumber(brand.references)} referencia(s) comprometidas
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatNumber(brand.units)} uds vendidas en alertas · {formatNumber(brand.riskyUnits)} uds disponibles
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60">
                Aun no hay marcas comprometidas para reponer en este periodo.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
        <p className="text-sm font-semibold text-foreground">Materiales mas usados en servicios</p>
        <p className="mt-1 text-sm text-muted-foreground">Te ayuda a ver que insumos del torno se estan consumiendo con mayor frecuencia.</p>
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
            <p className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60">
              Aun no hay consumo de materiales en servicios para este mes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
