export type ProductStatus = 'active' | 'draft' | 'archived';
export type StockAlert = 'healthy' | 'out';
export type PresentationKind = 'unit' | 'dozen' | 'box-12';
export type UserRole = 'admin' | 'sales';
export type MovementType = 'entry' | 'exit' | 'adjustment' | 'purchase';
export type ProductSaleMode = 'simple' | 'varianted';
export type VariantStatus = 'active' | 'inactive';
export type MovementReason =
  | 'purchase'
  | 'sale'
  | 'service'
  | 'gift'
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

export type ProductCategoryStatus = 'active' | 'inactive';

export interface ProductSubcategory {
  id: string;
  label: string;
  status: ProductCategoryStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategoryRecord {
  id: string;
  label: string;
  status: ProductCategoryStatus;
  sortOrder: number;
  subcategories: ProductSubcategory[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariantAttributeDefinition {
  id: string;
  key: string;
  label: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  brand: string;
  salePrice: number;
  saleMode?: ProductSaleMode;
  variantLabel?: string;
  variantAttributes?: ProductVariantAttributeDefinition[];
  variants?: ProductVariant[];
  featured: boolean;
  publicStock: number;
  image: string;
  imageRotation: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId?: string;
  name: string;
  displayName?: string;
  sku?: string;
  salePrice?: number;
  latestUnitCost?: number;
  stock: number;
  publicStock?: number;
  status?: VariantStatus;
  sortOrder?: number;
  attributes?: Record<string, string>;
  attributeValues?: string[];
  colorHex?: string;
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
  variantId?: string;
  variantName?: string;
  purchaseId?: string;
  purchaseBatchId?: string;
  saleId?: string;
  serviceOrderId?: string;
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
  purchaseId?: string;
  purchaseBatchId?: string;
  productId: string;
  variantId?: string;
  variantName?: string;
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

export interface PurchaseOrder {
  id: string;
  supplierId?: string;
  supplier: string;
  purchasedAt: string;
  shippingValueTotal: number;
  notes?: string;
  source?: 'purchase' | 'initial-load';
}

export interface SaleGiftItem {
  productId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  kind?: 'gift' | 'auto-material';
}

export interface SaleLineItem {
  productId: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  realUnitCost: number;
  totalSale: number;
  totalCost: number;
}

export interface SaleServiceItem {
  serviceType: ServiceType;
  serviceCategory: string;
  price: number;
  cost: number;
  cueReference: string;
  notes: string;
}

export interface Sale {
  id: string;
  saleBatchId?: string;
  productId: string;
  soldAt: string;
  quantity: number;
  unitPrice: number;
  totalSale: number;
  realUnitCost: number;
  totalCost: number;
  grossProfit: number;
  lineItems: SaleLineItem[];
  giftItems: SaleGiftItem[];
  giftedProductId?: string;
  giftedQuantity: number;
  giftedUnitCost: number;
  giftedTotalCost: number;
  returnedQuantity: number;
  returnedSaleAmount: number;
  returnedCostAmount: number;
  customerName: string;
  customerPhone: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes: string;
  responsibleUser: string;
}

export type AuthorizationRequestType = 'sale-edit' | 'sale-return';
export type AuthorizationRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface AuthorizationRequest {
  id: string;
  saleId: string;
  saleBatchId: string;
  requestType: AuthorizationRequestType;
  status: AuthorizationRequestStatus;
  customerName: string;
  saleSummary: string;
  reason: string;
  requestedBy: string;
  requestedByRole: UserRole;
  reviewedBy: string;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  completedAt?: string;
}

export type ServiceType =
  | 'tip-installation'
  | 'tip-ferrule-installation'
  | 'extension-installation';

export type ServiceVisitStatus =
  | 'scheduled'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface ServiceVisit {
  id: string;
  status: ServiceVisitStatus;
  customerName: string;
  customerPhone?: string;
  cueReference: string;
  scheduledAt: string;
  address?: string;
  zone?: string;
  logisticsNotes: string;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  assignedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledReason?: string;
  linkedServiceOrderId?: string;
}

export interface ServiceMaterialItem {
  productId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ServiceOrder {
  id: string;
  serviceType: ServiceType;
  serviceCategory?: string;
  source?: 'standalone' | 'sale-addon';
  saleId?: string;
  saleBatchId?: string;
  performedAt: string;
  customerName: string;
  cueReference: string;
  paymentMethod?: string;
  paymentReference?: string;
  servicePrice: number;
  totalRevenue: number;
  totalMaterialCost: number;
  totalOperationalCost?: number;
  totalCost?: number;
  grossProfit: number;
  materials: ServiceMaterialItem[];
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
