'use client';

import Link from 'next/link';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Activity,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Package,
  PackageCheck,
  ReceiptText,
  Search,
  SendHorizonal,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/components/auth-context';
import { SaleDetailsDialog } from '@/components/admin/sales/sale-details-dialog';
import { SaleFormDialog, type SaleFormValues } from '@/components/admin/sales/sale-form-dialog';
import { useAdminData } from '@/components/admin/admin-data-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  getOperationalProductStock,
  getProductById,
  getProductStock,
  getStockAlert,
} from '@/lib/admin/calculations';
import { getDateKeyInBogota, getTodayDateInputValue, toOperationalDateISOString } from '@/lib/admin/date-utils';
import { getFriendlyFirestoreWriteErrorMessage } from '@/lib/firestore-write-retry';
import type { InventoryMovement, Product, ServiceOrder } from '@/lib/admin/types';
import { cn } from '@/lib/utils';

const DASHBOARD_TIMEZONE = 'America/Bogota';
const LOW_STOCK_THRESHOLD = 3;
type DashboardPeriod = 'today' | 'week' | 'month';
const MONTH_OPTIONS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function getProductSalePriceSummary(product: Product) {
  const prices = (product.variants ?? [])
    .map((variant) => Number(variant.salePrice ?? 0))
    .filter((price) => price > 0);

  if (prices.length === 0) return formatCurrency(product.salePrice);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return minPrice === maxPrice ? formatCurrency(minPrice) : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
}

function getVariantAvailabilitySummary(product: Product) {
  const variants = product.variants ?? [];
  if (variants.length === 0) return null;

  const inStockCount = variants.filter((variant) => Number(variant.stock ?? 0) > 0).length;
  const outOfStockCount = variants.length - inStockCount;

  if (outOfStockCount > 0) {
    return `${inStockCount}/${variants.length} variantes con stock - ${outOfStockCount} agotadas`;
  }

  return `${variants.length} variantes con stock`;
}

function getSellableVariants(product: Product | null | undefined) {
  if (!product) return [];
  return (product.variants ?? []).filter(
    (variant) => variant.status !== 'inactive' && Number(variant.stock ?? 0) > 0
  );
}

function formatLongDateInBogota(value: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: DASHBOARD_TIMEZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(value);
}

function normalizePaymentMethodLabel(value?: string) {
  return value?.trim() || 'Sin metodo';
}

function getBogotaDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? 0);
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? 0);

  return { year, month, day };
}

function getDateKeyFromParts(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDateKey(dateKey: string, deltaDays: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return getDateKeyFromParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function getMonthInputValue(value: Date) {
  const { year, month } = getBogotaDateParts(value);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function getDashboardRange(period: DashboardPeriod, selectedMonth: string, now: Date) {
  const { year, month, day } = getBogotaDateParts(now);
  const todayKey = getDateKeyFromParts(year, month, day);

  if (period === 'today') {
    return {
      startKey: todayKey,
      endKey: todayKey,
      monthValue: selectedMonth,
      label: 'Hoy',
      longLabel: formatLongDateInBogota(now),
      kpiLabel: 'de hoy',
    };
  }

  if (period === 'week') {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    const weekday = currentDate.getUTCDay();
    const diffToMonday = weekday === 0 ? 6 : weekday - 1;
    const startKey = shiftDateKey(todayKey, -diffToMonday);

    return {
      startKey,
      endKey: todayKey,
      monthValue: selectedMonth,
      label: 'Semana',
      longLabel: `${startKey} al ${todayKey}`,
      kpiLabel: 'de la semana',
    };
  }

  const normalizedMonth = /^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : getMonthInputValue(now);
  const [selectedYear, selectedMonthNumber] = normalizedMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(selectedYear, selectedMonthNumber, 0)).getUTCDate();

  return {
    startKey: `${normalizedMonth}-01`,
    endKey: `${normalizedMonth}-${String(lastDay).padStart(2, '0')}`,
    monthValue: normalizedMonth,
    label: 'Mes',
    longLabel: normalizedMonth,
    kpiLabel: 'del mes',
  };
}

function isDateKeyWithinRange(dateKey: string, startKey: string, endKey: string) {
  return Boolean(dateKey) && dateKey >= startKey && dateKey <= endKey;
}

function formatMonthLabel(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) return monthValue;

  return new Intl.DateTimeFormat('es-CO', {
    timeZone: DASHBOARD_TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function getServiceLabel(service: ServiceOrder) {
  if (service.serviceLabel?.trim()) return service.serviceLabel.trim();

  switch (service.serviceType) {
    case 'tip-installation':
      return 'Instalacion de suela';
    case 'ferrule-installation':
      return 'Instalacion de virola';
    case 'tip-ferrule-installation':
      return 'Suela y ferrule';
    case 'extension-installation':
      return 'Instalacion de extension';
    case 'shaft-reduction':
      return 'Rebajada de flecha';
    case 'shaft-straightening':
      return 'Enderezada de flecha';
    case 'custom-turning':
      return 'Trabajo personalizado de torno';
    default:
      return 'Servicio';
  }
}

function getMovementLabel(movement: InventoryMovement) {
  switch (movement.reason) {
    case 'manual-adjustment':
      return 'Ajuste manual';
    case 'damage':
      return 'Ajuste por dano';
    case 'transfer':
      return 'Transferencia';
    case 'return':
      return 'Devolucion';
    case 'initial-load':
      return 'Carga inicial';
    case 'purchase':
      return 'Compra';
    case 'sale':
      return 'Venta';
    case 'service':
      return 'Servicio';
    case 'gift':
      return 'Obsequio';
    default:
      return 'Movimiento';
  }
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-[28px] border border-border bg-card/88 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-card/88 dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6',
        className
      )}
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="w-full sm:w-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = 'default',
}: {
  title: string;
  value: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClasses =
    tone === 'success'
      ? 'border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20'
      : tone === 'warning'
        ? 'border-amber-200/80 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20'
        : tone === 'danger'
          ? 'border-rose-200/80 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/20'
          : 'border-border bg-background/88 dark:border-slate-800 dark:bg-background/60';

  return (
    <div className={cn('rounded-[24px] border p-4 shadow-sm', toneClasses)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl">{value}</p>
        </div>
        <div className="rounded-2xl border border-border bg-background/88 p-2.5 dark:border-slate-700 dark:bg-background/72">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground sm:text-sm">{helper}</p>
    </div>
  );
}

function QuickActionLink({
  href,
  onClick,
  icon: Icon,
  title,
  className,
}: {
  href?: string;
  onClick?: () => void;
  icon: ComponentType<{ className?: string }>;
  title: string;
  className?: string;
}) {
  const content = (
    <>
      <span className="rounded-xl border border-border bg-muted/60 p-2 dark:border-slate-700">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );

  if (href) {
    return (
      <Button
        asChild
        variant="outline"
        className={cn(
          'h-auto min-h-[62px] w-full justify-start gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-left',
          className
        )}
      >
        <Link href={href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'h-auto min-h-[62px] w-full justify-start gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-left',
        className
      )}
      onClick={onClick}
    >
      {content}
    </Button>
  );
}

export default function DashboardPage() {
  const { products, movements, purchases, sales, services, registerSale, authorizationRequests } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const isSalesUser = role === 'sales';
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthInputValue(new Date()));
  const [monthCalendarOpen, setMonthCalendarOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [openSaleDialog, setOpenSaleDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null);

  const effectivePeriod = isSalesUser ? 'today' : period;
  const dashboardRange = useMemo(
    () => getDashboardRange(effectivePeriod, selectedMonth, new Date()),
    [effectivePeriod, selectedMonth]
  );
  const periodLabel = effectivePeriod === 'month' ? formatMonthLabel(dashboardRange.monthValue) : dashboardRange.label;
  const selectedMonthParts = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return {
      year: year || new Date().getFullYear(),
      month: month || 1,
    };
  }, [selectedMonth]);

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

  const lowStockProducts = useMemo(() => {
    return products
      .filter((product) => product.status === 'active')
      .map((product) => ({
        product,
        stock: getOperationalProductStock(product, movements),
      }))
      .filter((item) => item.stock > 0 && item.stock <= LOW_STOCK_THRESHOLD)
      .sort((left, right) => left.stock - right.stock || left.product.name.localeCompare(right.product.name));
  }, [movements, products]);

  const quickResults = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase();
    if (!normalizedQuery) return availableProducts.slice(0, 5);

    return availableProducts
      .filter((product) =>
        `${product.name} ${product.brand} ${product.category} ${product.subcategory}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 5);
  }, [availableProducts, productQuery]);

  const filteredSales = useMemo(
    () =>
      sales.filter((sale) =>
        isDateKeyWithinRange(getDateKeyInBogota(sale.soldAt), dashboardRange.startKey, dashboardRange.endKey)
      ),
    [dashboardRange.endKey, dashboardRange.startKey, sales]
  );

  const filteredServices = useMemo(
    () =>
      services.filter((service) =>
        isDateKeyWithinRange(getDateKeyInBogota(service.performedAt), dashboardRange.startKey, dashboardRange.endKey)
      ),
    [dashboardRange.endKey, dashboardRange.startKey, services]
  );

  const filteredPurchases = useMemo(
    () =>
      purchases.filter((purchase) =>
        isDateKeyWithinRange(getDateKeyInBogota(purchase.purchasedAt), dashboardRange.startKey, dashboardRange.endKey)
      ),
    [dashboardRange.endKey, dashboardRange.startKey, purchases]
  );

  const periodRevenue = useMemo(() => {
    const salesRevenue = filteredSales.reduce(
      (sum, sale) => sum + Math.max(Number(sale.totalSale ?? 0) - Number(sale.returnedSaleAmount ?? 0), 0),
      0
    );
    const servicesRevenue = filteredServices.reduce((sum, service) => sum + Number(service.totalRevenue ?? 0), 0);
    return salesRevenue + servicesRevenue;
  }, [filteredSales, filteredServices]);

  const periodProfit = useMemo(() => {
    const salesProfit = filteredSales.reduce((sum, sale) => {
      const baseProfit = Number(sale.grossProfit ?? 0);
      const returnedRevenue = Number(sale.returnedSaleAmount ?? 0);
      const returnedCost = Number(sale.returnedCostAmount ?? 0);
      return sum + (baseProfit - (returnedRevenue - returnedCost));
    }, 0);
    const servicesProfit = filteredServices.reduce((sum, service) => sum + Number(service.grossProfit ?? 0), 0);
    return salesProfit + servicesProfit;
  }, [filteredSales, filteredServices]);

  const periodUnitsSold = useMemo(
    () =>
      filteredSales.reduce(
        (sum, sale) => sum + Math.max(Number(sale.quantity ?? 0) - Number(sale.returnedQuantity ?? 0), 0),
        0
      ),
    [filteredSales]
  );

  const periodTransactions = filteredSales.length + filteredServices.length;

  const productPerformance = useMemo(() => {
    const totals = new Map<
      string,
      {
        product: Product | undefined;
        quantity: number;
        revenue: number;
      }
    >();

    filteredSales.forEach((sale) => {
      const quantity = Math.max(Number(sale.quantity ?? 0) - Number(sale.returnedQuantity ?? 0), 0);
      if (quantity <= 0) return;

      const existing = totals.get(sale.productId);
      const revenue = Math.max(Number(sale.totalSale ?? 0) - Number(sale.returnedSaleAmount ?? 0), 0);
      if (existing) {
        existing.quantity += quantity;
        existing.revenue += revenue;
        return;
      }

      totals.set(sale.productId, {
        product: getProductById(products, sale.productId),
        quantity,
        revenue,
      });
    });

    const sorted = Array.from(totals.values()).sort(
      (left, right) => right.quantity - left.quantity || right.revenue - left.revenue
    );

    return {
      top: sorted[0] ?? null,
      bottom: [...sorted].reverse()[0] ?? null,
    };
  }, [filteredSales, products]);

  const topService = useMemo(() => {
    const totals = new Map<
      string,
      {
        label: string;
        count: number;
        revenue: number;
      }
    >();

    filteredServices.forEach((service) => {
      const label = getServiceLabel(service);
      const existing = totals.get(label);
      if (existing) {
        existing.count += 1;
        existing.revenue += Number(service.totalRevenue ?? 0);
        return;
      }

      totals.set(label, {
        label,
        count: 1,
        revenue: Number(service.totalRevenue ?? 0),
      });
    });

    return Array.from(totals.values()).sort(
      (left, right) => right.count - left.count || right.revenue - left.revenue
    )[0] ?? null;
  }, [filteredServices]);

  const activityItems = useMemo(() => {
    const recentSales = [...filteredSales]
      .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())
      .slice(0, 4)
      .map((sale) => ({
        id: `sale-${sale.id}`,
        occurredAt: sale.soldAt,
        icon: ShoppingCart,
        title: `Venta - ${getProductById(products, sale.productId)?.name ?? 'Producto'}`,
        subtitle: `${sale.customerName || sale.responsibleUser} - ${normalizePaymentMethodLabel(sale.paymentMethod)}`,
        value: formatCurrency(Math.max(Number(sale.totalSale ?? 0) - Number(sale.returnedSaleAmount ?? 0), 0)),
        tone: 'text-emerald-700 dark:text-emerald-300',
      }));

    const recentPurchases = [...filteredPurchases]
      .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
      .slice(0, 4)
      .map((purchase) => ({
        id: `purchase-${purchase.id}`,
        occurredAt: purchase.purchasedAt,
        icon: Boxes,
        title: `Compra - ${purchase.supplier}`,
        subtitle: `${getProductById(products, purchase.productId)?.name ?? 'Producto'} - ${formatNumber(purchase.quantityPurchased)} uds`,
        value: formatCurrency(Number(purchase.totalInvestment ?? 0)),
        tone: 'text-cyan-700 dark:text-cyan-300',
      }));

    const recentServices = [...filteredServices]
      .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime())
      .slice(0, 4)
      .map((service) => ({
        id: `service-${service.id}`,
        occurredAt: service.performedAt,
        icon: Wrench,
        title: `Servicio - ${getServiceLabel(service)}`,
        subtitle: `${service.customerName} - ${normalizePaymentMethodLabel(service.paymentMethod)}`,
        value: formatCurrency(Number(service.totalRevenue ?? 0)),
        tone: 'text-violet-700 dark:text-violet-300',
      }));

    const importantMovements = [...movements]
      .filter((movement) =>
        ['manual-adjustment', 'damage', 'transfer', 'return', 'initial-load'].includes(movement.reason) &&
        isDateKeyWithinRange(getDateKeyInBogota(movement.occurredAt), dashboardRange.startKey, dashboardRange.endKey)
      )
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 4)
      .map((movement) => ({
        id: `movement-${movement.id}`,
        occurredAt: movement.occurredAt,
        icon: Activity,
        title: `${getMovementLabel(movement)} - ${getProductById(products, movement.productId)?.name ?? 'Producto'}`,
        subtitle: movement.notes || movement.responsibleUser,
        value: `${movement.quantity > 0 ? '+' : ''}${formatNumber(movement.quantity)} uds`,
        tone: 'text-amber-700 dark:text-amber-300',
      }));

    return [...recentSales, ...recentPurchases, ...recentServices, ...importantMovements]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 8);
  }, [dashboardRange.endKey, dashboardRange.startKey, filteredPurchases, filteredSales, filteredServices, movements, products]);

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
        soldAt: getTodayDateInputValue(),
        items: [
          {
            productId: selectedProduct.id,
            variantId: suggestedSelectedVariant?.id ?? '',
            quantity: 1,
            unitPrice: suggestedSelectedVariant
              ? Number(suggestedSelectedVariant.salePrice ?? selectedProduct.salePrice)
              : selectedProductHasVariants
                ? 0
                : selectedProduct.salePrice,
            serviceItems: [],
            giftItems: [],
          },
        ],
        customerPhone: '',
        customerDocument: '',
        customerName: '',
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
  const quickActions = [
    {
      icon: ShoppingCart,
      title: 'Nueva venta',
      onClick: () => {
        setSelectedProductId(null);
        setOpenSaleDialog(true);
      },
    },
    ...(role === 'admin' || role === 'superadmin' || role === 'sales'
      ? [{ href: '/dashboard/servicios', icon: Wrench, title: 'Registrar servicio' }]
      : []),
    ...(!isSalesUser ? [{ href: '/dashboard/compras', icon: Boxes, title: 'Nueva compra' }] : []),
    ...(!isSalesUser ? [{ href: '/dashboard/inventario', icon: Package, title: 'Inventario' }] : []),
    ...(role === 'admin' || role === 'superadmin'
      ? [{ href: '/dashboard/autorizaciones', icon: ShieldCheck, title: 'Autorizaciones' }]
      : []),
    ...(!isSalesUser ? [{ href: '/dashboard/reportes', icon: ArrowUpRight, title: 'Reportes' }] : []),
  ];

  const executiveKpis = isSalesUser
    ? [
        {
          title: 'Ventas de hoy',
          value: formatNumber(periodUnitsSold),
          helper: 'Unidades netas vendidas hoy.',
          icon: ShoppingCart,
          tone: 'default' as const,
        },
        {
          title: 'Transacciones de hoy',
          value: formatNumber(periodTransactions),
          helper: 'Ventas y servicios registrados hoy.',
          icon: ReceiptText,
          tone: 'success' as const,
        },
      ]
    : [
        {
          title: `Ventas ${dashboardRange.kpiLabel}`,
          value: formatNumber(periodUnitsSold),
          helper: 'Unidades netas vendidas en el periodo.',
          icon: ShoppingCart,
          tone: 'default' as const,
        },
        {
          title: `Ingresos ${dashboardRange.kpiLabel}`,
          value: formatCurrency(periodRevenue),
          helper: 'Ventas y servicios consolidados del periodo.',
          icon: ArrowUpRight,
          tone: 'success' as const,
        },
        {
          title: `Utilidad ${dashboardRange.kpiLabel}`,
          value: formatCurrency(periodProfit),
          helper: 'Margen bruto estimado con datos actuales.',
          icon: TrendingUp,
          tone: periodProfit >= 0 ? ('warning' as const) : ('danger' as const),
        },
        {
          title: `Transacciones ${dashboardRange.kpiLabel}`,
          value: formatNumber(periodTransactions),
          helper: 'Ventas y servicios registrados en el rango.',
          icon: ReceiptText,
          tone: 'default' as const,
        },
      ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.24),transparent_24%),linear-gradient(140deg,#08162f_0%,#0a2472_48%,#0b1d3f_100%)] p-5 text-white shadow-[0_30px_80px_rgba(8,22,47,0.34)] sm:p-6 lg:p-7">
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="min-w-0">
            <p className="text-sm font-medium text-cyan-300">Dashboard ejecutivo</p>
            <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
              {isSalesUser ? 'Tablero operativo para vender rapido y detectar faltantes.' : 'Tablero compacto para ventas, rendimiento e inventario critico.'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              {isSalesUser
                ? 'Consulta ventas de hoy, revisa disponibilidad para vender y actua rapido con las tareas operativas.'
                : 'Consulta el periodo clave, revisa lo que mejor rota, detecta faltantes y entra rapido a las acciones del negocio.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-slate-100">
                <Clock3 className="h-4 w-4 text-cyan-300" />
                {effectivePeriod === 'today' ? dashboardRange.longLabel : periodLabel}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-slate-100">
                <PackageCheck className="h-4 w-4 text-emerald-300" />
                {formatNumber(availableProducts.length)} referencias con stock
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-slate-100">
                <CircleAlert className="h-4 w-4 text-amber-300" />
                {formatNumber(outProducts.length + outVariants.length)} alertas clave
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-100">{isSalesUser ? 'Resumen operativo' : 'Periodo visible'}</p>
                <p className="text-xs text-slate-300">
                  {isSalesUser
                    ? 'Vista enfocada en ventas del dia, disponibilidad y faltantes.'
                    : 'Este filtro actualiza KPIs, rendimiento y actividad reciente.'}
                </p>
              </div>
              {!isSalesUser && period === 'month' ? (
                <Popover open={monthCalendarOpen} onOpenChange={setMonthCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between rounded-2xl border-white/15 bg-black/10 text-white hover:bg-white/10 hover:text-white sm:w-[220px]"
                    >
                      <span className="truncate capitalize">{formatMonthLabel(selectedMonth)}</span>
                      <CalendarDays className="ml-2 h-4 w-4 shrink-0 text-cyan-300" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card/95 p-3 text-foreground shadow-xl dark:border-slate-800 dark:bg-slate-950"
                    align="end"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-3 dark:border-slate-800">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-xl"
                        onClick={() =>
                          setSelectedMonth(`${selectedMonthParts.year - 1}-${String(selectedMonthParts.month).padStart(2, '0')}`)
                        }
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Año anterior</span>
                      </Button>
                      <p className="text-sm font-semibold text-foreground">{selectedMonthParts.year}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-xl"
                        onClick={() =>
                          setSelectedMonth(`${selectedMonthParts.year + 1}-${String(selectedMonthParts.month).padStart(2, '0')}`)
                        }
                      >
                        <ChevronRight className="h-4 w-4" />
                        <span className="sr-only">Año siguiente</span>
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {MONTH_OPTIONS.map((monthLabel, index) => {
                        const monthNumber = index + 1;
                        const monthValue = `${selectedMonthParts.year}-${String(monthNumber).padStart(2, '0')}`;
                        const isActive = selectedMonth === monthValue;

                        return (
                          <Button
                            key={monthLabel}
                            type="button"
                            variant={isActive ? 'default' : 'outline'}
                            className={cn('h-10 rounded-xl px-2 text-xs capitalize', isActive ? '' : 'bg-background/80')}
                            onClick={() => {
                              setSelectedMonth(monthValue);
                              setMonthCalendarOpen(false);
                            }}
                          >
                            {monthLabel}
                          </Button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
            {!isSalesUser ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {([
                  { value: 'today', label: 'Hoy' },
                  { value: 'week', label: 'Semana' },
                  { value: 'month', label: 'Mes' },
                ] as Array<{ value: DashboardPeriod; label: string }>).map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    variant={period === item.value ? 'secondary' : 'ghost'}
                    className={cn(
                      'rounded-2xl border border-white/10 text-white hover:bg-white/10 hover:text-white',
                      period === item.value ? 'bg-white/16' : 'bg-black/10'
                    )}
                    onClick={() => setPeriod(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-300">{isSalesUser ? 'Agotados' : 'Inventario critico'}</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(outProducts.length + outVariants.length)}</p>
                <p className="mt-1 text-xs text-slate-300">Productos y variantes sin stock.</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-300">{isSalesUser ? 'Disponibles' : 'Autorizaciones'}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatNumber(isSalesUser ? availableProducts.length : pendingAuthorizationRequests.length)}
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  {isSalesUser ? 'Referencias listas para vender.' : 'Solicitudes pendientes por revisar.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={cn('grid gap-4 sm:grid-cols-2', isSalesUser ? 'xl:grid-cols-2' : 'xl:grid-cols-4')}>
        {executiveKpis.map((item) => (
          <KpiCard
            key={item.title}
            title={item.title}
            value={item.value}
            helper={item.helper}
            icon={item.icon}
            tone={item.tone}
          />
        ))}
      </section>

      <section className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Acciones rapidas"
            description="Accesos directos a las tareas mas frecuentes del negocio."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              {quickActions.map((action, index) => {
                const isLastOddItem = quickActions.length % 2 === 1 && index === quickActions.length - 1;

                return (
                  <QuickActionLink
                    key={action.title}
                    href={'href' in action ? action.href : undefined}
                    onClick={'onClick' in action ? action.onClick : undefined}
                    icon={action.icon}
                    title={action.title}
                    className={isLastOddItem ? 'xl:col-span-2' : undefined}
                  />
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title={isSalesUser ? 'Productos disponibles para vender' : 'Venta rapida'}
            description={
              isSalesUser
                ? 'Busca productos disponibles, revisa precio y abre la venta desde aqui.'
                : 'Busca un producto, revisa su precio y abre la venta sin salir del dashboard.'
            }
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                className="rounded-2xl border-border bg-background/88 pl-9 shadow-sm dark:border-slate-700 dark:bg-background/88 dark:text-slate-100"
              />
            </div>

            <div className="mt-4 space-y-2">
              {quickResults.map((product) => (
                <div
                  key={product.id}
                  className="flex flex-col gap-3 rounded-[22px] border border-border bg-background/72 px-4 py-3 dark:border-slate-800 dark:bg-background/48 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium text-foreground">{product.name}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {product.brand} - {product.category}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Stock {formatNumber(product.stock)}</span>
                      <span>{getProductSalePriceSummary(product)}</span>
                    </div>
                    {getVariantAvailabilitySummary(product) ? (
                      <p className="mt-1 line-clamp-1 text-xs text-cyan-700 dark:text-cyan-300">
                        {getVariantAvailabilitySummary(product)}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    className="w-full rounded-xl sm:w-auto"
                    onClick={() => {
                      setSelectedProductId(product.id);
                      setOpenSaleDialog(true);
                    }}
                  >
                    Vender
                  </Button>
                </div>
              ))}
              {quickResults.length === 0 ? (
                <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm text-muted-foreground dark:border-slate-800 dark:bg-muted/60">
                  No encontramos productos disponibles con esa busqueda.
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>

        {!isSalesUser ? (
          <SectionCard
            title="Rendimiento comercial"
            description={`Resumen comercial para ${periodLabel.toLowerCase()}.`}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[24px] border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Producto mas vendido</p>
                    <p className="mt-2 line-clamp-2 text-base font-semibold text-foreground">
                      {productPerformance.top?.product?.name ?? 'Sin ventas aun'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-background/80 p-2.5 dark:bg-background/40">
                    <TrendingUp className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {productPerformance.top ? `${formatNumber(productPerformance.top.quantity)} uds` : 'Sin ventas aun'}
                </p>
                {productPerformance.top ? (
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatCurrency(productPerformance.top.revenue)}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Producto menos vendido</p>
                    <p className="mt-2 line-clamp-2 text-base font-semibold text-foreground">
                      {productPerformance.bottom?.product?.name ?? 'Sin historial'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-background/80 p-2.5 dark:bg-background/40">
                    <Package className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {productPerformance.bottom ? `${formatNumber(productPerformance.bottom.quantity)} uds` : 'Sin historial'}
                </p>
                {productPerformance.bottom ? (
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatCurrency(productPerformance.bottom.revenue)}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-violet-200/80 bg-violet-50/70 p-4 dark:border-violet-900/60 dark:bg-violet-950/20 md:col-span-2 xl:col-span-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-violet-800 dark:text-violet-200">Servicio mas solicitado</p>
                    <p className="mt-2 line-clamp-2 text-base font-semibold text-foreground">
                      {topService?.label ?? 'Sin registros'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-background/80 p-2.5 dark:bg-background/40">
                    <Wrench className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {topService ? `${formatNumber(topService.count)} servicios` : 'Sin registros'}
                </p>
                {topService ? (
                  <p className="mt-1 text-sm font-medium text-foreground">{formatCurrency(topService.revenue)}</p>
                ) : null}
              </div>
            </div>
          </SectionCard>
        ) : null}
      </section>

      <SectionCard
        title="Inventario critico"
        description="Lectura ejecutiva del inventario que requiere accion inmediata."
      >
        <div className={cn('grid gap-4', isSalesUser ? 'lg:grid-cols-2' : 'lg:grid-cols-3')}>
          <div className="rounded-[24px] border border-rose-200/80 bg-rose-50/70 p-4 dark:border-rose-900/60 dark:bg-rose-950/20">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-rose-800 dark:text-rose-200">Productos agotados</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(outProducts.length)}</p>
              </div>
              <CircleAlert className="h-5 w-5 shrink-0 text-rose-700 dark:text-rose-300" />
            </div>
            <div className="mt-4 space-y-2">
              {outProducts.slice(0, 4).map((product) => (
                <div key={product.id} className="rounded-2xl border border-border/60 bg-background/72 px-3 py-2 dark:border-slate-800 dark:bg-background/48">
                  <p className="line-clamp-1 text-sm font-medium text-foreground">{product.name}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {product.brand || 'Sin marca'} - Stock {formatNumber(product.stock)}
                  </p>
                </div>
              ))}
              {outProducts.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-background/72 px-3 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-background/48">
                  No hay productos agotados.
                </div>
              ) : null}
            </div>
            {!isSalesUser ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button asChild size="sm" variant="outline" className="rounded-2xl">
                  <Link href="/dashboard/inventario">Ver todos</Link>
                </Button>
                <a
                  className="inline-flex"
                  href={`https://wa.me/573006775284?text=${outProductsMessage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline" className="w-full rounded-2xl sm:w-auto">
                    <SendHorizonal className="h-4 w-4" />
                    Reporte
                  </Button>
                </a>
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Variantes agotadas</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(outVariants.length)}</p>
              </div>
              <Boxes className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            </div>
            <div className="mt-4 space-y-2">
              {outVariants.slice(0, 4).map(({ product, variant }) => (
                <div key={variant.id} className="rounded-2xl border border-border/60 bg-background/72 px-3 py-2 dark:border-slate-800 dark:bg-background/48">
                  <p className="line-clamp-1 text-sm font-medium text-foreground">{product.name}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{variant.displayName ?? variant.name}</p>
                </div>
              ))}
              {outVariants.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-background/72 px-3 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-background/48">
                  No hay variantes agotadas activas.
                </div>
              ) : null}
            </div>
            {!isSalesUser ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button asChild size="sm" variant="outline" className="rounded-2xl">
                  <Link href="/dashboard/inventario">Ver todos</Link>
                </Button>
                <a
                  className="inline-flex"
                  href={`https://wa.me/573006775284?text=${outVariantMessage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline" className="w-full rounded-2xl sm:w-auto">
                    <SendHorizonal className="h-4 w-4" />
                    Reporte
                  </Button>
                </a>
              </div>
            ) : null}
          </div>

          {!isSalesUser ? (
            <div className="rounded-[24px] border border-cyan-200/80 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-cyan-800 dark:text-cyan-200">Stock bajo</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(lowStockProducts.length)}</p>
                </div>
                <PackageCheck className="h-5 w-5 shrink-0 text-cyan-700 dark:text-cyan-300" />
              </div>
              <div className="mt-4 space-y-2">
                {lowStockProducts.slice(0, 4).map(({ product, stock }) => (
                  <div key={product.id} className="rounded-2xl border border-border/60 bg-background/72 px-3 py-2 dark:border-slate-800 dark:bg-background/48">
                    <p className="line-clamp-1 text-sm font-medium text-foreground">{product.name}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{formatNumber(stock)} uds disponibles</p>
                  </div>
                ))}
                {lowStockProducts.length === 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-background/72 px-3 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-background/48">
                    No hay referencias en rango critico.
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button asChild size="sm" variant="outline" className="rounded-2xl">
                  <Link href="/dashboard/inventario">Ver todos</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="rounded-2xl">
                  <Link href="/dashboard/reportes">Reporte</Link>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      {!isSalesUser ? (
        <SectionCard
          title="Actividad reciente"
          description={`Ultimos eventos relevantes filtrados por ${periodLabel.toLowerCase()}.`}
        >
          <div className="space-y-3">
            {activityItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-[20px] border border-border bg-background/72 px-4 py-3 dark:border-slate-800 dark:bg-background/48 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-2xl bg-muted/60 p-2.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-medium text-foreground">{item.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                    <p className={cn('text-sm font-semibold', item.tone)}>{item.value}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}</p>
                  </div>
                </div>
              );
            })}
            {activityItems.length === 0 ? (
              <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm text-muted-foreground dark:border-slate-800 dark:bg-muted/60">
                No hay actividad suficiente en el periodo seleccionado.
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

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
              soldAt: toOperationalDateISOString(values.soldAt),
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
              description: 'La venta se registro desde el dashboard y el inventario quedo actualizado.',
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
