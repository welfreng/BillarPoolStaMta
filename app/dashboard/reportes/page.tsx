'use client';

import { BarChart3, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { StockBadge } from '@/components/admin/shared/status-badges';
import { useAdminData } from '@/components/admin/admin-data-context';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  formatCurrency,
  formatNumber,
  getProductRealUnitCost,
  getProductStock,
  getStockAlert,
} from '@/lib/admin/calculations';

export default function ReportesPage() {
  const { products, purchases, sales, summary, movements } = useAdminData();
  const availableProducts = products.filter((product) => getStockAlert(product, movements) === 'healthy');
  const outOfStock = products.filter((product) => getStockAlert(product, movements) === 'out');

  return (
    <div className="space-y-6 print:space-y-4">
      <SectionHeader
        eyebrow="Reportes iniciales"
        title="Visibilidad operativa del inventario"
        description="Resumen ejecutivo para stock actual, productos agotados, valorizacion y utilidad estimada por referencia."
        actions={
          <Button
            type="button"
            onClick={() => window.print()}
            className="w-full rounded-xl sm:w-auto print:hidden"
          >
            <Download className="mr-2 h-4 w-4" />
            Generar PDF
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
          <p className="text-sm text-slate-500">Inventario actual</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">{formatNumber(summary.totalStock)} uds</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
          <p className="text-sm text-slate-500">Productos agotados</p>
          <p className="mt-2 text-2xl font-semibold text-rose-700 sm:text-3xl">
            {formatNumber(summary.outOfStockProducts)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
          <p className="text-sm text-slate-500">Valorizacion del inventario</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">
            {formatCurrency(summary.investedValue)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
          <p className="text-sm text-slate-500">Utilidad estimada</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700 sm:text-3xl">
            {formatCurrency(summary.projectedProfit)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
          <p className="text-sm text-slate-500">Ingresos por ventas</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">
            {formatCurrency(summary.totalRevenue)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
          <p className="text-sm text-slate-500">Utilidad realizada</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700 sm:text-3xl">
            {formatCurrency(summary.realizedProfit)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 print:grid-cols-1">
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">Productos disponibles</h3>
          {availableProducts.length > 0 ? (
            <div className="min-w-0">
              <Table className="min-w-[420px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60%]">Producto</TableHead>
                    <TableHead className="w-[18%]">Stock</TableHead>
                    <TableHead className="w-[22%]">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="max-w-0">
                        <span className="block truncate">{product.name}</span>
                      </TableCell>
                      <TableCell className="text-left">{formatNumber(getProductStock(movements, product.id))}</TableCell>
                      <TableCell className="text-left">
                        <StockBadge product={product} movements={movements} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Sin inventario disponible</EmptyTitle>
                <EmptyDescription>
                  Aun no hay referencias con unidades disponibles para operar.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">Productos agotados</h3>
          {outOfStock.length > 0 ? (
            <div className="min-w-0">
              <Table className="min-w-[380px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[72%]">Producto</TableHead>
                    <TableHead className="w-[28%]">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outOfStock.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="max-w-0">
                        <span className="block truncate">{product.name}</span>
                      </TableCell>
                      <TableCell className="text-left">
                        <StockBadge product={product} movements={movements} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>No hay agotados</EmptyTitle>
                <EmptyDescription>
                  Todas las referencias tienen disponibilidad operativa.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>

      <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
        <h3 className="mb-4 text-lg font-semibold text-slate-950">Valorizacion por producto</h3>
        <div className="min-w-0">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Inversion actual</TableHead>
                <TableHead>Venta estimada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const stock = getProductStock(movements, product.id);
                const realUnitCost = getProductRealUnitCost(purchases, product.id);
                return (
                  <TableRow key={product.id}>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>{formatNumber(stock)}</TableCell>
                    <TableCell>{formatCurrency(stock * realUnitCost)}</TableCell>
                    <TableCell>{formatCurrency(stock * product.salePrice)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Movimientos historicos registrados: {formatNumber(movements.length)}. Ventas registradas: {formatNumber(sales.length)}.
        </p>
      </div>

      <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:break-inside-avoid print:shadow-none">
        <h3 className="mb-4 text-lg font-semibold text-slate-950">Detalle de ventas</h3>
        {sales.length > 0 ? (
          <div className="min-w-0">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Ingreso</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Utilidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => {
                  const product = products.find((item) => item.id === sale.productId);
                  const netRevenue = sale.totalSale - (sale.returnedSaleAmount ?? 0);
                  const netCost = sale.totalCost - (sale.returnedCostAmount ?? 0);
                  const netProfit =
                    sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0));
                  return (
                    <TableRow key={sale.id}>
                      <TableCell>{product?.name ?? 'Producto'}</TableCell>
                      <TableCell>{sale.customerName}</TableCell>
                      <TableCell>{formatNumber(sale.quantity - (sale.returnedQuantity ?? 0))}</TableCell>
                      <TableCell>{formatCurrency(netRevenue)}</TableCell>
                      <TableCell>{formatCurrency(netCost)}</TableCell>
                      <TableCell>{formatCurrency(netProfit)}</TableCell>
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
              <EmptyTitle>Sin ventas registradas</EmptyTitle>
              <EmptyDescription>
                Cuando registres ventas aqui podras ver ingresos, costos y utilidad por movimiento.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}
