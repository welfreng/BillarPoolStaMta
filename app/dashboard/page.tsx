'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CircleAlert, PackageCheck, Search, SendHorizonal, ShieldCheck, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { MetricCard } from '@/components/admin/dashboard/metric-card';
import { SaleDetailsDialog } from '@/components/admin/sales/sale-details-dialog';
import { SaleFormDialog, type SaleFormValues } from '@/components/admin/sales/sale-form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber, getProductStock, getStockAlert } from '@/lib/admin/calculations';
import { getFriendlyFirestoreWriteErrorMessage } from '@/lib/firestore-write-retry';
import type { Product } from '@/lib/admin/types';

function getProductSalePriceSummary(product: Product) {
  const prices = (product.variants ?? [])
    .map((variant) => Number(variant.salePrice ?? 0))
    .filter((price) => price > 0);

  if (prices.length === 0) return formatCurrency(product.salePrice);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return minPrice === maxPrice
    ? formatCurrency(minPrice)
    : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
}

function getVariantAvailabilitySummary(product: Product) {
  const variants = product.variants ?? [];
  if (variants.length === 0) return null;

  const inStockCount = variants.filter((variant) => Number(variant.stock ?? 0) > 0).length;
  const outOfStockCount = variants.length - inStockCount;

  if (outOfStockCount > 0) {
    return `${inStockCount}/${variants.length} variantes con stock · ${outOfStockCount} agotadas`;
  }

  return `${variants.length} variantes con stock`;
}

function getSellableVariants(product: Product | null | undefined) {
  if (!product) return [];
  return (product.variants ?? []).filter(
    (variant) => variant.status !== 'inactive' && Number(variant.stock ?? 0) > 0
  );
}

export default function DashboardPage() {
  const { products, movements, purchases, summary, sales, services, registerSale, authorizationRequests } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const [productQuery, setProductQuery] = useState('');
  const [openSaleDialog, setOpenSaleDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null);

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

  const outVariants = useMemo(() => {
    return products
      .filter((product) => product.status === 'active')
      .flatMap((product) =>
        (product.variants ?? [])
          .filter((variant) => Number(variant.stock ?? 0) <= 0)
          .map((variant) => ({
            product,
            variant,
            stock: Math.max(Number(variant.stock ?? 0), 0),
            salePrice: Number(variant.salePrice ?? product.salePrice ?? 0),
          }))
      )
      .sort((left, right) => {
        const productCompare = left.product.name.localeCompare(right.product.name);
        if (productCompare !== 0) return productCompare;
        return (left.variant.displayName ?? left.variant.name).localeCompare(
          right.variant.displayName ?? right.variant.name
        );
      });
  }, [products]);

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
  const selectedProductHasVariants = (selectedProduct?.variants?.length ?? 0) > 0;
  const selectedProductSellableVariants = getSellableVariants(selectedProduct);
  const suggestedSelectedVariant =
    selectedProductSellableVariants.length === 1 ? selectedProductSellableVariants[0] : null;
  const detailsSale = detailsSaleId ? sales.find((sale) => sale.id === detailsSaleId) ?? null : null;

  const initialSaleValues: SaleFormValues | null = selectedProduct
    ? {
        soldAt: new Date().toISOString().slice(0, 10),
        items: [
          {
            productId: selectedProduct.id,
            variantId: suggestedSelectedVariant?.id ?? '',
            quantity: 1,
            unitPrice:
              suggestedSelectedVariant
                ? Number(suggestedSelectedVariant.salePrice ?? selectedProduct.salePrice)
                : selectedProductHasVariants
                  ? 0
                : selectedProduct.salePrice,
            serviceItems: [],
            giftItems: [],
          },
        ],
        customerPhone: '',
        customerName: '',
        paymentMethod: 'efectivo',
        paymentReference: '',
        notes: '',
      }
    : null;

  const outProductsMessage =
    outProducts.length > 0
      ? `Hola, necesito solicitar estos productos agotados:%0A%0A${outProducts
          .map((product, index) => `${index + 1}. ${product.name}`)
          .join('%0A')}`
      : 'Hola, por ahora no tenemos productos agotados para solicitar.';
  const outVariantMessage =
    outVariants.length > 0
      ? `Hola, necesito solicitar estas variantes agotadas:%0A%0A${outVariants
          .map(
            (item, index) =>
              `${index + 1}. ${item.product.name} - ${item.variant.displayName ?? item.variant.name}`
          )
          .join('%0A')}`
      : 'Hola, por ahora no tenemos variantes agotadas para solicitar.';
  const pendingAuthorizationRequests = authorizationRequests.filter((request) => request.status === 'pending');

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.28),transparent_28%),linear-gradient(135deg,#08162f_0%,#0a2472_52%,#0b1d3f_100%)] p-6 text-white shadow-[0_30px_80px_rgba(8,22,47,0.34)] md:p-8">
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

          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-white/8 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
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
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-rose-400/10 p-3">
                <CircleAlert className="h-5 w-5 text-rose-300" />
              </div>
              <div>
                <p className="text-sm text-slate-300">Variantes agotadas</p>
                <p className="text-2xl font-semibold">{formatNumber(outVariants.length)}</p>
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
        <MetricCard
          title="Variantes agotadas"
          value={formatNumber(outVariants.length)}
          helper="Combinaciones sin stock para reponer con mas precision."
          tone="danger"
        />
        {role === 'admin' ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/70 dark:bg-[linear-gradient(180deg,rgba(120,53,15,0.34)_0%,rgba(146,64,14,0.22)_100%)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-amber-800 dark:text-amber-200">Autorizaciones pendientes</p>
                <p className="mt-2 text-3xl font-semibold text-amber-950 dark:text-amber-50">
                  {formatNumber(pendingAuthorizationRequests.length)}
                </p>
                <p className="mt-2 text-sm text-amber-900 dark:text-amber-100/90">
                  Revisa solicitudes de edicion o devolucion enviadas por vendedores.
                </p>
              </div>
              <div className="rounded-2xl bg-white/80 p-3 text-amber-800 dark:bg-slate-950/50 dark:text-amber-200">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <Link href="/dashboard/autorizaciones" className="mt-4 inline-flex">
              <Button variant="outline" className="rounded-2xl border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-950/70 dark:text-amber-100 dark:hover:bg-slate-900">
                Ver solicitudes
              </Button>
            </Link>
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-50 p-3 dark:bg-cyan-950/40">
            <ShoppingCart className="h-5 w-5 text-cyan-700" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Busqueda rapida para vender</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Escribe el producto, revisa el precio y abre la venta desde este panel.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cuando un producto tenga variantes, el valor mostrado es referencia y el precio final sale de la combinacion elegida.
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
              className="rounded-2xl border-slate-200 bg-white/90 pl-9 shadow-sm dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-100"
            />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {quickResults.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between gap-4 rounded-[22px] border border-cyan-100 bg-[linear-gradient(180deg,rgba(236,254,255,0.96)_0%,rgba(207,250,254,0.58)_100%)] p-4 shadow-sm dark:border-cyan-900/60 dark:bg-[linear-gradient(180deg,rgba(8,47,73,0.46)_0%,rgba(14,116,144,0.18)_100%)]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">{product.name}</p>
                {getVariantAvailabilitySummary(product) ? (
                  <p className="mt-1 text-xs font-medium text-cyan-700 dark:text-cyan-200">
                    {getVariantAvailabilitySummary(product)}
                  </p>
                ) : null}
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {product.brand} · {product.category}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Stock: <span className="font-medium text-slate-900 dark:text-slate-100">{formatNumber(product.stock)}</span>
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Precio de venta: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{getProductSalePriceSummary(product)}</span>
                </p>
                {(product.variants?.length ?? 0) > 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    El precio final se define segun la variante elegida en la venta.
                  </p>
                ) : null}
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
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 lg:col-span-2">
              No encontramos productos disponibles con esa busqueda.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
              <PackageCheck className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Disponibles para vender</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Productos con stock y su valor de venta actual.</p>
            </div>
          </div>

          <div className="space-y-3">
            {availableProducts.slice(0, 12).map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between rounded-[22px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(209,250,229,0.7)_100%)] p-4 shadow-sm dark:border-emerald-900/60 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.38)_0%,rgba(5,150,105,0.16)_100%)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">{product.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{product.brand}</p>
                  <p className="mt-1 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                    {getProductSalePriceSummary(product)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Stock</p>
                  <p className="text-lg font-semibold text-emerald-950 dark:text-emerald-50">{formatNumber(product.stock)}</p>
                </div>
              </div>
            ))}
            {availableProducts.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                No hay productos disponibles para vender en este momento.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)]">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-rose-50 p-3 dark:bg-rose-950/40">
                <CircleAlert className="h-5 w-5 text-rose-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Productos agotados</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Referencias agotadas con su ultimo precio de venta.</p>
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
                className="flex items-center justify-between rounded-[22px] border border-rose-100 bg-[linear-gradient(180deg,rgba(255,241,242,0.96)_0%,rgba(255,228,230,0.72)_100%)] p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{product.name}</p>
                  <p className="text-sm text-slate-500">{product.brand}</p>
                  <p className="mt-1 text-sm font-medium text-rose-800">
                    {getProductSalePriceSummary(product)}
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

      <section className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-rose-50 p-3">
              <CircleAlert className="h-5 w-5 text-rose-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Variantes agotadas</h2>
              <p className="text-sm text-slate-500">
                Combinaciones reales agotadas con su precio actual para reponer con mas precision.
              </p>
            </div>
          </div>
          {outVariants.length > 0 && (
            <a
              href={`https://wa.me/573006775284?text=${outVariantMessage}`}
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
          {outVariants.map(({ product, variant, stock, salePrice }) => (
            <div
              key={variant.id}
              className="flex items-center justify-between rounded-[22px] border border-rose-100 bg-[linear-gradient(180deg,rgba(255,241,242,0.96)_0%,rgba(255,228,230,0.72)_100%)] p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{product.name}</p>
                <p className="text-sm text-slate-500">{variant.displayName ?? variant.name}</p>
                <p className="text-xs text-slate-500">
                  {product.brand} · {product.category}
                </p>
                <p className="mt-1 text-sm font-medium text-rose-800">{formatCurrency(salePrice)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Stock</p>
                <p className="text-lg font-semibold text-rose-950">{formatNumber(stock)}</p>
              </div>
            </div>
          ))}
          {outVariants.length === 0 && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              No hay variantes agotadas. Las combinaciones activas tienen stock disponible.
            </div>
          )}
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
        mode="create"
        hideFinancialSummary={role === 'sales'}
        onSubmit={async (values) => {
          try {
            const createdSales = await registerSale({
              ...values,
              soldAt: new Date(values.soldAt).toISOString(),
              actorRole: role ?? 'admin',
              items: values.items,
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            });
            setOpenSaleDialog(false);
            setSelectedProductId(null);
            if (createdSales[0]) {
              setDetailsSaleId(createdSales[0].id);
            }
            toast({
              title: 'Venta registrada',
              description: 'El producto fue vendido desde el dashboard y el inventario quedo actualizado.',
            });
          } catch (error) {
            toast({
              title: 'No se pudo registrar la venta',
              description: getFriendlyFirestoreWriteErrorMessage(
                error,
                error instanceof Error ? error.message : 'Verifica el stock disponible.'
              ),
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />

      <SaleDetailsDialog
        open={Boolean(detailsSale)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDetailsSaleId(null);
          }
        }}
        sale={detailsSale}
        sales={sales}
        services={services}
        products={products}
        hideFinancialDetails={role === 'sales'}
        initialTab="invoice"
      />
    </div>
  );
}
