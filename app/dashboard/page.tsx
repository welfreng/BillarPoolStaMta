'use client';

import Link from 'next/link';
import { ArrowRight, CircleAlert, PackageSearch, WalletCards } from 'lucide-react';
import { useAdminData } from '@/components/admin/admin-data-context';
import { MetricCard } from '@/components/admin/dashboard/metric-card';
import { RecentMovements } from '@/components/admin/dashboard/recent-movements';
import { formatCurrency, formatNumber, getStockAlert } from '@/lib/admin/calculations';

export default function DashboardPage() {
  const { products, summary, latestMovements } = useAdminData();
  const outProducts = products.filter((product) => getStockAlert(product) === 'out');
  const lowProducts = products.filter((product) => getStockAlert(product) === 'low');

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] bg-slate-950 p-6 text-white shadow-xl md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="text-sm font-medium text-cyan-300">Centro de control</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
              Inventario, costos y trazabilidad en una sola vista operativa.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              Esta base administrativa ya contempla productos por unidad, docena y caja,
              movimientos de inventario, compras con costo unitario real y reportes listos para crecer.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-400/10 p-3">
                <WalletCards className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <p className="text-sm text-slate-300">Valorizacion actual</p>
                <p className="text-2xl font-semibold">{formatCurrency(summary.investedValue)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-400/10 p-3">
                <CircleAlert className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <p className="text-sm text-slate-300">Alertas abiertas</p>
                <p className="text-2xl font-semibold">
                  {formatNumber(summary.lowStockProducts + summary.outOfStockProducts)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-400/10 p-3">
                <PackageSearch className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <p className="text-sm text-slate-300">Unidades en inventario</p>
                <p className="text-2xl font-semibold">{formatNumber(summary.totalStock)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total de productos"
          value={formatNumber(summary.totalProducts)}
          helper="Catalogo activo y disponible para operaciones del negocio."
        />
        <MetricCard
          title="Valor total invertido"
          value={formatCurrency(summary.investedValue)}
          helper="Costo real del inventario usando compra + envio prorrateado."
          tone="success"
        />
        <MetricCard
          title="Productos con stock bajo"
          value={formatNumber(summary.lowStockProducts)}
          helper="Items que ya tocaron su stock minimo y requieren reposicion."
          tone="warning"
        />
        <MetricCard
          title="Productos agotados"
          value={formatNumber(summary.outOfStockProducts)}
          helper="Referencias sin existencia disponible para venta inmediata."
          tone="danger"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <RecentMovements products={products} movements={latestMovements} />

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">Rentabilidad proyectada</h3>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Valor estimado de venta</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {formatCurrency(summary.estimatedSalesValue)}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-sm text-emerald-700">Utilidad proyectada</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-950">
                  {formatCurrency(summary.projectedProfit)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-950">Alertas operativas</h3>
              <Link
                href="/dashboard/reportes"
                className="inline-flex items-center gap-2 text-sm font-medium text-cyan-700"
              >
                Ver reportes <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="space-y-3">
              {lowProducts.slice(0, 3).map((product) => (
                <div key={product.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-sm text-slate-500">
                    Stock actual {formatNumber(product.stockQuantity)} / minimo{' '}
                    {formatNumber(product.stockMinimum)}
                  </p>
                </div>
              ))}
              {outProducts.slice(0, 2).map((product) => (
                <div key={product.id} className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-sm text-slate-500">Producto agotado y listo para reposicion.</p>
                </div>
              ))}
              {lowProducts.length === 0 && outProducts.length === 0 && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                  No hay alertas activas. El inventario esta operando dentro de niveles sanos.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
