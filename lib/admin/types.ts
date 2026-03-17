export type ProductStatus = 'active' | 'draft' | 'archived';
export type SaleType = 'unit' | 'bundle' | 'mixed';
export type StockAlert = 'healthy' | 'low' | 'out';
export type PresentationKind = 'unit' | 'dozen' | 'box-12';
export type MovementType = 'entry' | 'exit' | 'adjustment' | 'purchase';
export type MovementReason =
  | 'purchase'
  | 'sale'
  | 'manual-adjustment'
  | 'damage'
  | 'initial-load'
  | 'transfer';

export interface CategoryOption {
  id: string;
  label: string;
  subcategories: string[];
}

export interface ProductPresentation {
  id: string;
  label: string;
  kind: PresentationKind;
  units: number;
  isDefault?: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  brand: string;
  saleType: SaleType;
  unitMeasure: string;
  stockQuantity: number;
  stockMinimum: number;
  purchasePrice: number;
  shippingCostAllocated: number;
  realUnitCost: number;
  salePrice: number;
  profitMargin: number;
  warehouseLocation: string;
  image: string;
  status: ProductStatus;
  purchasePresentation: PresentationKind;
  salePresentation: PresentationKind;
  conversionFactor: number;
  presentations: ProductPresentation[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  type: MovementType;
  reason: MovementReason;
  quantity: number;
  notes: string;
  occurredAt: string;
  responsibleUser: string;
  relatedUnitCost: number;
}

export interface Purchase {
  id: string;
  productId: string;
  supplier: string;
  purchasedAt: string;
  presentationQuantity: number;
  quantityPurchased: number;
  purchasePresentation: PresentationKind;
  conversionFactor: number;
  purchaseValueTotal: number;
  shippingValueTotal: number;
  totalInvestment: number;
  realUnitCost: number;
  suggestedSalePrice: number;
  estimatedMargin: number;
}

export interface DashboardMetric {
  label: string;
  value: string;
  helper: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
}

export interface DashboardSummary {
  totalProducts: number;
  totalStock: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  investedValue: number;
  estimatedSalesValue: number;
  projectedProfit: number;
}

export interface ProductFilters {
  query: string;
  category: string;
  saleType: string;
  status: string;
}

export interface MovementFilters {
  query: string;
  type: string;
  productId: string;
}

export interface PurchaseFilters {
  query: string;
  supplier: string;
}
