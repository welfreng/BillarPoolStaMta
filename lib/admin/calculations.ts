import { format } from 'date-fns';
import type {
  DashboardSummary,
  InventoryMovement,
  Product,
  ProductVariant,
  Purchase,
  Sale,
  ServiceOrder,
  StockAlert,
} from '@/lib/admin/types';
import { getProductSaleMode, getVariantRealUnitCost } from '@/lib/admin/variant-helpers';
import { formatOperationalDate, formatOperationalDateTime } from '@/lib/admin/date-utils';

export function roundCurrency(value: number) {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue)) return 0;
  return Number(normalizedValue.toFixed(2));
}

export function calculateMargin(realUnitCost: number, salePrice: number) {
  const normalizedRealUnitCost = Number(realUnitCost);
  const normalizedSalePrice = Number(salePrice);
  if (!Number.isFinite(normalizedRealUnitCost) || normalizedRealUnitCost <= 0) return 0;
  if (!Number.isFinite(normalizedSalePrice)) return 0;
  return roundCurrency(((normalizedSalePrice - normalizedRealUnitCost) / normalizedRealUnitCost) * 100);
}

export function calculateUnitProfit(realUnitCost: number, salePrice: number) {
  const normalizedRealUnitCost = Number(realUnitCost);
  const normalizedSalePrice = Number(salePrice);
  if (!Number.isFinite(normalizedRealUnitCost) || !Number.isFinite(normalizedSalePrice)) return 0;
  return roundCurrency(normalizedSalePrice - normalizedRealUnitCost);
}

export function calculateRealUnitCost(
  purchaseValueTotal: number,
  shippingValueTotal: number,
  quantityPurchased: number
) {
  const normalizedPurchaseValueTotal = Number(purchaseValueTotal);
  const normalizedShippingValueTotal = Number(shippingValueTotal);
  const normalizedQuantityPurchased = Number(quantityPurchased);

  if (!Number.isFinite(normalizedQuantityPurchased) || normalizedQuantityPurchased <= 0) return 0;

  return roundCurrency(
    (
      (Number.isFinite(normalizedPurchaseValueTotal) ? normalizedPurchaseValueTotal : 0) +
      (Number.isFinite(normalizedShippingValueTotal) ? normalizedShippingValueTotal : 0)
    ) / normalizedQuantityPurchased
  );
}

export function calculatePurchaseTotals(
  purchaseValueTotal: number,
  shippingValueTotal: number,
  quantityPurchased: number
) {
  const normalizedPurchaseValueTotal = Number(purchaseValueTotal);
  const normalizedShippingValueTotal = Number(shippingValueTotal);
  const totalInvestment = roundCurrency(
    (Number.isFinite(normalizedPurchaseValueTotal) ? normalizedPurchaseValueTotal : 0) +
      (Number.isFinite(normalizedShippingValueTotal) ? normalizedShippingValueTotal : 0)
  );
  const realUnitCost = calculateRealUnitCost(
    normalizedPurchaseValueTotal,
    normalizedShippingValueTotal,
    quantityPurchased
  );

  return {
    totalInvestment,
    realUnitCost,
  };
}

export function getProductById(products: Product[], productId: string) {
  return products.find((product) => product.id === productId);
}

export function getProductStock(movements: InventoryMovement[], productId: string) {
  return Math.max(
    movements
      .filter((movement) => movement.productId === productId)
      .reduce((total, movement) => total + movement.quantity, 0),
    0
  );
}

export function getStoredProductStock(product: Product | undefined) {
  if (!product) return 0;
  if (getProductSaleMode(product) === 'varianted') {
    const variants = product.variants ?? [];
    return variants.reduce(
      (total, variant) => total + Math.max(Number(variant.stock ?? variant.publicStock ?? 0), 0),
      0
    );
  }

  return Math.max(Number(product.publicStock ?? 0), 0);
}

export function getLatestPurchaseForProduct(purchases: Purchase[], productId: string) {
  return purchases
    .filter((purchase) => purchase.productId === productId)
    .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())[0];
}

export function getProductRealUnitCost(purchases: Purchase[], productId: string) {
  return getLatestPurchaseForProduct(purchases, productId)?.realUnitCost ?? 0;
}

export function getVariantOrProductRealUnitCost(
  purchases: Purchase[],
  productId: string,
  variantId?: string
) {
  return getVariantRealUnitCost(purchases, productId, variantId);
}

function getActiveOperationalVariants(product: Product): ProductVariant[] {
  const variants = product.variants ?? [];
  const activeVariants = variants.filter((variant) => variant.status !== 'inactive');
  return activeVariants.length > 0 ? activeVariants : variants;
}

export function getOperationalProductStock(product: Product, movements: InventoryMovement[]) {
  void movements;
  return getStoredProductStock(product);
}

export function getOperationalProductSalePrice(product: Product) {
  if (getProductSaleMode(product) !== 'varianted') {
    return Number(product.salePrice ?? 0);
  }

  const prices = getActiveOperationalVariants(product)
    .map((variant) => Number(variant.salePrice ?? 0))
    .filter((price) => price > 0)
    .sort((left, right) => left - right);

  // For varianted products, product.salePrice remains a summary/"desde" fallback.
  return prices[0] ?? Number(product.salePrice ?? 0);
}

export function getOperationalProductRealUnitCost(product: Product, purchases: Purchase[]) {
  if (getProductSaleMode(product) !== 'varianted') {
    return getProductRealUnitCost(purchases, product.id);
  }

  const variants = getActiveOperationalVariants(product);
  const totalStock = variants.reduce((sum, variant) => sum + Math.max(Number(variant.stock ?? 0), 0), 0);
  if (totalStock <= 0) {
    return Math.max(
      ...variants.map((variant) => getVariantRealUnitCost(purchases, product.id, variant.id)),
      0
    );
  }

  const weightedCost = variants.reduce((sum, variant) => {
    const stock = Math.max(Number(variant.stock ?? 0), 0);
    const unitCost = getVariantRealUnitCost(purchases, product.id, variant.id);
    return sum + unitCost * stock;
  }, 0);

  return roundCurrency(weightedCost / totalStock);
}

export function getProductProfitMargin(product: Product, purchases: Purchase[]) {
  return calculateMargin(
    getOperationalProductRealUnitCost(product, purchases),
    getOperationalProductSalePrice(product)
  );
}

export function getStockAlert(
  product: Product,
  movements: InventoryMovement[]
): StockAlert {
  return getOperationalProductStock(product, movements) <= 0 ? 'out' : 'healthy';
}

export function getStockAlertLabel(alert: StockAlert) {
  return alert === 'out' ? 'Agotado' : 'Stock disponible';
}

export function getDashboardSummary(
  products: Product[],
  movements: InventoryMovement[],
  purchases: Purchase[],
  sales: Sale[],
  services: ServiceOrder[] = []
): DashboardSummary {
  const inventorySummary = products.reduce<DashboardSummary>(
    (summary, product) => {
      const stock = getOperationalProductStock(product, movements);
      const realUnitCost = getOperationalProductRealUnitCost(product, purchases);
      const salePrice = getOperationalProductSalePrice(product);

      summary.totalProducts += 1;
      summary.totalStock += stock;
      summary.investedValue += realUnitCost * stock;
      summary.estimatedSalesValue += salePrice * stock;
      summary.projectedProfit += (salePrice - realUnitCost) * stock;

      const alert = getStockAlert(product, movements);
      if (alert === 'out') summary.outOfStockProducts += 1;

      return summary;
    },
    {
      totalProducts: 0,
      totalStock: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
      investedValue: 0,
      estimatedSalesValue: 0,
      projectedProfit: 0,
      salesCount: 0,
      soldUnits: 0,
      totalRevenue: 0,
      realizedProfit: 0,
    }
  );

  const salesSummary = sales.reduce<DashboardSummary>((summary, sale) => {
    const netRevenue = sale.totalSale - (sale.returnedSaleAmount ?? 0);
    const netProfit =
      sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0));
    const netUnits = sale.quantity - (sale.returnedQuantity ?? 0);
    summary.salesCount += 1;
    summary.soldUnits += netUnits;
    summary.totalRevenue += netRevenue;
    summary.realizedProfit += netProfit;
    return summary;
  }, inventorySummary);

  return services
    .filter((service) => (service.status ?? 'delivered') === 'delivered')
    .reduce<DashboardSummary>((summary, service) => {
    summary.salesCount += 1;
    summary.totalRevenue += service.totalRevenue;
    summary.realizedProfit += service.grossProfit;
    return summary;
  }, salesSummary);
}

export function getLatestMovements(movements: InventoryMovement[], limit = 6) {
  return [...movements]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

export function getKardexByProduct(movements: InventoryMovement[], productId: string) {
  return movements
    .filter((movement) => movement.productId === productId)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export function getLatestSales(sales: Sale[], limit = 6) {
  return [...sales]
    .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())
    .slice(0, limit);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('es-CO').format(value);
}

export function formatShortDate(value: string) {
  return formatOperationalDate(value);
}

export function formatDateTime(value: string) {
  return formatOperationalDateTime(value);
}
