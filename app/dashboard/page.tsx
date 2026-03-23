'use client';

import { useMemo, useState } from 'react';
import { CircleAlert, PackageCheck, Search, SendHorizonal, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { MetricCard } from '@/components/admin/dashboard/metric-card';
import { SaleFormDialog, type SaleFormValues } from '@/components/admin/sales/sale-form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber, getProductStock, getStockAlert } from '@/lib/admin/calculations';

export default function DashboardPage() {
  const { products, movements, purchases, summary, registerSale } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const [productQuery, setProductQuery] = useState('');
  const [openSaleDialog, setOpenSaleDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const availableProducts = products
    .map((product) => ({
      ...product,
      stock: getProductStock(movements, product.id),
    }))
    .filter((product) => product.status === 'active' && product.stock > 0)
    .sort((left, right) => right.stock - left.stock);

  const outProducts = products
    .map((product) => ({
      ...product,
      stock: getProductStock(movements, product.id),
    }))
    .filter((product) => product.status === 'active' && getStockAlert(product, movements) === 'out')
    .sort((left, right) => left.name.localeCompare(right.name));

  const quickResults = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase();
    if (!normalizedQuery) return availableProducts.slice(0, 8);

    return availableProducts
      .filter((product) =>
        `${product.name} ${product.brand} ${product.category} ${product.subcategory}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 8);
  }, [availableProducts, productQuery]);

  const selectedProduct = selectedProductId
    ? products.find((product) => product.id === selectedProductId) ?? null
    : null;

  const initialSaleValues: SaleFormValues | null = selectedProduct
    ? {
        soldAt: new Date().toISOString().slice(0, 10),
        items: [
          {
            productId: selectedProduct.id,
            quantity: 1,
            unitPrice: selectedProduct.salePrice,
            giftItems: [],
          },
        ],
        customerName: 'Cliente mostrador',
        notes: '',
      }
    : null;

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
                ? 'Busca el producto, mira el precio y vende desde aqui.'
                : 'Controla el stock, consulta precios y registra ventas rapido.'}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              {role === 'sales'
                ? 'Este tablero te deja encontrar productos disponibles, ver su precio de venta y abrir el formulario para vender sin pasar por inventario.'
                : 'Usa este panel como vista operativa para consultar precios, detectar agotados y abrir ventas desde la pantalla principal.'}
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-50 p-3">
            <ShoppingCart className="h-5 w-5 text-cyan-700" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Busqueda rapida para vender</h2>
            <p className="text-sm text-slate-500">
              Escribe el producto, revisa el precio y abre la venta desde este panel.
            </p>
          </div>
        </div>

        <div className="relative max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (quickResults.length === 0) return;
              event.preventDefault();
              setSelectedProductId(quickResults[0].id);
              setOpenSaleDialog(true);
            }}
            placeholder="Buscar producto por nombre, marca o categoria"
            className="pl-9"
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {quickResults.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{product.name}</p>
                <p className="text-sm text-slate-500">
                  {product.brand} · {product.category}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Stock: <span className="font-medium text-slate-900">{formatNumber(product.stock)}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Precio de venta: <span className="font-semibold text-emerald-700">{formatCurrency(product.salePrice)}</span>
                </p>
              </div>
              <Button
                className="rounded-xl"
                onClick={() => {
                  setSelectedProductId(product.id);
                  setOpenSaleDialog(true);
                }}
              >
                Vender
              </Button>
            </div>
          ))}
          {quickResults.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 lg:col-span-2">
              No encontramos productos disponibles con esa busqueda.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3">
              <PackageCheck className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Disponibles para vender</h2>
              <p className="text-sm text-slate-500">Productos con stock y su valor de venta actual.</p>
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
                  <p className="mt-1 text-sm font-medium text-emerald-800">
                    {formatCurrency(product.salePrice)}
                  </p>
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
                <p className="text-sm text-slate-500">Referencias agotadas con su ultimo precio de venta.</p>
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
                  <p className="mt-1 text-sm font-medium text-rose-800">
                    {formatCurrency(product.salePrice)}
                  </p>
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

      <SaleFormDialog
        open={openSaleDialog}
        onOpenChange={(nextOpen) => {
          setOpenSaleDialog(nextOpen);
          if (!nextOpen) {
            setSelectedProductId(null);
          }
        }}
        products={products}
        purchases={purchases}
        movements={movements}
        initialValues={initialSaleValues}
        hideFinancialSummary={role === 'sales'}
        onSubmit={async (values) => {
          try {
            await registerSale({
              ...values,
              soldAt: new Date(values.soldAt).toISOString(),
              items: values.items,
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            });
            setOpenSaleDialog(false);
            setSelectedProductId(null);
            toast({
              title: 'Venta registrada',
              description: 'El producto fue vendido desde el dashboard y el inventario quedo actualizado.',
            });
          } catch (error) {
            toast({
              title: 'No se pudo registrar la venta',
              description: error instanceof Error ? error.message : 'Verifica el stock disponible.',
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />
    </div>
  );
}
