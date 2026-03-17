'use client';

import { BarChart3 } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { StockBadge } from '@/components/admin/shared/status-badges';
import { useAdminData } from '@/components/admin/admin-data-context';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber, getStockAlert } from '@/lib/admin/calculations';

export default function ReportesPage() {
  const { products, summary, movements } = useAdminData();
  const lowStock = products.filter((product) => getStockAlert(product) === 'low');
  const outOfStock = products.filter((product) => getStockAlert(product) === 'out');

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Reportes iniciales"
        title="Visibilidad operativa del inventario"
        description="Resumen ejecutivo para stock actual, productos agotados, bajo inventario, valorizacion y utilidad estimada por referencia."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Inventario actual</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{formatNumber(summary.totalStock)} uds</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Productos agotados</p>
          <p className="mt-2 text-3xl font-semibold text-rose-700">
            {formatNumber(summary.outOfStockProducts)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Valorizacion del inventario</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {formatCurrency(summary.investedValue)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Utilidad estimada</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">
            {formatCurrency(summary.projectedProfit)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">Productos con stock bajo</h3>
          {lowStock.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Minimo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>{formatNumber(product.stockQuantity)}</TableCell>
                    <TableCell>{formatNumber(product.stockMinimum)}</TableCell>
                    <TableCell>
                      <StockBadge product={product} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Sin alertas de stock bajo</EmptyTitle>
                <EmptyDescription>
                  El inventario no tiene productos en nivel critico de reposicion.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-950">Productos agotados</h3>
          {outOfStock.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Costo real</TableHead>
                  <TableHead>Venta</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outOfStock.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>{formatCurrency(product.realUnitCost)}</TableCell>
                    <TableCell>{formatCurrency(product.salePrice)}</TableCell>
                    <TableCell>
                      <StockBadge product={product} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-950">Valorizacion por producto</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Inversion actual</TableHead>
              <TableHead>Venta estimada</TableHead>
              <TableHead>Utilidad estimada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>{product.name}</TableCell>
                <TableCell>{formatNumber(product.stockQuantity)}</TableCell>
                <TableCell>{formatCurrency(product.stockQuantity * product.realUnitCost)}</TableCell>
                <TableCell>{formatCurrency(product.stockQuantity * product.salePrice)}</TableCell>
                <TableCell>
                  {formatCurrency(product.stockQuantity * (product.salePrice - product.realUnitCost))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-4 text-sm text-slate-500">
          Movimientos historicos registrados: {formatNumber(movements.length)}.
        </p>
      </div>
    </div>
  );
}
