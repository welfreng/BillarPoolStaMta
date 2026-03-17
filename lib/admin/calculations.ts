import { format } from 'date-fns';
import type {
  DashboardSummary,
  InventoryMovement,
  Product,
  Purchase,
  StockAlert,
} from '@/lib/admin/types';

export function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export function calculateMargin(realUnitCost: number, salePrice: number) {
  if (realUnitCost <= 0) return 0;
  return roundCurrency(((salePrice - realUnitCost) / realUnitCost) * 100);
}

export function calculateRealUnitCost(
  purchaseValueTotal: number,
  shippingValueTotal: number,
  quantityPurchased: number
) {
  if (quantityPurchased <= 0) return 0;
  return roundCurrency((purchaseValueTotal + shippingValueTotal) / quantityPurchased);
}

export function calculatePurchaseTotals(
  purchaseValueTotal: number,
  shippingValueTotal: number,
  quantityPurchased: number
) {
  const totalInvestment = roundCurrency(purchaseValueTotal + shippingValueTotal);
  const realUnitCost = calculateRealUnitCost(
    purchaseValueTotal,
    shippingValueTotal,
    quantityPurchased
  );

  return {
    totalInvestment,
    realUnitCost,
  };
}

export function getStockAlert(product: Product): StockAlert {
  if (product.stockQuantity <= 0) return 'out';
  if (product.stockQuantity <= product.stockMinimum) return 'low';
  return 'healthy';
}

export function getStockAlertLabel(alert: StockAlert) {
  if (alert === 'out') return 'Agotado';
  if (alert === 'low') return 'Stock bajo';
  return 'Stock suficiente';
}

export function getDashboardSummary(products: Product[]): DashboardSummary {
  return products.reduce<DashboardSummary>(
    (summary, product) => {
      summary.totalProducts += 1;
      summary.totalStock += product.stockQuantity;
      summary.investedValue += product.realUnitCost * product.stockQuantity;
      summary.estimatedSalesValue += product.salePrice * product.stockQuantity;
      summary.projectedProfit +=
        (product.salePrice - product.realUnitCost) * product.stockQuantity;

      const alert = getStockAlert(product);
      if (alert === 'low') summary.lowStockProducts += 1;
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
    }
  );
}

export function getProductById(products: Product[], productId: string) {
  return products.find((product) => product.id === productId);
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

export function calculatePurchaseImpact(
  currentProduct: Product,
  purchase: Pick<
    Purchase,
    'quantityPurchased' | 'realUnitCost' | 'shippingValueTotal' | 'purchaseValueTotal'
  >
) {
  const newStock = currentProduct.stockQuantity + purchase.quantityPurchased;
  const purchasePrice = roundCurrency(purchase.purchaseValueTotal / purchase.quantityPurchased);
  const shippingCostAllocated = roundCurrency(
    purchase.shippingValueTotal / purchase.quantityPurchased
  );

  return {
    stockQuantity: newStock,
    purchasePrice,
    shippingCostAllocated,
    realUnitCost: purchase.realUnitCost,
    profitMargin: calculateMargin(purchase.realUnitCost, currentProduct.salePrice),
  };
}
