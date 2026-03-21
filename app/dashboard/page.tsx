'use client';

import { CircleAlert, PackageCheck, SendHorizonal } from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { MetricCard } from '@/components/admin/dashboard/metric-card';
import { Button } from '@/components/ui/button';
import { useAdminData } from '@/components/admin/admin-data-context';
import { formatNumber, getProductStock, getStockAlert } from '@/lib/admin/calculations';

export default function DashboardPage() {
  const { products, movements, summary } = useAdminData();
  const { role } = useAuth();

  const availableProducts = products
    .map((product) => ({
      ...product,
      stock: getProductStock(movements, product.id),
    }))
    .filter((product) => product.stock > 0)
    .sort((left, right) => right.stock - left.stock);

  const outProducts = products
    .map((product) => ({
      ...product,
      stock: getProductStock(movements, product.id),
    }))
    .filter((product) => getStockAlert(product, movements) === 'out')
    .sort((left, right) => left.name.localeCompare(right.name));

  const outProductsMessage =
    outProducts.length > 0
      ? `Hola, necesito solicitar estos productos agotados:%0A%0A${outProducts
          .map((product, index) => `${index + 1}. ${product.name}`)
          .join('%0A')}`
      : 'Hola, por ahora no tenemos productos agotados para solicitar.';

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] bg-slate-950 p-6 text-white shadow-xl md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <div>
            <p className="text-sm font-medium text-cyan-300">Centro de control</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
              {role === 'sales'
                ? 'Consulta rapido lo que puedes vender y lo que hace falta reponer.'
                : 'Controla el stock disponible y detecta rapido los productos agotados.'}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              {role === 'sales'
                ? 'Este tablero muestra solo inventario disponible para venta y referencias agotadas para reposicion.'
                : 'Usa este panel como vista operativa del inventario para revisar existencias y solicitar productos agotados.'}
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-400/10 p-3">
                <PackageCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <p className="text-sm text-slate-300">Productos con stock</p>
                <p className="text-2xl font-semibold">{formatNumber(availableProducts.length)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-400/10 p-3">
                <CircleAlert className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <p className="text-sm text-slate-300">Productos agotados</p>
                <p className="text-2xl font-semibold">{formatNumber(outProducts.length)}</p>
              </div>
            </div>
            <div className="pt-2">
              <a
                href={`https://wa.me/573006775284?text=${outProductsMessage}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="w-full rounded-2xl bg-[#d4a017] text-[#0a1628] hover:bg-[#d4a017]/90">
                  <SendHorizonal className="mr-2 h-4 w-4" />
                  Solicitar agotados
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Total de productos"
          value={formatNumber(summary.totalProducts)}
          helper="Referencias registradas actualmente en el sistema."
        />
        <MetricCard
          title="Productos disponibles"
          value={formatNumber(availableProducts.length)}
          helper="Productos que tienen existencias para vender."
          tone="success"
        />
        <MetricCard
          title="Productos agotados"
          value={formatNumber(outProducts.length)}
          helper="Productos que debes reponer o solicitar."
          tone="danger"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3">
              <PackageCheck className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Disponibles para vender</h2>
              <p className="text-sm text-slate-500">Productos con stock actual en inventario.</p>
            </div>
          </div>

          <div className="space-y-3">
            {availableProducts.slice(0, 12).map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{product.name}</p>
                  <p className="text-sm text-slate-500">{product.brand}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Stock</p>
                  <p className="text-lg font-semibold text-emerald-950">{formatNumber(product.stock)}</p>
                </div>
              </div>
            ))}
            {availableProducts.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No hay productos disponibles para vender en este momento.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-rose-50 p-3">
                <CircleAlert className="h-5 w-5 text-rose-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Productos agotados</h2>
                <p className="text-sm text-slate-500">Referencias que requieren solicitud o reposicion.</p>
              </div>
            </div>
            {outProducts.length > 0 && (
              <a
                href={`https://wa.me/573006775284?text=${outProductsMessage}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="rounded-2xl">
                  <SendHorizonal className="mr-2 h-4 w-4" />
                  Reporte
                </Button>
              </a>
            )}
          </div>

          <div className="space-y-3">
            {outProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{product.name}</p>
                  <p className="text-sm text-slate-500">{product.brand}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Stock</p>
                  <p className="text-lg font-semibold text-rose-950">{formatNumber(product.stock)}</p>
                </div>
              </div>
            ))}
            {outProducts.length === 0 && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                No hay productos agotados. Todo el stock esta disponible para venta.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
