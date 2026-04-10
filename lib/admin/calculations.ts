import { format } from 'date-fns';
import type {
  DashboardSummary,
  InventoryMovement,
  Product,
  Purchase,
  Sale,
  ServiceOrder,
  StockAlert,
} from '@/lib/admin/types';
import { getProductSaleMode, getVariantRealUnitCost } from '@/lib/admin/variant-helpers';

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

export function getProductProfitMargin(product: Product, purchases: Purchase[]) {
  return calculateMargin(getProductRealUnitCost(purchases, product.id), product.salePrice);
}

export function getStockAlert(
  product: Product,
  movements: InventoryMovement[]
): StockAlert {
  return getProductStock(movements, product.id) <= 0 ? 'out' : 'healthy';
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
      const stock = getProductStock(movements, product.id);
      const realUnitCost =
        getProductSaleMode(product) === 'varianted'
          ? Math.max(
              ...(product.variants ?? []).map((variant) =>
                getVariantRealUnitCost(purchases, product.id, variant.id)
              ),
              0
            )
          : getProductRealUnitCost(purchases, product.id);

      summary.totalProducts += 1;
      summary.totalStock += stock;
      summary.investedValue += realUnitCost * stock;
      summary.estimatedSalesValue += product.salePrice * stock;
      summary.projectedProfit += (product.salePrice - realUnitCost) * stock;

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

  return services.reduce<DashboardSummary>((summary, service) => {
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
  return format(new Date(value), 'dd/MM/yyyy');
}

export function formatDateTime(value: string) {
  return format(new Date(value), 'dd/MM/yyyy HH:mm');
}
