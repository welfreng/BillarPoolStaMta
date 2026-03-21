export type ProductStatus = 'active' | 'draft' | 'archived';
export type StockAlert = 'healthy' | 'out';
export type PresentationKind = 'unit' | 'dozen' | 'box-12';
export type UserRole = 'admin' | 'sales';
export type MovementType = 'entry' | 'exit' | 'adjustment' | 'purchase';
export type MovementReason =
  | 'purchase'
  | 'sale'
  | 'return'
  | 'manual-adjustment'
  | 'damage'
  | 'initial-load'
  | 'transfer';

export interface CategoryOption {
  id: string;
  label: string;
  subcategories: string[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  brand: string;
  salePrice: number;
  image: string;
  imageRotation: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  city: string;
  notes: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface AppUserAccount {
  id: string;
  uid: string;
  nombre: string;
  email: string;
  telefono: string;
  role: UserRole;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  purchaseId?: string;
  purchaseBatchId?: string;
  saleId?: string;
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
  purchaseBatchId?: string;
  productId: string;
  supplierId?: string;
  supplier: string;
  source?: 'purchase' | 'initial-load';
  purchasedAt: string;
  presentationQuantity: number;
  purchaseUnitValue: number;
  quantityPurchased: number;
  purchasePresentation: PresentationKind;
  conversionFactor: number;
  purchaseValueTotal: number;
  shippingValueTotal: number;
  totalInvestment: number;
  realUnitCost: number;
  suggestedSalePrice: number;
  estimatedMargin: number;
  notes?: string;
}

export interface Sale {
  id: string;
  productId: string;
  soldAt: string;
  quantity: number;
  unitPrice: number;
  totalSale: number;
  realUnitCost: number;
  totalCost: number;
  grossProfit: number;
  returnedQuantity: number;
  returnedSaleAmount: number;
  returnedCostAmount: number;
  customerName: string;
  notes: string;
  responsibleUser: string;
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
  salesCount: number;
  soldUnits: number;
  totalRevenue: number;
  realizedProfit: number;
}

export interface ProductFilters {
  query: string;
  category: string;
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
