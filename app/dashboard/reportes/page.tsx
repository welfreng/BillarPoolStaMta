'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Download, FileSpreadsheet, FileText, Wrench } from 'lucide-react';
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
  buildSalesReportExcelContent,
  buildSalesReportPdf,
} from '@/lib/admin/report-export';
import { useToast } from '@/hooks/use-toast';

const currentMonth = new Date().toISOString().slice(0, 7);

function downloadBlob(content: BlobPart, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ReportesPage() {
  const { products, sales, services } = useAdminData();
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
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

  const exportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const xml = buildSalesReportExcelContent(dataset);
      downloadBlob(
        xml,
        `reporte-ventas-${selectedMonth}.xls`,
        'application/vnd.ms-excel;charset=utf-8'
      );
      toast({
        title: 'Excel generado',
        description: 'Se descargaron las hojas de detalle por item y resumen por venta.',
      });
    } catch (error) {
      console.error('Error exportando Excel de ventas:', error);
      toast({
        title: 'No se pudo generar el Excel',
        description: error instanceof Error ? error.message : 'La exportacion fallo.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

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
        eyebrow="Reporte comercial"
        title="Ventas detalladas"
        description="Reporte util para historico, reconstruccion y analisis de utilidad por venta, cliente e item."
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
            <Button type="button" variant="outline" onClick={() => void exportExcel()} disabled={isExportingExcel} className="rounded-xl">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {isExportingExcel ? 'Generando Excel...' : 'Descargar Excel'}
            </Button>
            <Button type="button" onClick={() => void exportPdf()} disabled={isExportingPdf} className="rounded-xl">
              <FileText className="mr-2 h-4 w-4" />
              {isExportingPdf ? 'Generando PDF...' : 'Descargar PDF'}
            </Button>
          </div>
        }
      />

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
        El reporte ya incluye cliente, telefono, vendedor, items, costos, utilidad y observaciones. `Metodo de pago` no existe hoy en la estructura de `sales/services`, por eso se exporta como `No registrado`. El `estado` se infiere desde devoluciones o se marca como `Completada`.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Ventas / transacciones</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(monthlyTotals.transactions)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Items vendidos</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(dataset.detailRows.length)}</p>
        </div>
        <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4 shadow-sm sm:p-6">
          <p className="text-sm text-cyan-800">Ingreso total</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-950">{formatCurrency(monthlyTotals.totalRevenue)}</p>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-6">
          <p className="text-sm text-amber-800">Costo total</p>
          <p className="mt-2 text-2xl font-semibold text-amber-950">{formatCurrency(monthlyTotals.totalCost)}</p>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:p-6">
          <p className="text-sm text-emerald-800">Utilidad total</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-950">{formatCurrency(monthlyTotals.totalProfit)}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
