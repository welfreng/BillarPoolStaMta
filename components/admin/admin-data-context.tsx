'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import {
  calculateMargin,
  calculatePurchaseTotals,
  getDashboardSummary,
  getLatestMovements,
  getProductRealUnitCost,
  getProductStock,
  getVariantOrProductRealUnitCost,
} from '@/lib/admin/calculations';
import { initialMovements, initialProducts, initialPurchases, initialSales, initialServices, initialSuppliers } from '@/lib/admin/mock-data';
import { db } from '@/lib/firebase';
import { SITE_LOGO } from '@/lib/branding';
import { matchesProductCategoryFamily } from '@/lib/admin/category-rules';
import { slugifyCategoryKey } from '@/lib/admin/category-utils';
import {
  buildVariantAttributeValues,
  getProductSaleMode,
  getProductVariantStock,
  normalizeVariantAttributeDefinitions,
  normalizeProductVariants as normalizeProductVariantRecords,
  summarizeProductFromVariants,
} from '@/lib/admin/variant-helpers';
import {
  formatSaleGiftCategoryList,
  getAllowedSaleGiftCategories,
  getSaleGiftCategoryKey,
} from '@/lib/admin/sale-gift-rules';
import { runFirestoreWriteWithBackoff } from '@/lib/firestore-write-retry';
import type { SaleServiceItem } from '@/lib/admin/types';
import type {
  AuthorizationRequest,
  AuthorizationRequestStatus,
  AuthorizationRequestType,
  DashboardSummary,
  InventoryMovement,
  MovementReason,
  MovementType,
  Product,
  ProductCategoryRecord,
  ProductCategoryStatus,
  ProductVariant,
  ProductVariantAttributeDefinition,
  ProductSubcategory,
  Purchase,
  Sale,
  SaleGiftItem,
  SaleLineItem,
  ServiceMaterialItem,
  ServiceOrder,
  ServiceType,
  Supplier,
  UserRole,
} from '@/lib/admin/types';

type ProductMutationInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'publicStock'> & {
  historyVariantName?: string;
};
type NewProductInput = ProductMutationInput;
type NewSupplierInput = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>;
type NewCategoryInput = {
  label: string;
};
type UpdateCategoryInput = {
  label: string;
  status: ProductCategoryStatus;
};
type NewSubcategoryInput = {
  label: string;
};
type UpdateSubcategoryInput = {
  label: string;
  status: ProductCategoryStatus;
};

interface RegisterMovementInput {
  productId: string;
  variantId?: string;
  variantName?: string;
  type: MovementType;
  reason: MovementReason;
  quantity: number;
  notes: string;
  responsibleUser: string;
  relatedUnitCost?: number;
}

interface RegisterPurchaseInput {
  supplierId?: string;
  supplier: string;
  purchasedAt: string;
  shippingValueTotal: number;
  items: Array<{
    productId: string;
    variantId?: string;
    variantName?: string;
    presentationQuantity: number;
    purchaseUnitValue: number;
    suggestedSalePrice: number;
  }>;
}

interface RegisterInitialStockInput {
  productId: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  estimatedUnitCost: number;
  occurredAt: string;
  notes: string;
  responsibleUser: string;
  suggestedSalePrice?: number;
}

interface RegisterSaleInput {
  soldAt: string;
  items: Array<{
    productId: string;
    variantId?: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
    serviceItems?: SaleServiceItem[];
    giftItems?: Array<{
      productId: string;
      quantity: number;
    }>;
  }>;
  customerName: string;
  customerPhone: string;
  notes: string;
  responsibleUser: string;
  actorRole?: UserRole;
}

interface RegisterSaleReturnInput {
  saleId: string;
  returnedAt: string;
  quantity: number;
  notes: string;
  responsibleUser: string;
}

interface RegisterSaleReturnBatchInput {
  returnedAt: string;
  items: Array<{
    saleId: string;
    quantity: number;
  }>;
  notes: string;
  responsibleUser: string;
}

interface RegisterServiceInput {
  serviceType: ServiceType;
  serviceCategory?: string;
  performedAt: string;
  customerName: string;
  cueReference: string;
  servicePrice: number;
  serviceCost?: number;
  materials: Array<{
    productId: string;
    quantity: number;
  }>;
  notes: string;
  responsibleUser: string;
  actorRole?: UserRole;
  source?: 'standalone' | 'sale-addon';
  saleId?: string;
  saleBatchId?: string;
}

interface CreateAuthorizationRequestInput {
  saleId: string;
  saleBatchId: string;
  requestType: AuthorizationRequestType;
  customerName: string;
  saleSummary: string;
  reason: string;
  requestedBy: string;
  requestedByRole: UserRole;
}

interface ReviewAuthorizationRequestInput {
  status: Extract<AuthorizationRequestStatus, 'approved' | 'rejected'>;
  reviewNote: string;
  reviewedBy: string;
}

interface CompleteAuthorizationRequestInput {
  requestId: string;
  completedBy: string;
}

type OperationalResetCollectionKey =
  | 'products'
  | 'product_variants'
  | 'suppliers'
  | 'movements'
  | 'inventory_movements'
  | 'purchases'
  | 'purchase_items'
  | 'sales'
  | 'services'
  | 'authorization-requests'
  | 'admin-notifications';

interface OperationalResetOptions {
  deleteProducts: boolean;
  deleteSuppliers: boolean;
  deleteAuthorizationRequests: boolean;
  deleteAdminNotifications: boolean;
}

interface OperationalResetSummary {
  generatedAt: string;
  counts: Record<OperationalResetCollectionKey, number>;
  collectionsToDelete: Array<{
    key: OperationalResetCollectionKey;
    label: string;
    count: number;
    classification: 'delete' | 'archive' | 'preserve';
  }>;
  collectionsToPreserve: Array<{
    key: string;
    label: string;
    reason: string;
  }>;
  backupRecommendations: string[];
  warnings: string[];
}

interface OperationalResetSnapshot {
  exportedAt: string;
  summary: OperationalResetSummary;
  options: OperationalResetOptions;
  data: Partial<Record<OperationalResetCollectionKey, unknown[]>>;
}

interface OperationalResetResult {
  executedAt: string;
  deletedCounts: Partial<Record<OperationalResetCollectionKey, number>>;
}

interface AdminDataContextValue {
  loading: boolean;
  categories: ProductCategoryRecord[];
  products: Product[];
  suppliers: Supplier[];
  movements: InventoryMovement[];
  purchases: Purchase[];
  sales: Sale[];
  services: ServiceOrder[];
  authorizationRequests: AuthorizationRequest[];
  summary: DashboardSummary;
  latestMovements: InventoryMovement[];
  getOperationalResetSummary: (options?: Partial<OperationalResetOptions>) => OperationalResetSummary;
  exportOperationalResetSnapshot: (
    options?: Partial<OperationalResetOptions>
  ) => Promise<OperationalResetSnapshot>;
  runOperationalReset: (options?: Partial<OperationalResetOptions>) => Promise<OperationalResetResult>;
  syncPublicProductStocks: () => Promise<number>;
  createCategory: (input: NewCategoryInput) => Promise<ProductCategoryRecord>;
  updateCategory: (categoryId: string, input: UpdateCategoryInput) => Promise<ProductCategoryRecord>;
  deleteCategory: (categoryId: string) => Promise<void>;
  createSubcategory: (categoryId: string, input: NewSubcategoryInput) => Promise<ProductCategoryRecord>;
  updateSubcategory: (
    categoryId: string,
    subcategoryId: string,
    input: UpdateSubcategoryInput
  ) => Promise<ProductCategoryRecord>;
  deleteSubcategory: (categoryId: string, subcategoryId: string) => Promise<void>;
  createProduct: (input: ProductMutationInput) => Promise<Product>;
  updateProduct: (productId: string, input: ProductMutationInput) => Promise<Product>;
  deleteProduct: (productId: string) => Promise<void>;
  createSupplier: (input: NewSupplierInput) => Promise<Supplier>;
  updateSupplier: (supplierId: string, input: NewSupplierInput) => Promise<Supplier>;
  deleteSupplier: (supplierId: string) => Promise<void>;
  registerMovement: (input: RegisterMovementInput) => Promise<InventoryMovement>;
  registerInitialStock: (input: RegisterInitialStockInput) => Promise<{
    movement: InventoryMovement;
    purchase: Purchase;
  }>;
  registerPurchase: (input: RegisterPurchaseInput) => Promise<Purchase[]>;
  updatePurchase: (purchaseId: string, input: RegisterPurchaseInput) => Promise<Purchase>;
  updatePurchaseBatch: (batchId: string, input: RegisterPurchaseInput) => Promise<Purchase[]>;
  deletePurchase: (purchaseId: string) => Promise<void>;
  deletePurchaseBatch: (batchId: string) => Promise<void>;
  registerSale: (input: RegisterSaleInput) => Promise<Sale[]>;
  updateSaleBatch: (saleBatchId: string, input: RegisterSaleInput) => Promise<Sale[]>;
  registerSaleReturn: (input: RegisterSaleReturnInput) => Promise<Sale>;
  registerSaleReturns: (input: RegisterSaleReturnBatchInput) => Promise<Sale[]>;
  registerService: (input: RegisterServiceInput) => Promise<ServiceOrder>;
  createAuthorizationRequest: (input: CreateAuthorizationRequestInput) => Promise<AuthorizationRequest>;
  reviewAuthorizationRequest: (
    requestId: string,
    input: ReviewAuthorizationRequestInput
  ) => Promise<AuthorizationRequest>;
  completeAuthorizationRequest: (input: CompleteAuthorizationRequestInput) => Promise<AuthorizationRequest>;
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined);

function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const defaultOperationalResetOptions: OperationalResetOptions = {
  deleteProducts: true,
  deleteSuppliers: false,
  deleteAuthorizationRequests: true,
  deleteAdminNotifications: true,
};

const operationalResetCollectionLabels: Record<OperationalResetCollectionKey, string> = {
  products: 'Productos',
  product_variants: 'Variantes de producto',
  suppliers: 'Proveedores',
  movements: 'Movimientos de inventario',
  inventory_movements: 'Movimientos espejo de inventario',
  purchases: 'Compras',
  purchase_items: 'Items espejo de compras',
  sales: 'Ventas',
  services: 'Servicios',
  'authorization-requests': 'Solicitudes de autorizacion',
  'admin-notifications': 'Notificaciones administrativas',
};

function resolveOperationalResetOptions(
  options?: Partial<OperationalResetOptions>
): OperationalResetOptions {
  return {
    ...defaultOperationalResetOptions,
    ...options,
  };
}

function targetProductName(products: Product[], productId: string) {
  return products.find((product) => product.id === productId)?.name ?? 'producto';
}

function buildSaleGiftItems(
  item: RegisterSaleInput['items'][number],
  targetProduct: Product,
  products: Product[],
  purchases: Purchase[],
  _baseMovements: InventoryMovement[]
) {
  const giftItems: SaleGiftItem[] = [];
  if ((item.giftItems?.length ?? 0) === 0) {
    return giftItems;
  }

  if (!matchesProductCategoryFamily(targetProduct, 'tacos')) {
    throw new Error(`Solo los tacos de billar pueden llevar obsequio. Revisa ${targetProduct.name}.`);
  }

  const allowedGiftCategories = getAllowedSaleGiftCategories(targetProduct);
  if (allowedGiftCategories.length === 0) {
    throw new Error(`Este producto no admite obsequios. Revisa ${targetProduct.name}.`);
  }

  const seenGiftCategories = new Set<string>();

  item.giftItems?.forEach((giftItemInput) => {
    const giftProductId = giftItemInput.productId?.trim();
    const giftQuantity = Math.max(Number(giftItemInput.quantity ?? 0), 0);

    if (!giftProductId) {
      throw new Error(`Selecciona el obsequio para ${targetProduct.name}.`);
    }
    if (giftQuantity <= 0) {
      throw new Error(`La cantidad del obsequio debe ser mayor a cero para ${targetProduct.name}.`);
    }

    const giftedProduct = products.find((product) => product.id === giftProductId);
    if (!giftedProduct) {
      throw new Error('No se encontro uno de los productos obsequiados.');
    }
    const giftCategoryKey = getSaleGiftCategoryKey(giftedProduct);
    if (!giftCategoryKey) {
      throw new Error(
        `Los obsequios para ${targetProduct.name} solo pueden ser un guante, un estuche, una extension o un parachoque.`
      );
    }
    if (!allowedGiftCategories.includes(giftCategoryKey)) {
      throw new Error(
        `Para ${targetProduct.name} solo aplica ${formatSaleGiftCategoryList(allowedGiftCategories)} como obsequio.`
      );
    }
    if (giftQuantity !== 1) {
      throw new Error(`Cada obsequio para ${targetProduct.name} debe tener cantidad 1.`);
    }
    if (seenGiftCategories.has(giftCategoryKey)) {
      throw new Error(`No repitas el mismo tipo de obsequio para ${targetProduct.name}.`);
    }
    seenGiftCategories.add(giftCategoryKey);

    const giftUnitCost = getProductRealUnitCost(purchases, giftProductId);
    giftItems.push({
      productId: giftProductId,
      quantity: giftQuantity,
      unitCost: giftUnitCost,
      totalCost: giftQuantity * giftUnitCost,
      kind: 'gift',
    });
  });

  return giftItems;
}

function normalizeDateValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

function mapProductDocument(documentId: string, data: DocumentData): Product {
  const variantAttributes = Array.isArray(data.variantAttributes)
    ? data.variantAttributes
        .map((attribute, index) => ({
          id: String(attribute?.id ?? `attr-${index + 1}`),
          key: String(attribute?.key ?? attribute?.label ?? `atributo-${index + 1}`),
          label: String(attribute?.label ?? attribute?.key ?? `Atributo ${index + 1}`),
        }))
        .filter((attribute) => attribute.label)
    : [];
  const normalizedVariants = Array.isArray(data.variants)
    ? normalizeProductVariantRecords(
        documentId,
        variantAttributes,
        data.variants.map((variant: DocumentData, index: number) => ({
          id: String(variant?.id ?? `variant-${index + 1}`),
          name: String(variant?.name ?? ''),
          salePrice: Number(variant?.salePrice ?? data.salePrice ?? 0),
          latestUnitCost: Number(variant?.latestUnitCost ?? 0),
          stock: Number(variant?.stock ?? 0),
          publicStock: Number(variant?.publicStock ?? variant?.stock ?? 0),
          status: variant?.status === 'inactive' ? 'inactive' : 'active',
          sortOrder: Number(variant?.sortOrder ?? index),
          attributes:
            variant && typeof variant === 'object' && variant.attributes && typeof variant.attributes === 'object'
              ? Object.fromEntries(
                  Object.entries(variant.attributes).map(([key, value]) => [key, String(value ?? '')])
                )
              : {},
          attributeValues: Array.isArray(variant?.attributeValues)
            ? variant.attributeValues.map((value: unknown) => String(value ?? ''))
            : buildVariantAttributeValues(
                variantAttributes,
                variant && typeof variant === 'object' && variant.attributes && typeof variant.attributes === 'object'
                  ? Object.fromEntries(
                      Object.entries(variant.attributes).map(([key, value]) => [key, String(value ?? '')])
                    )
                  : {}
              ),
          colorHex: typeof variant?.colorHex === 'string' ? String(variant.colorHex) : undefined,
        }))
      )
    : [];
  const product: Product = {
    id: documentId,
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    category: String(data.category ?? ''),
    subcategory: String(data.subcategory ?? ''),
    brand: String(data.brand ?? ''),
    salePrice: Number(data.salePrice ?? 0),
    saleMode: data.saleMode === 'varianted' ? 'varianted' : normalizedVariants.length > 0 ? 'varianted' : 'simple',
    variantLabel: String(data.variantLabel ?? ''),
    variantAttributes,
    variants: normalizedVariants,
    featured: Boolean(data.featured ?? false),
    publicStock: Number(data.publicStock ?? 0),
    image: String(data.image ?? SITE_LOGO),
    imageRotation: Number(data.imageRotation ?? 0),
    status:
      data.status === 'draft' || data.status === 'archived' || data.status === 'active'
        ? data.status
        : 'active',
    createdAt: normalizeDateValue(data.createdAt),
    updatedAt: normalizeDateValue(data.updatedAt),
  };
  return getProductSaleMode(product) === 'varianted'
    ? {
        ...product,
        ...summarizeProductFromVariants(product),
      }
    : product;
}

function getProductVariantById(product: Product, variantId?: string) {
  if (!variantId) return null;
  return product.variants?.find((variant) => variant.id === variantId) ?? null;
}

function buildVariantStockMap(products: Product[]) {
  return new Map(
    products.map((product) => [
      product.id,
      new Map((product.variants ?? []).map((variant) => [variant.id, variant.stock])),
    ])
  );
}

function getPublicStockFromMovements(movements: Array<{ productId: string; quantity: number }>, productId: string) {
  return Math.max(
    movements
      .filter((movement) => movement.productId === productId)
      .reduce((total, movement) => total + movement.quantity, 0),
    0
  );
}

function mapSupplierDocument(documentId: string, data: DocumentData): Supplier {
  return {
    id: documentId,
    name: String(data.name ?? ''),
    contactName: String(data.contactName ?? ''),
    phone: String(data.phone ?? ''),
    city: String(data.city ?? ''),
    notes: String(data.notes ?? ''),
    status: data.status === 'inactive' ? 'inactive' : 'active',
    createdAt: normalizeDateValue(data.createdAt),
    updatedAt: normalizeDateValue(data.updatedAt),
  };
}

function mapMovementDocument(documentId: string, data: DocumentData): InventoryMovement {
  return {
    id: documentId,
    productId: String(data.productId ?? ''),
    variantId: data.variantId ? String(data.variantId) : undefined,
    variantName: data.variantName ? String(data.variantName) : undefined,
    purchaseId: data.purchaseId ? String(data.purchaseId) : undefined,
    purchaseBatchId: data.purchaseBatchId ? String(data.purchaseBatchId) : undefined,
    saleId: data.saleId ? String(data.saleId) : undefined,
    serviceOrderId: data.serviceOrderId ? String(data.serviceOrderId) : undefined,
    type:
      data.type === 'entry' || data.type === 'exit' || data.type === 'adjustment' || data.type === 'purchase'
        ? data.type
        : 'adjustment',
    reason:
      data.reason === 'purchase' ||
      data.reason === 'sale' ||
      data.reason === 'service' ||
      data.reason === 'gift' ||
      data.reason === 'return' ||
      data.reason === 'manual-adjustment' ||
      data.reason === 'damage' ||
      data.reason === 'initial-load' ||
      data.reason === 'transfer'
        ? data.reason
        : 'manual-adjustment',
    quantity: Number(data.quantity ?? 0),
    notes: String(data.notes ?? ''),
    occurredAt: normalizeDateValue(data.occurredAt),
    responsibleUser: String(data.responsibleUser ?? 'Administrador'),
    relatedUnitCost: Number(data.relatedUnitCost ?? 0),
  };
}

function mapPurchaseDocument(documentId: string, data: DocumentData): Purchase {
  return {
    id: documentId,
    purchaseId: data.purchaseId ? String(data.purchaseId) : undefined,
    purchaseBatchId: data.purchaseBatchId ? String(data.purchaseBatchId) : undefined,
    productId: String(data.productId ?? ''),
    variantId: data.variantId ? String(data.variantId) : undefined,
    variantName: data.variantName ? String(data.variantName) : undefined,
    supplierId: data.supplierId ? String(data.supplierId) : undefined,
    supplier: String(data.supplier ?? ''),
    source: data.source === 'initial-load' ? 'initial-load' : 'purchase',
    purchasedAt: normalizeDateValue(data.purchasedAt),
    presentationQuantity: Number(data.presentationQuantity ?? 0),
    purchaseUnitValue: Number(data.purchaseUnitValue ?? 0),
    quantityPurchased: Number(data.quantityPurchased ?? 0),
    purchasePresentation:
      data.purchasePresentation === 'dozen' || data.purchasePresentation === 'box-12'
        ? data.purchasePresentation
        : 'unit',
    conversionFactor: Number(data.conversionFactor ?? 1),
    purchaseValueTotal: Number(data.purchaseValueTotal ?? 0),
    shippingValueTotal: Number(data.shippingValueTotal ?? 0),
    totalInvestment: Number(data.totalInvestment ?? 0),
    realUnitCost: Number(data.realUnitCost ?? 0),
    suggestedSalePrice: Number(data.suggestedSalePrice ?? 0),
    estimatedMargin: Number(data.estimatedMargin ?? 0),
    notes: String(data.notes ?? ''),
  };
}

function mapSaleDocument(documentId: string, data: DocumentData): Sale {
  const legacyLineItems: SaleLineItem[] = data.productId
    ? [
        {
          productId: String(data.productId ?? ''),
          variantId: data.variantId ? String(data.variantId) : undefined,
          variantName: data.variantName ? String(data.variantName) : undefined,
          quantity: Number(data.quantity ?? 0),
          unitPrice: Number(data.unitPrice ?? 0),
          realUnitCost: Number(data.realUnitCost ?? 0),
          totalSale: Number(data.totalSale ?? 0),
          totalCost: Number(data.totalCost ?? 0),
        },
      ]
    : [];
  const lineItems: SaleLineItem[] = Array.isArray(data.lineItems)
    ? data.lineItems
        .map((item) => ({
          productId: String(item?.productId ?? ''),
          variantId: item?.variantId ? String(item.variantId) : undefined,
          variantName: item?.variantName ? String(item.variantName) : undefined,
          quantity: Number(item?.quantity ?? 0),
          unitPrice: Number(item?.unitPrice ?? 0),
          realUnitCost: Number(item?.realUnitCost ?? 0),
          totalSale: Number(item?.totalSale ?? 0),
          totalCost: Number(item?.totalCost ?? 0),
        }))
        .filter((item) => item.productId && item.quantity > 0)
    : legacyLineItems;
  const legacyGiftedProductId = data.giftedProductId ? String(data.giftedProductId) : undefined;
  const legacyGiftedQuantity = Number(data.giftedQuantity ?? 0);
  const legacyGiftedUnitCost = Number(data.giftedUnitCost ?? 0);
  const legacyGiftedTotalCost = Number(data.giftedTotalCost ?? 0);
  const giftItems: SaleGiftItem[] = Array.isArray(data.giftItems)
    ? data.giftItems.map((item): SaleGiftItem => ({
        productId: String(item?.productId ?? ''),
        quantity: Number(item?.quantity ?? 0),
        unitCost: Number(item?.unitCost ?? 0),
        totalCost: Number(item?.totalCost ?? 0),
        kind: item?.kind === 'auto-material' ? 'auto-material' : 'gift',
      })).filter((item) => item.productId && item.quantity > 0)
    : legacyGiftedProductId && legacyGiftedQuantity > 0
      ? [
          {
            productId: legacyGiftedProductId,
            quantity: legacyGiftedQuantity,
            unitCost: legacyGiftedUnitCost,
            totalCost: legacyGiftedTotalCost,
            kind: 'gift',
          },
        ]
      : [];

  return {
    id: documentId,
    saleBatchId: data.saleBatchId ? String(data.saleBatchId) : undefined,
    productId: String(data.productId ?? lineItems[0]?.productId ?? ''),
    soldAt: normalizeDateValue(data.soldAt),
    quantity: Number(data.quantity ?? lineItems.reduce((sum, item) => sum + item.quantity, 0)),
    unitPrice: Number(data.unitPrice ?? lineItems[0]?.unitPrice ?? 0),
    totalSale: Number(data.totalSale ?? lineItems.reduce((sum, item) => sum + item.totalSale, 0)),
    realUnitCost: Number(data.realUnitCost ?? lineItems[0]?.realUnitCost ?? 0),
    totalCost: Number(data.totalCost ?? lineItems.reduce((sum, item) => sum + item.totalCost, 0)),
    grossProfit: Number(
      data.grossProfit ??
        lineItems.reduce((sum, item) => sum + item.totalSale - item.totalCost, 0) - giftItems.reduce((sum, item) => sum + item.totalCost, 0)
    ),
    lineItems,
    giftItems,
    giftedProductId: legacyGiftedProductId,
    giftedQuantity: legacyGiftedQuantity,
    giftedUnitCost: legacyGiftedUnitCost,
    giftedTotalCost: legacyGiftedTotalCost,
    returnedQuantity: Number(data.returnedQuantity ?? 0),
    returnedSaleAmount: Number(data.returnedSaleAmount ?? 0),
    returnedCostAmount: Number(data.returnedCostAmount ?? 0),
    customerName: String(data.customerName ?? ''),
    customerPhone: String(data.customerPhone ?? ''),
    notes: String(data.notes ?? ''),
    responsibleUser: String(data.responsibleUser ?? 'Administrador'),
  };
}

function mapServiceDocument(documentId: string, data: DocumentData): ServiceOrder {
  const materials: ServiceMaterialItem[] = Array.isArray(data.materials)
    ? data.materials
        .map((item) => ({
          productId: String(item?.productId ?? ''),
          quantity: Number(item?.quantity ?? 0),
          unitCost: Number(item?.unitCost ?? 0),
          totalCost: Number(item?.totalCost ?? 0),
        }))
        .filter((item) => item.productId && item.quantity > 0)
    : [];
  const totalMaterialCost = Number(
    data.totalMaterialCost ?? materials.reduce((sum, item) => sum + item.totalCost, 0)
  );
  const totalOperationalCost = Number(data.totalOperationalCost ?? data.serviceCost ?? 0);
  const totalCost = Number(data.totalCost ?? totalMaterialCost + totalOperationalCost);
  const totalRevenue = Number(data.totalRevenue ?? data.servicePrice ?? 0);

  return {
    id: documentId,
    serviceType:
      data.serviceType === 'tip-installation' ||
      data.serviceType === 'tip-ferrule-installation' ||
      data.serviceType === 'extension-installation'
        ? data.serviceType
        : 'tip-installation',
    serviceCategory: data.serviceCategory ? String(data.serviceCategory) : undefined,
    source: data.source === 'sale-addon' ? 'sale-addon' : 'standalone',
    saleId: data.saleId ? String(data.saleId) : undefined,
    saleBatchId: data.saleBatchId ? String(data.saleBatchId) : undefined,
    performedAt: normalizeDateValue(data.performedAt),
    customerName: String(data.customerName ?? ''),
    cueReference: String(data.cueReference ?? ''),
    servicePrice: Number(data.servicePrice ?? data.totalRevenue ?? 0),
    totalRevenue,
    totalMaterialCost,
    totalOperationalCost,
    totalCost,
    grossProfit: Number(
      data.grossProfit ??
        totalRevenue - totalCost
    ),
    materials,
    notes: String(data.notes ?? ''),
    responsibleUser: String(data.responsibleUser ?? 'Administrador'),
  };
}

function mapAuthorizationRequestDocument(documentId: string, data: DocumentData): AuthorizationRequest {
  return {
    id: documentId,
    saleId: String(data.saleId ?? ''),
    saleBatchId: String(data.saleBatchId ?? data.saleId ?? ''),
    requestType: data.requestType === 'sale-return' ? 'sale-return' : 'sale-edit',
    status:
      data.status === 'approved' ||
      data.status === 'rejected' ||
      data.status === 'completed'
        ? data.status
        : 'pending',
    customerName: String(data.customerName ?? ''),
    saleSummary: String(data.saleSummary ?? ''),
    reason: String(data.reason ?? ''),
    requestedBy: String(data.requestedBy ?? 'Usuario de ventas'),
    requestedByRole: data.requestedByRole === 'sales' ? 'sales' : 'admin',
    reviewedBy: String(data.reviewedBy ?? ''),
    reviewNote: String(data.reviewNote ?? ''),
    createdAt: normalizeDateValue(data.createdAt),
    updatedAt: normalizeDateValue(data.updatedAt),
    reviewedAt: data.reviewedAt ? normalizeDateValue(data.reviewedAt) : undefined,
    completedAt: data.completedAt ? normalizeDateValue(data.completedAt) : undefined,
  };
}

function mapProductCategoryDocument(documentId: string, data: DocumentData): ProductCategoryRecord {
  const subcategories: ProductSubcategory[] = Array.isArray(data.subcategories)
    ? data.subcategories
        .map((item, index) => ({
          id: String(item?.id ?? `subcategory-${index + 1}`),
          label: String(item?.label ?? ''),
          status: (item?.status === 'inactive' ? 'inactive' : 'active') as ProductCategoryStatus,
          sortOrder: Number(item?.sortOrder ?? index),
          createdAt: normalizeDateValue(item?.createdAt),
          updatedAt: normalizeDateValue(item?.updatedAt),
        }))
        .filter((item) => item.label)
    : [];

  return {
    id: documentId,
    label: String(data.label ?? documentId),
    status: (data.status === 'inactive' ? 'inactive' : 'active') as ProductCategoryStatus,
    sortOrder: Number(data.sortOrder ?? 0),
    subcategories,
    createdAt: normalizeDateValue(data.createdAt),
    updatedAt: normalizeDateValue(data.updatedAt),
  };
}

function findMovementForSale(movements: InventoryMovement[], sale: Sale) {
  return (
    movements.find((movement) => movement.saleId === sale.id && movement.reason === 'sale') ??
    movements.find(
      (movement) =>
        movement.reason === 'sale' &&
        movement.productId === sale.lineItems[0]?.productId &&
        movement.occurredAt === sale.soldAt &&
        movement.quantity === -Math.abs(sale.lineItems[0]?.quantity ?? sale.quantity)
    )
  );
}

function findGiftMovementForSale(movements: InventoryMovement[], sale: Sale) {
  return movements.filter((movement) => movement.saleId === sale.id && movement.reason === 'gift');
}

function countProductHistoryRecords(
  productId: string,
  input: {
    purchases: Purchase[];
    movements: InventoryMovement[];
    sales: Sale[];
    services: ServiceOrder[];
  }
) {
  const purchasesCount = input.purchases.filter((purchase) => purchase.productId === productId).length;
  const movementsCount = input.movements.filter((movement) => movement.productId === productId).length;
  const salesCount = input.sales.filter(
    (sale) =>
      sale.productId === productId ||
      sale.lineItems.some((item) => item.productId === productId) ||
      sale.giftItems.some((item) => item.productId === productId)
  ).length;
  const servicesCount = input.services.filter((service) =>
    service.materials.some((material) => material.productId === productId)
  ).length;

  return {
    purchasesCount,
    movementsCount,
    salesCount,
    servicesCount,
    hasActivity: purchasesCount + movementsCount + salesCount + servicesCount > 0,
  };
}

async function deleteDocumentIdsInChunks(collectionName: string, documentIds: string[], chunkSize = 400) {
  const normalizedIds = Array.from(new Set(documentIds.filter(Boolean)));
  if (normalizedIds.length === 0) return 0;

  let deletedCount = 0;
  for (let index = 0; index < normalizedIds.length; index += chunkSize) {
    const batch = writeBatch(db);
    const chunk = normalizedIds.slice(index, index + chunkSize);
    chunk.forEach((documentId) => {
      batch.delete(doc(db, collectionName, documentId));
    });
    await batch.commit();
    deletedCount += chunk.length;
  }

  return deletedCount;
}

function normalizeComparableVariantDefinitions(definitions: ProductVariantAttributeDefinition[] = []) {
  return normalizeVariantAttributeDefinitions(definitions).map((definition) => ({
    key: definition.key,
    label: definition.label,
  }));
}

function normalizeComparableVariants(product: Product) {
  const definitions = normalizeVariantAttributeDefinitions(product.variantAttributes ?? []);
  const normalizedVariants = normalizeProductVariantRecords(product.id, definitions, product.variants ?? []);

  return normalizedVariants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    attributes: variant.attributes ?? {},
    salePrice: Number(variant.salePrice ?? 0),
    stock: Math.max(Number(variant.stock ?? 0), 0),
    status: variant.status === 'inactive' ? 'inactive' : 'active',
  }));
}

function hasStructuralProductChanges(existingProduct: Product, nextProduct: Product) {
  if (existingProduct.category !== nextProduct.category) return true;
  if (existingProduct.subcategory !== nextProduct.subcategory) return true;
  if (getProductSaleMode(existingProduct) !== getProductSaleMode(nextProduct)) return true;

  const currentDefinitions = JSON.stringify(
    normalizeComparableVariantDefinitions(existingProduct.variantAttributes ?? [])
  );
  const nextDefinitions = JSON.stringify(
    normalizeComparableVariantDefinitions(nextProduct.variantAttributes ?? [])
  );
  if (currentDefinitions !== nextDefinitions) return true;

  const currentVariants = normalizeComparableVariants(existingProduct);
  const nextVariants = normalizeComparableVariants(nextProduct);

  if (currentVariants.length !== nextVariants.length) return true;

  for (let index = 0; index < currentVariants.length; index += 1) {
    const currentVariant = currentVariants[index];
    const nextVariant = nextVariants[index];

    if (!nextVariant) return true;
    if (currentVariant.id !== nextVariant.id) return true;
    if (currentVariant.name !== nextVariant.name) return true;
    if (JSON.stringify(currentVariant.attributes) !== JSON.stringify(nextVariant.attributes)) return true;
    if (currentVariant.stock !== nextVariant.stock) return true;
    if (currentVariant.status !== nextVariant.status) return true;
  }

  return false;
}

function findVariantByPreferredName(variants: ProductVariant[] = [], preferredName?: string) {
  const normalizedPreferredName = preferredName?.trim().toLowerCase();
  if (!normalizedPreferredName) return null;

  return (
    variants.find((variant) => {
      const values = [
        variant.name,
        variant.displayName,
        variant.attributes?.color,
        ...(variant.attributeValues ?? []),
      ]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter(Boolean);

      return values.includes(normalizedPreferredName);
    }) ?? null
  );
}

function findTransparentVariant(variants: ProductVariant[] = []) {
  return (
    variants.find((variant) => {
      const colorValue = String(variant.attributes?.color ?? variant.attributeValues?.[0] ?? variant.name ?? '')
        .trim()
        .toLowerCase();
      return colorValue === 'transparente';
    }) ?? null
  );
}

function canAutoMigrateLegacyVirolaHistory(
  existingProduct: Product,
  nextProduct: Product
) {
  if (!matchesProductCategoryFamily(existingProduct, 'virolas')) return false;
  if (getProductSaleMode(nextProduct) !== 'varianted') return false;

  const nextDefinitions = normalizeVariantAttributeDefinitions(nextProduct.variantAttributes ?? []);
  if (nextDefinitions.length !== 1 || nextDefinitions[0]?.key !== 'color') return false;

  return (nextProduct.variants?.length ?? 0) > 0;
}

function buildProductWritePayload(
  input: NewProductInput,
  options: {
    saleMode: Product['saleMode'];
    salePrice: number;
    variantLabel: string;
    variantAttributes: ProductVariantAttributeDefinition[];
    variants: ProductVariant[];
    publicStock: number;
    includeCreatedAt?: boolean;
  }
) {
  const serializedVariants = options.variants.map((variant) => ({
    id: String(variant.id ?? ''),
    productId: String(variant.productId ?? ''),
    name: String(variant.name ?? ''),
    displayName: String(variant.displayName ?? variant.name ?? ''),
    sku: variant.sku?.trim() || null,
    salePrice: Number(variant.salePrice ?? 0),
    latestUnitCost: Number(variant.latestUnitCost ?? 0),
    stock: Math.max(Number(variant.stock ?? 0), 0),
    publicStock: Math.max(Number(variant.publicStock ?? variant.stock ?? 0), 0),
    status: variant.status === 'inactive' ? 'inactive' : 'active',
    sortOrder: Number(variant.sortOrder ?? 0),
    attributes: variant.attributes ?? {},
    attributeValues: Array.isArray(variant.attributeValues) ? variant.attributeValues : [],
    colorHex: variant.colorHex?.trim() || null,
  }));

  return {
    name: String(input.name ?? '').trim(),
    description: String(input.description ?? '').trim(),
    category: String(input.category ?? '').trim(),
    subcategory: String(input.subcategory ?? '').trim(),
    brand: String(input.brand ?? '').trim(),
    salePrice: Number(options.salePrice ?? 0),
    saleMode: options.saleMode === 'varianted' ? 'varianted' : 'simple',
    variantLabel: String(options.variantLabel ?? '').trim(),
    variantAttributes: options.variantAttributes,
    variants: serializedVariants,
    featured: Boolean(input.featured ?? false),
    image: String(input.image ?? SITE_LOGO),
    imageRotation: Number(input.imageRotation ?? 0),
    status:
      input.status === 'draft' || input.status === 'archived' || input.status === 'active'
        ? input.status
        : 'active',
    publicStock: Math.max(Number(options.publicStock ?? 0), 0),
    ...(options.includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  };
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ProductCategoryRecord[]>([]);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements);
  const [purchases, setPurchases] = useState<Purchase[]>(initialPurchases);
  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [services, setServices] = useState<ServiceOrder[]>(initialServices);
  const [authorizationRequests, setAuthorizationRequests] = useState<AuthorizationRequest[]>([]);

  const queueAdminNotification = (
    batch: ReturnType<typeof writeBatch>,
    input: {
      title: string;
      message: string;
      href: string;
      createdAt: string;
    }
  ) => {
    const notificationRef = doc(collection(db, 'admin-notifications'));
    batch.set(notificationRef, {
      id: notificationRef.id,
      title: input.title,
      message: input.message,
      href: input.href,
      read: false,
      createdAt: Timestamp.fromDate(new Date(input.createdAt)),
    });
  };

  useEffect(() => {
    const readyCollections = new Set<string>();
    const markReady = (collectionName: string) => {
      readyCollections.add(collectionName);
      if (readyCollections.size === 9) {
        setLoading(false);
      }
    };

    const unsubCategories = onSnapshot(
      collection(db, 'product_categories'),
      (snapshot) => {
        setCategories(
          snapshot.docs
            .map((item) => mapProductCategoryDocument(item.id, item.data()))
            .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'es'))
        );
        markReady('product_categories');
      },
      (error) => {
        console.error('Error leyendo categorias desde Firestore:', error);
        markReady('product_categories');
      }
    );

    const unsubProducts = onSnapshot(
      query(collection(db, 'products'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setProducts(snapshot.docs.map((item) => mapProductDocument(item.id, item.data())));
        markReady('products');
      },
      (error) => {
        console.error('Error leyendo productos desde Firestore:', error);
        markReady('products');
      }
    );

    const unsubSuppliers = onSnapshot(
      query(collection(db, 'suppliers'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setSuppliers(snapshot.docs.map((item) => mapSupplierDocument(item.id, item.data())));
        markReady('suppliers');
      },
      (error) => {
        console.error('Error leyendo proveedores desde Firestore:', error);
        markReady('suppliers');
      }
    );

    const unsubProductVariants = onSnapshot(
      query(collection(db, 'product_variants'), orderBy('productId', 'asc')),
      (snapshot) => {
        setProductVariants(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              productId: String(data.productId ?? ''),
              name: String(data.name ?? data.displayName ?? ''),
              displayName: String(data.displayName ?? data.name ?? ''),
              sku: data.sku ? String(data.sku) : undefined,
              salePrice: Number(data.salePrice ?? 0),
              latestUnitCost: Number(data.latestUnitCost ?? 0),
              stock: Number(data.stock ?? data.stockOnHand ?? 0),
              publicStock: Number(data.publicStock ?? data.stock ?? data.stockOnHand ?? 0),
              status: data.status === 'inactive' ? 'inactive' : 'active',
              sortOrder: Number(data.sortOrder ?? 0),
              attributes:
                data.attributes && typeof data.attributes === 'object'
                  ? Object.fromEntries(
                      Object.entries(data.attributes).map(([key, value]) => [key, String(value ?? '')])
                    )
                  : {},
              attributeValues: Array.isArray(data.attributeValues)
                ? data.attributeValues.map((value: unknown) => String(value ?? ''))
                : [],
              colorHex: typeof data.colorHex === 'string' ? String(data.colorHex) : undefined,
            } satisfies ProductVariant;
          })
        );
        markReady('product_variants');
      },
      (error) => {
        console.error('Error leyendo variantes desde Firestore:', error);
        markReady('product_variants');
      }
    );

    const unsubMovements = onSnapshot(
      query(collection(db, 'movements'), orderBy('occurredAt', 'desc')),
      (snapshot) => {
        setMovements(snapshot.docs.map((item) => mapMovementDocument(item.id, item.data())));
        markReady('movements');
      },
      (error) => {
        console.error('Error leyendo movimientos desde Firestore:', error);
        markReady('movements');
      }
    );

    const unsubPurchases = onSnapshot(
      query(collection(db, 'purchases'), orderBy('purchasedAt', 'desc')),
      (snapshot) => {
        setPurchases(snapshot.docs.map((item) => mapPurchaseDocument(item.id, item.data())));
        markReady('purchases');
      },
      (error) => {
        console.error('Error leyendo compras desde Firestore:', error);
        markReady('purchases');
      }
    );

    const unsubSales = onSnapshot(
      query(collection(db, 'sales'), orderBy('soldAt', 'desc')),
      (snapshot) => {
        setSales(snapshot.docs.map((item) => mapSaleDocument(item.id, item.data())));
        markReady('sales');
      },
      (error) => {
        console.error('Error leyendo ventas desde Firestore:', error);
        markReady('sales');
      }
    );

    const unsubServices = onSnapshot(
      query(collection(db, 'services'), orderBy('performedAt', 'desc')),
      (snapshot) => {
        setServices(snapshot.docs.map((item) => mapServiceDocument(item.id, item.data())));
        markReady('services');
      },
      (error) => {
        console.error('Error leyendo servicios desde Firestore:', error);
        markReady('services');
      }
    );

    const unsubAuthorizationRequests = onSnapshot(
      query(collection(db, 'authorization-requests'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setAuthorizationRequests(
          snapshot.docs.map((item) => mapAuthorizationRequestDocument(item.id, item.data()))
        );
        markReady('authorization-requests');
      },
      (error) => {
        console.error('Error leyendo autorizaciones desde Firestore:', error);
        markReady('authorization-requests');
      }
    );

    return () => {
      unsubCategories();
      unsubProducts();
      unsubProductVariants();
      unsubSuppliers();
      unsubMovements();
      unsubPurchases();
      unsubSales();
      unsubServices();
      unsubAuthorizationRequests();
    };
  }, []);

  const buildPublicStockMap = (
    baseMovements: InventoryMovement[],
    touchedProductIds: string[],
    addedMovements: Array<{ productId: string; quantity: number }> = []
  ) => {
    const uniqueProductIds = Array.from(new Set(touchedProductIds.filter(Boolean)));
    const projectedMovements = [
      ...baseMovements.map((movement) => ({ productId: movement.productId, quantity: movement.quantity })),
      ...addedMovements,
    ];

    return new Map(
      uniqueProductIds.map((productId) => [
        productId,
        getPublicStockFromMovements(projectedMovements, productId),
      ])
    );
  };

  const applyPublicStockMapToBatch = (
    batch: ReturnType<typeof writeBatch>,
    stockMap: Map<string, number>
  ) => {
    stockMap.forEach((publicStock, productId) => {
      batch.set(
        doc(db, 'products', productId),
        {
          publicStock,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  };

  const applyVariantStockMapToBatch = (
    batch: ReturnType<typeof writeBatch>,
    variantStockMap: Map<string, Map<string, number>>,
    sourceProducts: Product[]
  ) => {
    variantStockMap.forEach((variantMap, productId) => {
      const product = sourceProducts.find((item) => item.id === productId);
      if (!product) return;

      const nextVariants = (product.variants ?? []).map((variant) => ({
        ...variant,
        stock: Math.max(Number(variantMap.get(variant.id) ?? variant.stock ?? 0), 0),
      }));
      const productVariantPayload = nextVariants.map((variant, index) => ({
        id: variant.id,
        productId,
        name: variant.name,
        displayName: variant.displayName ?? variant.name,
        sku: variant.sku ?? null,
        salePrice: Number(variant.salePrice ?? product.salePrice ?? 0),
        latestUnitCost: Number(variant.latestUnitCost ?? 0),
        stock: Math.max(Number(variant.stock ?? 0), 0),
        publicStock: Math.max(Number(variant.stock ?? 0), 0),
        status: variant.status === 'inactive' ? 'inactive' : 'active',
        sortOrder: Number(variant.sortOrder ?? index),
        attributes: variant.attributes ?? {},
        attributeValues: variant.attributeValues ?? [],
        colorHex: variant.colorHex ?? null,
      }));

      batch.set(
        doc(db, 'products', productId),
        {
          variants: productVariantPayload,
          publicStock: productVariantPayload.reduce<number>(
            (total, variant) => total + Math.max(Number(variant.stock ?? 0), 0),
            0
          ),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      productVariantPayload.forEach((variant) => {
        batch.set(
          doc(db, 'product_variants', variant.id),
          {
            id: variant.id,
            productId,
            name: variant.name,
            displayName: variant.displayName ?? variant.name,
            salePrice: Number(variant.salePrice ?? product.salePrice ?? 0),
            latestUnitCost: Number(variant.latestUnitCost ?? 0),
            stock: Math.max(Number(variant.stock ?? 0), 0),
            publicStock: Math.max(Number(variant.stock ?? 0), 0),
            status: variant.status === 'inactive' ? 'inactive' : 'active',
            sortOrder: Number(variant.sortOrder ?? 0),
            attributes: variant.attributes ?? {},
            attributeValues: variant.attributeValues ?? [],
            colorHex: variant.colorHex ?? null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
    });
  };

  const syncVariantDocumentsToBatch = (
    batch: ReturnType<typeof writeBatch>,
    product: Product
  ) => {
    (product.variants ?? []).forEach((variant, index) => {
      batch.set(
        doc(db, 'product_variants', variant.id),
        {
          id: variant.id,
          productId: product.id,
          name: variant.name,
          displayName: variant.displayName ?? variant.name,
          salePrice: Number(variant.salePrice ?? product.salePrice ?? 0),
          latestUnitCost: Number(variant.latestUnitCost ?? 0),
          stock: Math.max(Number(variant.stock ?? 0), 0),
          publicStock: Math.max(Number(variant.publicStock ?? variant.stock ?? 0), 0),
          status: variant.status === 'inactive' ? 'inactive' : 'active',
          sortOrder: Number(variant.sortOrder ?? index),
          attributes: variant.attributes ?? {},
          attributeValues: variant.attributeValues ?? [],
          colorHex: variant.colorHex ?? null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  };

  const getOperationalResetSummary = (
    options?: Partial<OperationalResetOptions>
  ): OperationalResetSummary => {
    const resolvedOptions = resolveOperationalResetOptions(options);
    const counts: Record<OperationalResetCollectionKey, number> = {
      products: resolvedOptions.deleteProducts ? products.length : 0,
      product_variants: resolvedOptions.deleteProducts ? productVariants.length : 0,
      suppliers: resolvedOptions.deleteSuppliers ? suppliers.length : 0,
      movements: movements.length,
      inventory_movements: movements.length,
      purchases: purchases.length,
      purchase_items: purchases.length,
      sales: sales.length,
      services: services.length,
      'authorization-requests': resolvedOptions.deleteAuthorizationRequests ? authorizationRequests.length : 0,
      'admin-notifications': 0,
    };

    return {
      generatedAt: new Date().toISOString(),
      counts,
      collectionsToDelete: [
        {
          key: 'products',
          label: operationalResetCollectionLabels.products,
          count: counts.products,
          classification: resolvedOptions.deleteProducts ? 'delete' : 'preserve',
        },
        {
          key: 'product_variants',
          label: operationalResetCollectionLabels.product_variants,
          count: counts.product_variants,
          classification: resolvedOptions.deleteProducts ? 'delete' : 'preserve',
        },
        {
          key: 'purchases',
          label: operationalResetCollectionLabels.purchases,
          count: counts.purchases,
          classification: 'delete',
        },
        {
          key: 'purchase_items',
          label: operationalResetCollectionLabels.purchase_items,
          count: counts.purchase_items,
          classification: 'delete',
        },
        {
          key: 'movements',
          label: operationalResetCollectionLabels.movements,
          count: counts.movements,
          classification: 'delete',
        },
        {
          key: 'inventory_movements',
          label: operationalResetCollectionLabels.inventory_movements,
          count: counts.inventory_movements,
          classification: 'delete',
        },
        {
          key: 'sales',
          label: operationalResetCollectionLabels.sales,
          count: counts.sales,
          classification: 'delete',
        },
        {
          key: 'services',
          label: operationalResetCollectionLabels.services,
          count: counts.services,
          classification: 'delete',
        },
        {
          key: 'suppliers',
          label: operationalResetCollectionLabels.suppliers,
          count: counts.suppliers,
          classification: resolvedOptions.deleteSuppliers ? 'archive' : 'preserve',
        },
        {
          key: 'authorization-requests',
          label: operationalResetCollectionLabels['authorization-requests'],
          count: counts['authorization-requests'],
          classification: resolvedOptions.deleteAuthorizationRequests ? 'archive' : 'preserve',
        },
        {
          key: 'admin-notifications',
          label: operationalResetCollectionLabels['admin-notifications'],
          count: counts['admin-notifications'],
          classification: resolvedOptions.deleteAdminNotifications ? 'archive' : 'preserve',
        },
      ],
      collectionsToPreserve: [
        {
          key: 'usuarios',
          label: 'Usuarios y roles',
          reason: 'Controlan acceso, permisos y reglas de Firestore.',
        },
        {
          key: 'siteAssets',
          label: 'Assets y configuracion web',
          reason: 'Mantienen imagenes del catalogo y contenido publico del sitio.',
        },
      ],
      backupRecommendations: [
        'Descargar un snapshot JSON antes del reset para conservar el estado previo.',
        'Si quieres auditoria historica adicional, exportar tambien la base desde Firebase antes de limpiar.',
        'Si vas a limpiar proveedores, respalda sus contactos porque no se reconstruyen desde otras colecciones.',
      ],
      warnings: [
        'Las categorias y subcategorias no tienen coleccion propia: el ajuste real se hace sobre productos y variantes.',
        'Compras, ventas, servicios y movimientos comparten referencias por productId, saleId, purchaseId y serviceOrderId.',
        'purchase_items e inventory_movements son colecciones espejo y deben limpiarse junto con su coleccion principal.',
      ],
    };
  };

  const exportOperationalResetSnapshot = async (
    options?: Partial<OperationalResetOptions>
  ): Promise<OperationalResetSnapshot> => {
    const resolvedOptions = resolveOperationalResetOptions(options);
    const adminNotificationsSnapshot = resolvedOptions.deleteAdminNotifications
      ? await getDocs(collection(db, 'admin-notifications'))
      : null;

    return {
      exportedAt: new Date().toISOString(),
      summary: getOperationalResetSummary(resolvedOptions),
      options: resolvedOptions,
      data: {
        ...(resolvedOptions.deleteProducts ? { products, product_variants: productVariants } : {}),
        ...(resolvedOptions.deleteSuppliers ? { suppliers } : {}),
        movements,
        inventory_movements: movements,
        purchases,
        purchase_items: purchases,
        sales,
        services,
        ...(resolvedOptions.deleteAuthorizationRequests
          ? { 'authorization-requests': authorizationRequests }
          : {}),
        ...(resolvedOptions.deleteAdminNotifications && adminNotificationsSnapshot
          ? {
              'admin-notifications': adminNotificationsSnapshot.docs.map((item) => ({
                id: item.id,
                ...item.data(),
              })),
            }
          : {}),
      },
    };
  };

  const runOperationalReset = async (
    options?: Partial<OperationalResetOptions>
  ): Promise<OperationalResetResult> => {
    const resolvedOptions = resolveOperationalResetOptions(options);
    const deletedCounts: Partial<Record<OperationalResetCollectionKey, number>> = {};

    const purchaseItemsSnapshot = await getDocs(collection(db, 'purchase_items'));
    const inventoryMovementsSnapshot = await getDocs(collection(db, 'inventory_movements'));
    const adminNotificationsSnapshot = resolvedOptions.deleteAdminNotifications
      ? await getDocs(collection(db, 'admin-notifications'))
      : null;

    deletedCounts.purchases = await deleteDocumentIdsInChunks('purchases', purchases.map((item) => item.id));
    deletedCounts.purchase_items = await deleteDocumentIdsInChunks(
      'purchase_items',
      purchaseItemsSnapshot.docs.map((item) => item.id)
    );
    deletedCounts.sales = await deleteDocumentIdsInChunks('sales', sales.map((item) => item.id));
    deletedCounts.services = await deleteDocumentIdsInChunks('services', services.map((item) => item.id));
    deletedCounts.movements = await deleteDocumentIdsInChunks('movements', movements.map((item) => item.id));
    deletedCounts.inventory_movements = await deleteDocumentIdsInChunks(
      'inventory_movements',
      inventoryMovementsSnapshot.docs.map((item) => item.id)
    );

    if (resolvedOptions.deleteProducts) {
      deletedCounts.product_variants = await deleteDocumentIdsInChunks(
        'product_variants',
        productVariants.map((item) => item.id)
      );
      deletedCounts.products = await deleteDocumentIdsInChunks('products', products.map((item) => item.id));
    }

    if (resolvedOptions.deleteSuppliers) {
      deletedCounts.suppliers = await deleteDocumentIdsInChunks('suppliers', suppliers.map((item) => item.id));
    }

    if (resolvedOptions.deleteAuthorizationRequests) {
      deletedCounts['authorization-requests'] = await deleteDocumentIdsInChunks(
        'authorization-requests',
        authorizationRequests.map((item) => item.id)
      );
    }

    if (resolvedOptions.deleteAdminNotifications && adminNotificationsSnapshot) {
      deletedCounts['admin-notifications'] = await deleteDocumentIdsInChunks(
        'admin-notifications',
        adminNotificationsSnapshot.docs.map((item) => item.id)
      );
    }

    return {
      executedAt: new Date().toISOString(),
      deletedCounts,
    };
  };

  const createCategory = async (input: NewCategoryInput) => {
    const label = input.label.trim();
    if (!label) {
      throw new Error('Ingresa el nombre de la categoria.');
    }

    const categoryId = slugifyCategoryKey(label);
    if (!categoryId) {
      throw new Error('No se pudo generar un identificador valido para la categoria.');
    }
    if (categories.some((category) => category.id === categoryId)) {
      throw new Error('Esa categoria ya existe. Puedes usar la que ya esta creada o escribir otro nombre.');
    }

    const sortOrder = categories.length;
    const categoryRef = doc(db, 'product_categories', categoryId);
    await setDoc(categoryRef, {
      label,
      status: 'active',
      sortOrder,
      subcategories: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      id: categoryId,
      label,
      status: 'active' as ProductCategoryStatus,
      sortOrder,
      subcategories: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const updateCategory = async (categoryId: string, input: UpdateCategoryInput) => {
    const existingCategory = categories.find((category) => category.id === categoryId);
    if (!existingCategory) {
      throw new Error('No se encontro la categoria a actualizar.');
    }

    const label = input.label.trim();
    if (!label) {
      throw new Error('Ingresa el nombre de la categoria.');
    }

    await updateDoc(doc(db, 'product_categories', categoryId), {
      label,
      status: input.status === 'inactive' ? 'inactive' : 'active',
      updatedAt: serverTimestamp(),
    });

    return {
      ...existingCategory,
      label,
      status: (input.status === 'inactive' ? 'inactive' : 'active') as ProductCategoryStatus,
      updatedAt: new Date().toISOString(),
    };
  };

  const deleteCategory = async (categoryId: string) => {
    if (products.some((product) => product.category === categoryId)) {
      throw new Error('No puedes eliminar una categoria que ya esta en uso por productos.');
    }

    await deleteDoc(doc(db, 'product_categories', categoryId));
  };

  const createSubcategory = async (categoryId: string, input: NewSubcategoryInput) => {
    const existingCategory = categories.find((category) => category.id === categoryId);
    if (!existingCategory) {
      throw new Error('Selecciona primero una categoria valida.');
    }

    const label = input.label.trim();
    if (!label) {
      throw new Error('Ingresa el nombre de la subcategoria.');
    }
    const subcategoryId = slugifyCategoryKey(label);
    if (!subcategoryId) {
      throw new Error('No se pudo generar un identificador valido para la subcategoria.');
    }
    if (existingCategory.subcategories.some((subcategory) => subcategory.id === subcategoryId)) {
      throw new Error('Ya existe una subcategoria con ese nombre dentro de esta categoria.');
    }

    const nextSubcategories = [
      ...existingCategory.subcategories,
      {
        id: subcategoryId,
        label,
        status: 'active' as ProductCategoryStatus,
        sortOrder: existingCategory.subcategories.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await updateDoc(doc(db, 'product_categories', categoryId), {
      subcategories: nextSubcategories,
      updatedAt: serverTimestamp(),
    });

    return {
      ...existingCategory,
      subcategories: nextSubcategories,
      updatedAt: new Date().toISOString(),
    };
  };

  const updateSubcategory = async (
    categoryId: string,
    subcategoryId: string,
    input: UpdateSubcategoryInput
  ) => {
    const existingCategory = categories.find((category) => category.id === categoryId);
    if (!existingCategory) {
      throw new Error('No se encontro la categoria de la subcategoria.');
    }

    const existingSubcategory = existingCategory.subcategories.find((subcategory) => subcategory.id === subcategoryId);
    if (!existingSubcategory) {
      throw new Error('No se encontro la subcategoria a actualizar.');
    }

    const label = input.label.trim();
    if (!label) {
      throw new Error('Ingresa el nombre de la subcategoria.');
    }

    const nextSubcategories = existingCategory.subcategories.map((subcategory) =>
      subcategory.id === subcategoryId
        ? {
            ...subcategory,
            label,
            status: (input.status === 'inactive' ? 'inactive' : 'active') as ProductCategoryStatus,
            updatedAt: new Date().toISOString(),
          }
        : subcategory
    );

    const batch = writeBatch(db);
    batch.update(doc(db, 'product_categories', categoryId), {
      subcategories: nextSubcategories,
      updatedAt: serverTimestamp(),
    });

    if (existingSubcategory.label !== label) {
      products
        .filter((product) => product.category === categoryId && product.subcategory === existingSubcategory.label)
        .forEach((product) => {
          batch.set(
            doc(db, 'products', product.id),
            {
              subcategory: label,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
    }

    await batch.commit();

    return {
      ...existingCategory,
      subcategories: nextSubcategories,
      updatedAt: new Date().toISOString(),
    };
  };

  const deleteSubcategory = async (categoryId: string, subcategoryId: string) => {
    const existingCategory = categories.find((category) => category.id === categoryId);
    if (!existingCategory) {
      throw new Error('No se encontro la categoria de la subcategoria.');
    }

    const existingSubcategory = existingCategory.subcategories.find((subcategory) => subcategory.id === subcategoryId);
    if (!existingSubcategory) {
      throw new Error('No se encontro la subcategoria a eliminar.');
    }

    if (
      products.some(
        (product) => product.category === categoryId && product.subcategory === existingSubcategory.label
      )
    ) {
      throw new Error('No puedes eliminar una subcategoria que ya esta en uso por productos.');
    }

    await updateDoc(doc(db, 'product_categories', categoryId), {
      subcategories: existingCategory.subcategories.filter((subcategory) => subcategory.id !== subcategoryId),
      updatedAt: serverTimestamp(),
    });
  };

  const syncPublicProductStocks = async () => {
    const batch = writeBatch(db);
    let changedCount = 0;
    products.forEach((product) => {
      const publicStock =
        getProductSaleMode(product) === 'varianted'
          ? (product.variants ?? []).reduce((total, variant) => total + Math.max(Number(variant.stock ?? 0), 0), 0)
          : getProductStock(movements, product.id);
      const currentPublicStock = Math.max(Number(product.publicStock ?? 0), 0);
      if (publicStock === currentPublicStock) {
        return;
      }

      batch.set(
        doc(db, 'products', product.id),
        {
          publicStock,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      changedCount += 1;
    });

    if (changedCount === 0) {
      return 0;
    }

    await runFirestoreWriteWithBackoff(() => batch.commit(), {
      retries: 5,
      initialDelayMs: 700,
    });
    return changedCount;
  };

  const createProduct = async (input: NewProductInput) => {
    const createdAt = new Date().toISOString();
    const productRef = doc(collection(db, 'products'));
    const normalizedVariantAttributes = normalizeVariantAttributeDefinitions(input.variantAttributes);
    const normalizedVariants = normalizeProductVariantRecords(
      productRef.id,
      normalizedVariantAttributes,
      input.variants
    );
    const nextSaleMode = input.saleMode === 'varianted' || normalizedVariants.length > 0 ? 'varianted' : 'simple';
    const productSummary =
      nextSaleMode === 'varianted'
        ? {
            publicStock: normalizedVariants.reduce((total, variant) => total + Math.max(Number(variant.stock ?? 0), 0), 0),
            salePrice:
              normalizedVariants
                .map((variant) => Number(variant.salePrice ?? 0))
                .filter((value) => value > 0)
                .sort((left, right) => left - right)[0] ?? Number(input.salePrice ?? 0),
          }
        : {
            publicStock: 0,
            salePrice: Number(input.salePrice ?? 0),
          };
    const newProduct: Product = {
      ...input,
      saleMode: nextSaleMode,
      salePrice: productSummary.salePrice,
      variantLabel:
        input.variantLabel?.trim() ||
        normalizedVariantAttributes.map((attribute) => attribute.label).join(' / '),
      variantAttributes: normalizedVariantAttributes,
      variants: normalizedVariants,
      id: productRef.id,
      publicStock: productSummary.publicStock,
      createdAt,
      updatedAt: createdAt,
    };

    const batch = writeBatch(db);
    batch.set(
      productRef,
      buildProductWritePayload(input, {
        saleMode: nextSaleMode,
        salePrice: productSummary.salePrice,
        variantLabel: newProduct.variantLabel ?? '',
        variantAttributes: normalizedVariantAttributes,
        variants: normalizedVariants,
        publicStock: productSummary.publicStock,
        includeCreatedAt: true,
      })
    );
    syncVariantDocumentsToBatch(batch, newProduct);
    await batch.commit();

    return newProduct;
  };

  const updateProduct = async (productId: string, input: NewProductInput) => {
    const existingProduct = products.find((product) => product.id === productId);
    if (!existingProduct) {
      throw new Error('No se encontro el producto a actualizar.');
    }

    const normalizedVariantAttributes = normalizeVariantAttributeDefinitions(input.variantAttributes);
    const normalizedVariants = normalizeProductVariantRecords(
      productId,
      normalizedVariantAttributes,
      input.variants
    );
    const nextSaleMode = input.saleMode === 'varianted' || normalizedVariants.length > 0 ? 'varianted' : 'simple';
    const nextProduct: Product = {
      ...existingProduct,
      ...input,
      saleMode: nextSaleMode,
      salePrice:
        nextSaleMode === 'varianted'
          ? normalizedVariants
              .map((variant) => Number(variant.salePrice ?? 0))
              .filter((value) => value > 0)
              .sort((left, right) => left - right)[0] ?? Number(input.salePrice ?? existingProduct.salePrice ?? 0)
          : Number(input.salePrice ?? existingProduct.salePrice ?? 0),
      variantLabel:
        input.variantLabel?.trim() ||
        normalizedVariantAttributes.map((attribute) => attribute.label).join(' / '),
      variantAttributes: normalizedVariantAttributes,
      variants: normalizedVariants,
      publicStock:
        nextSaleMode === 'varianted'
          ? normalizedVariants.reduce((total, variant) => total + Math.max(Number(variant.stock ?? 0), 0), 0)
          : existingProduct.publicStock,
      updatedAt: new Date().toISOString(),
    };

    const historySummary = countProductHistoryRecords(productId, {
      purchases,
      movements,
      sales,
      services,
    });

    const canAutoMigrateHistory =
      historySummary.hasActivity &&
      canAutoMigrateLegacyVirolaHistory(existingProduct, nextProduct);

    if (
      historySummary.hasActivity &&
      hasStructuralProductChanges(existingProduct, nextProduct) &&
      !canAutoMigrateHistory
    ) {
      throw new Error(
        'Este producto ya tiene compras, movimientos o ventas. Para no afectar inventario e historial, por ahora solo puedes editar datos comerciales y visuales; la reorganizacion de variantes debe hacerse con una migracion guiada.'
      );
    }

    let migratedProduct = nextProduct;
    let historyVariant =
      findVariantByPreferredName(normalizedVariants, input.historyVariantName) ??
      findTransparentVariant(normalizedVariants) ??
      normalizedVariants[0] ??
      null;
    let variantAdjustmentDeltas: Array<{
      variantId: string;
      variantName: string;
      quantity: number;
    }> = [];

    if (canAutoMigrateHistory && historyVariant) {
      const currentLegacyStock = Math.max(getProductStock(movements, productId), 0);
      const desiredTotalStock = normalizedVariants.reduce(
        (total, variant) => total + Math.max(Number(variant.stock ?? 0), 0),
        0
      );

      if (desiredTotalStock !== currentLegacyStock) {
        throw new Error(
          `El stock repartido entre variantes debe sumar ${currentLegacyStock}. Ajusta las cantidades antes de guardar.`
        );
      }

      const baseMigratedVariants = normalizedVariants.map((variant) =>
        variant.id === historyVariant?.id
          ? {
              ...variant,
              stock: currentLegacyStock,
              publicStock: currentLegacyStock,
            }
          : {
              ...variant,
              stock: 0,
              publicStock: 0,
            }
      );

      variantAdjustmentDeltas = normalizedVariants
        .map((variant) => {
          const baseVariant = baseMigratedVariants.find((item) => item.id === variant.id);
          const baseStock = Math.max(Number(baseVariant?.stock ?? 0), 0);
          const desiredStock = Math.max(Number(variant.stock ?? 0), 0);
          const quantity = desiredStock - baseStock;

          if (quantity === 0) return null;

          return {
            variantId: variant.id,
            variantName: variant.displayName ?? variant.name,
            quantity,
          };
        })
        .filter((item): item is { variantId: string; variantName: string; quantity: number } => Boolean(item));

      historyVariant =
        findVariantByPreferredName(normalizedVariants, input.historyVariantName) ??
        findTransparentVariant(normalizedVariants) ??
        normalizedVariants[0] ??
        null;
      migratedProduct = {
        ...nextProduct,
        variants: normalizedVariants,
        publicStock: normalizedVariants.reduce((total, variant) => total + Math.max(Number(variant.stock ?? 0), 0), 0),
      };
    }

    const batch = writeBatch(db);
    batch.set(
      doc(db, 'products', productId),
      buildProductWritePayload(input, {
        saleMode: migratedProduct.saleMode,
        salePrice: migratedProduct.salePrice,
        variantLabel: migratedProduct.variantLabel ?? '',
        variantAttributes: normalizedVariantAttributes,
        variants: migratedProduct.variants ?? [],
        publicStock: migratedProduct.publicStock,
      }),
      { merge: true }
    );

    if (canAutoMigrateHistory && historyVariant) {
      const historyVariantId = historyVariant.id;
      const historyVariantName = historyVariant.displayName ?? historyVariant.name;

      movements
        .filter((movement) => movement.productId === productId && !movement.variantId)
        .forEach((movement) => {
          batch.set(
            doc(db, 'movements', movement.id),
            {
              variantId: historyVariantId,
              variantName: historyVariantName,
            },
            { merge: true }
          );
        });

      purchases
        .filter((purchase) => purchase.productId === productId && !purchase.variantId)
        .forEach((purchase) => {
          batch.set(
            doc(db, 'purchases', purchase.id),
            {
              variantId: historyVariantId,
              variantName: historyVariantName,
            },
            { merge: true }
          );
        });

      sales
        .filter(
          (sale) =>
            sale.productId === productId ||
            sale.lineItems.some((item) => item.productId === productId && !item.variantId)
        )
        .forEach((sale) => {
          const nextLineItems = sale.lineItems.map((item) =>
            item.productId === productId && !item.variantId
              ? {
                  ...item,
                  variantId: historyVariantId,
                  variantName: historyVariantName,
                }
              : item
          );

          batch.set(
            doc(db, 'sales', sale.id),
            {
              variantId: sale.productId === productId ? historyVariantId : sale.lineItems[0]?.variantId ?? null,
              variantName: sale.productId === productId ? historyVariantName : sale.lineItems[0]?.variantName ?? null,
              lineItems: nextLineItems,
            },
            { merge: true }
          );
        });

      const [inventoryMovementSnapshot, purchaseItemsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'inventory_movements'), where('productId', '==', productId))),
        getDocs(query(collection(db, 'purchase_items'), where('productId', '==', productId))),
      ]);

      inventoryMovementSnapshot.docs.forEach((snapshotItem) => {
        const data = snapshotItem.data();
        if (data.variantId) return;
        batch.set(
          doc(db, 'inventory_movements', snapshotItem.id),
          {
            variantId: historyVariantId,
            variantName: historyVariantName,
          },
          { merge: true }
        );
      });

      purchaseItemsSnapshot.docs.forEach((snapshotItem) => {
        const data = snapshotItem.data();
        if (data.variantId) return;
        batch.set(
          doc(db, 'purchase_items', snapshotItem.id),
          {
            variantId: historyVariantId,
            variantName: historyVariantName,
          },
          { merge: true }
        );
      });

      if (variantAdjustmentDeltas.length > 0) {
        const occurredAt = Timestamp.fromDate(new Date());

        variantAdjustmentDeltas.forEach((item) => {
          const movementRef = doc(collection(db, 'movements'));
          const movementPayload = {
            id: movementRef.id,
            productId,
            variantId: item.variantId,
            variantName: item.variantName,
            type: 'adjustment',
            reason: 'manual-adjustment',
            quantity: item.quantity,
            notes: `Redistribucion inicial de stock entre variantes. Historial base: ${historyVariantName}.`,
            occurredAt,
            responsibleUser: 'Migracion de variantes',
            relatedUnitCost: getVariantOrProductRealUnitCost(purchases, productId, item.variantId),
          };

          batch.set(doc(db, 'movements', movementRef.id), movementPayload);
          batch.set(doc(db, 'inventory_movements', movementRef.id), {
            ...movementPayload,
            sourceType: 'manual-adjustment',
            sourceId: movementRef.id,
          });
        });
      }
    }

    syncVariantDocumentsToBatch(batch, migratedProduct);
    await batch.commit();

    return migratedProduct;
  };

  const deleteProduct = async (productId: string) => {
    const historySummary = countProductHistoryRecords(productId, {
      purchases,
      movements,
      sales,
      services,
    });
    if (historySummary.hasActivity) {
      throw new Error(
        'Este producto ya tiene historial. No se puede eliminar sin una migracion controlada porque afectaria compras, inventario o ventas registradas.'
      );
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, 'products', productId));
    (products.find((product) => product.id === productId)?.variants ?? []).forEach((variant) => {
      batch.delete(doc(db, 'product_variants', variant.id));
    });
    movements
      .filter((movement) => movement.productId === productId)
      .forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    purchases
      .filter((purchase) => purchase.productId === productId)
      .forEach((purchase) => batch.delete(doc(db, 'purchases', purchase.id)));
    sales
      .filter((sale) => sale.lineItems.some((item) => item.productId === productId))
      .forEach((sale) => batch.delete(doc(db, 'sales', sale.id)));
    await batch.commit();
  };

  const createSupplier = async (input: NewSupplierInput) => {
    const createdAt = new Date().toISOString();
    const supplierRef = doc(collection(db, 'suppliers'));
    const newSupplier: Supplier = {
      ...input,
      id: supplierRef.id,
      createdAt,
      updatedAt: createdAt,
    };

    await setDoc(supplierRef, {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setSuppliers((current) => {
      const withoutExisting = current.filter((supplier) => supplier.id !== newSupplier.id);
      return [newSupplier, ...withoutExisting];
    });

    return newSupplier;
  };

  const updateSupplier = async (supplierId: string, input: NewSupplierInput) => {
    const existingSupplier = suppliers.find((supplier) => supplier.id === supplierId);
    if (!existingSupplier) {
      throw new Error('No se encontro el proveedor a actualizar.');
    }

    await updateDoc(doc(db, 'suppliers', supplierId), {
      ...input,
      updatedAt: serverTimestamp(),
    });

    const updatedSupplier = {
      ...existingSupplier,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    setSuppliers((current) =>
      current.map((supplier) => (supplier.id === supplierId ? updatedSupplier : supplier))
    );

    return updatedSupplier;
  };

  const deleteSupplier = async (supplierId: string) => {
    await deleteDoc(doc(db, 'suppliers', supplierId));
    setSuppliers((current) => current.filter((supplier) => supplier.id !== supplierId));
  };

  const registerMovement = async (input: RegisterMovementInput) => {
    const targetProduct = products.find((product) => product.id === input.productId);
    if (!targetProduct) {
      throw new Error('No se encontro el producto para registrar el movimiento.');
    }
    const selectedVariant = input.variantId ? getProductVariantById(targetProduct, input.variantId) : null;
    if (getProductSaleMode(targetProduct) === 'varianted' && !selectedVariant) {
      throw new Error(`Selecciona una variante valida para ${targetProduct.name}.`);
    }

    const normalizedQuantity =
      input.type === 'exit' ? -Math.abs(input.quantity) : input.quantity;
    const movementRef = doc(collection(db, 'movements'));
    const movement: InventoryMovement = {
      id: movementRef.id,
      productId: input.productId,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name ?? input.variantName,
      type: input.type,
      reason: input.reason,
      quantity: normalizedQuantity,
      notes: input.notes,
      occurredAt: new Date().toISOString(),
      responsibleUser: input.responsibleUser,
      relatedUnitCost:
        input.relatedUnitCost ?? getVariantOrProductRealUnitCost(purchases, input.productId, selectedVariant?.id),
    };

    const batch = writeBatch(db);
    batch.set(movementRef, {
      ...movement,
      occurredAt: serverTimestamp(),
    });
    batch.set(doc(db, 'inventory_movements', movement.id), {
      ...movement,
      occurredAt: serverTimestamp(),
      sourceType: 'manual-adjustment',
      sourceId: movement.id,
    });
    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(movements, [input.productId], [
        { productId: input.productId, quantity: normalizedQuantity },
      ])
    );
    if (selectedVariant) {
      const variantStockMap = buildVariantStockMap(products);
      const productVariantMap = variantStockMap.get(input.productId);
      const currentVariantStock = productVariantMap?.get(selectedVariant.id) ?? selectedVariant.stock ?? 0;
      productVariantMap?.set(selectedVariant.id, Math.max(currentVariantStock + normalizedQuantity, 0));
      applyVariantStockMapToBatch(batch, variantStockMap, products);
    }
    await batch.commit();

    return movement;
  };

  const registerPurchase = async (input: RegisterPurchaseInput) => {
    return createPurchaseBatch(input);
  };

  const registerInitialStock = async (input: RegisterInitialStockInput) => {
    const targetProduct = products.find((product) => product.id === input.productId);
    if (!targetProduct) {
      throw new Error('No se encontro el producto para cargar inventario inicial.');
    }

    const quantity = Number(input.quantity);
    const estimatedUnitCost = Number(input.estimatedUnitCost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La cantidad inicial debe ser mayor a cero.');
    }
    if (!Number.isFinite(estimatedUnitCost) || estimatedUnitCost < 0) {
      throw new Error('El costo estimado debe ser un valor valido.');
    }

    const purchaseRef = doc(collection(db, 'purchases'));
    const movementRef = doc(collection(db, 'movements'));
    const purchaseValueTotal = Number((quantity * estimatedUnitCost).toFixed(2));
    const purchase: Purchase = {
      id: purchaseRef.id,
      purchaseId: purchaseRef.id,
      productId: input.productId,
      variantId: input.variantId,
      variantName: input.variantName,
      supplier: 'Inventario inicial sin proveedor',
      source: 'initial-load',
      purchasedAt: input.occurredAt,
      presentationQuantity: quantity,
      purchaseUnitValue: estimatedUnitCost,
      quantityPurchased: quantity,
      purchasePresentation: 'unit',
      conversionFactor: 1,
      purchaseValueTotal,
      shippingValueTotal: 0,
      totalInvestment: purchaseValueTotal,
      realUnitCost: estimatedUnitCost,
      suggestedSalePrice: input.suggestedSalePrice ?? targetProduct.salePrice,
      estimatedMargin: calculateMargin(estimatedUnitCost, input.suggestedSalePrice ?? targetProduct.salePrice),
      notes: input.notes,
    };
    const movement: InventoryMovement = {
      id: movementRef.id,
      productId: input.productId,
      variantId: input.variantId,
      variantName: input.variantName,
      purchaseId: purchase.id,
      type: 'entry',
      reason: 'initial-load',
      quantity,
      notes: input.notes,
      occurredAt: input.occurredAt,
      responsibleUser: input.responsibleUser,
      relatedUnitCost: estimatedUnitCost,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'purchases', purchase.id), {
      ...purchase,
      docType: 'legacy-line',
      purchasedAt: Timestamp.fromDate(new Date(input.occurredAt)),
    });
    batch.set(doc(db, 'purchase_items', purchase.id), {
      ...purchase,
      purchaseId: purchase.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      purchasedAt: Timestamp.fromDate(new Date(input.occurredAt)),
    });
    batch.set(doc(db, 'movements', movement.id), {
      ...movement,
      occurredAt: Timestamp.fromDate(new Date(input.occurredAt)),
    });
    batch.set(doc(db, 'inventory_movements', movement.id), {
      ...movement,
      sourceType: 'initial-load',
      sourceId: purchase.id,
      occurredAt: Timestamp.fromDate(new Date(input.occurredAt)),
    });

    if (
      typeof input.suggestedSalePrice === 'number' &&
      Number.isFinite(input.suggestedSalePrice) &&
      input.suggestedSalePrice >= 0
    ) {
      batch.update(doc(db, 'products', input.productId), {
        salePrice: input.suggestedSalePrice,
        updatedAt: serverTimestamp(),
      });
    }

    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(movements, [input.productId], [
        { productId: input.productId, quantity },
      ])
    );
    if (input.variantId) {
      const variantStockMap = buildVariantStockMap(products);
      const productVariantMap = variantStockMap.get(input.productId);
      const currentVariantStock = productVariantMap?.get(input.variantId) ?? 0;
      productVariantMap?.set(input.variantId, currentVariantStock + quantity);
      applyVariantStockMapToBatch(batch, variantStockMap, products);
    }

    await batch.commit();

    return {
      movement,
      purchase,
    };
  };

  const createPurchaseBatch = async (
    input: RegisterPurchaseInput,
    existingBatchId?: string,
    baseMovements: InventoryMovement[] = movements
  ) => {
    if (input.items.length === 0) {
      throw new Error('Agrega al menos un producto a la compra.');
    }

    input.items.forEach((item) => {
      const targetProduct = products.find((product) => product.id === item.productId);
      if (!targetProduct) {
        throw new Error('Uno de los productos de la compra no existe.');
      }
    });

    const normalizedItems = input.items.map((item) => ({
      ...item,
      presentationQuantity: Number(item.presentationQuantity || 0),
      purchaseUnitValue: Number(item.purchaseUnitValue || 0),
      suggestedSalePrice: Number(item.suggestedSalePrice || 0),
    }));
    const totalPurchasedUnits = normalizedItems.reduce(
      (total, item) => total + item.presentationQuantity,
      0
    );
    const totalPurchaseValue = normalizedItems.reduce(
      (total, item) => total + Number((item.purchaseUnitValue * item.presentationQuantity).toFixed(2)),
      0
    );
    const batchId = existingBatchId ?? doc(collection(db, 'purchase-batches')).id;
    const batch = writeBatch(db);
    const purchasesCreated: Purchase[] = [];
    const stockDeltas: Array<{ productId: string; quantity: number }> = [];

    normalizedItems.forEach((item, index) => {
      const conversionFactor = 1;
      const quantityPurchased = item.presentationQuantity;
      const purchaseValueTotal = Number((item.purchaseUnitValue * item.presentationQuantity).toFixed(2));
      const shippingShare =
        totalPurchasedUnits > 0
          ? Number(((input.shippingValueTotal * quantityPurchased) / totalPurchasedUnits).toFixed(2))
          : Number((input.shippingValueTotal / input.items.length).toFixed(2));
      const adjustedShippingShare =
        index === input.items.length - 1
          ? Number(
              (
                input.shippingValueTotal -
                purchasesCreated.reduce((sum, purchase) => sum + purchase.shippingValueTotal, 0)
              ).toFixed(2)
            )
          : shippingShare;
      const totals = calculatePurchaseTotals(
        purchaseValueTotal,
        adjustedShippingShare,
        quantityPurchased
      );
      const purchase: Purchase = {
        id: doc(collection(db, 'purchases')).id,
        purchaseId: batchId,
        purchaseBatchId: batchId,
        productId: item.productId,
        variantId: item.variantId,
        variantName: item.variantName,
        supplier: input.supplier,
        supplierId: input.supplierId,
        purchasedAt: input.purchasedAt,
        presentationQuantity: item.presentationQuantity,
        purchaseUnitValue: item.purchaseUnitValue,
        quantityPurchased,
        purchasePresentation: 'unit',
        conversionFactor,
        purchaseValueTotal,
        shippingValueTotal: adjustedShippingShare,
        totalInvestment: totals.totalInvestment,
        realUnitCost: totals.realUnitCost,
        suggestedSalePrice: item.suggestedSalePrice,
        estimatedMargin: calculateMargin(totals.realUnitCost, item.suggestedSalePrice),
      };

      purchasesCreated.push(purchase);

      const movementRef = doc(collection(db, 'movements'));
      batch.set(doc(db, 'purchases', purchase.id), {
        ...purchase,
        docType: 'legacy-line',
        purchasedAt: Timestamp.fromDate(new Date(input.purchasedAt)),
      });
      batch.set(doc(db, 'purchase_items', purchase.id), {
        ...purchase,
        purchaseId: batchId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        purchasedAt: Timestamp.fromDate(new Date(input.purchasedAt)),
      });
      batch.set(movementRef, {
        id: movementRef.id,
        productId: item.productId,
        variantId: item.variantId ?? null,
        variantName: item.variantName ?? null,
        purchaseId: purchase.id,
        purchaseBatchId: batchId,
        type: 'purchase',
        reason: 'purchase',
        quantity: quantityPurchased,
        notes: `Compra grupal registrada a proveedor ${input.supplier}`,
        occurredAt: Timestamp.fromDate(new Date(input.purchasedAt)),
        responsibleUser: 'Administrador',
        relatedUnitCost: totals.realUnitCost,
      });
      batch.set(doc(db, 'inventory_movements', movementRef.id), {
        id: movementRef.id,
        productId: item.productId,
        variantId: item.variantId ?? null,
        variantName: item.variantName ?? null,
        purchaseId: purchase.id,
        purchaseBatchId: batchId,
        sourceType: 'purchase',
        sourceId: batchId,
        type: 'purchase',
        reason: 'purchase',
        quantity: quantityPurchased,
        notes: `Compra grupal registrada a proveedor ${input.supplier}`,
        occurredAt: Timestamp.fromDate(new Date(input.purchasedAt)),
        responsibleUser: 'Administrador',
        relatedUnitCost: totals.realUnitCost,
      });
      stockDeltas.push({ productId: item.productId, quantity: quantityPurchased });
      batch.update(doc(db, 'products', item.productId), {
        salePrice:
          item.variantId && getProductSaleMode(products.find((product) => product.id === item.productId)) === 'varianted'
            ? products.find((product) => product.id === item.productId)?.salePrice ?? item.suggestedSalePrice
            : item.suggestedSalePrice,
        updatedAt: serverTimestamp(),
      });
    });

    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(
        baseMovements,
        stockDeltas.map((item) => item.productId),
        stockDeltas
      )
    );
    const variantStockMap = buildVariantStockMap(products);
    normalizedItems.forEach((item) => {
      if (!item.variantId) return;
      const targetProduct = products.find((product) => product.id === item.productId);
      const targetVariant = targetProduct ? getProductVariantById(targetProduct, item.variantId) : null;
      if (!targetVariant) return;
      const currentStock = variantStockMap.get(item.productId)?.get(item.variantId) ?? targetVariant.stock ?? 0;
      variantStockMap.get(item.productId)?.set(item.variantId, currentStock + item.presentationQuantity);
      const variantRecord = (targetProduct?.variants ?? []).find((variant) => variant.id === item.variantId);
      if (variantRecord) {
        variantRecord.salePrice = Number(item.suggestedSalePrice ?? variantRecord.salePrice ?? targetProduct?.salePrice ?? 0);
        variantRecord.latestUnitCost = getVariantOrProductRealUnitCost(purchases, item.productId, item.variantId);
      }
    });
    applyVariantStockMapToBatch(batch, variantStockMap, products);

    await batch.commit();

    return purchasesCreated;
  };

  const updatePurchaseBatch = async (batchId: string, input: RegisterPurchaseInput) => {
    const targetPurchases = purchases.filter((purchase) => purchase.purchaseBatchId === batchId);
    if (targetPurchases.length === 0) {
      throw new Error('No se encontro la compra agrupada a editar.');
    }

    const batch = writeBatch(db);
    targetPurchases.forEach((purchase) => batch.delete(doc(db, 'purchases', purchase.id)));
    movements
      .filter((movement) => movement.purchaseBatchId === batchId)
      .forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    await batch.commit();

    const remainingMovements = movements.filter((movement) => movement.purchaseBatchId !== batchId);
    return createPurchaseBatch(input, batchId, remainingMovements);
  };

  const updatePurchase = async (purchaseId: string, input: RegisterPurchaseInput) => {
    const targetPurchase = purchases.find((purchase) => purchase.id === purchaseId);
    if (!targetPurchase) {
      throw new Error('No se encontro la compra a editar.');
    }
    if (input.items.length !== 1) {
      throw new Error('La edicion de producto debe contener una sola linea.');
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, 'purchases', purchaseId));
    movements
      .filter((movement) => movement.purchaseId === purchaseId)
      .forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    await batch.commit();

    const remainingMovements = movements.filter((movement) => movement.purchaseId !== purchaseId);
    const [updatedPurchase] = await createPurchaseBatch(input, targetPurchase.purchaseBatchId, remainingMovements);
    return updatedPurchase;
  };

  const deletePurchase = async (purchaseId: string) => {
    const targetPurchase = purchases.find((purchase) => purchase.id === purchaseId);
    if (!targetPurchase) {
      throw new Error('No se encontro la compra a eliminar.');
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, 'purchases', purchaseId));
    const removedMovements = movements.filter((movement) => movement.purchaseId === purchaseId);
    removedMovements.forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(
        movements.filter((movement) => movement.purchaseId !== purchaseId),
        removedMovements.map((movement) => movement.productId)
      )
    );
    await batch.commit();
  };

  const deletePurchaseBatch = async (batchId: string) => {
    const targetPurchases = purchases.filter((purchase) => purchase.purchaseBatchId === batchId);
    if (targetPurchases.length === 0) {
      throw new Error('No se encontro la compra agrupada a eliminar.');
    }

    const batch = writeBatch(db);
    targetPurchases.forEach((purchase) => batch.delete(doc(db, 'purchases', purchase.id)));
    const removedMovements = movements.filter((movement) => movement.purchaseBatchId === batchId);
    removedMovements.forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(
        movements.filter((movement) => movement.purchaseBatchId !== batchId),
        removedMovements.map((movement) => movement.productId)
      )
    );
    await batch.commit();
  };

  const registerSaleInternal = async (
    input: RegisterSaleInput,
    baseMovements: InventoryMovement[] = movements,
    baseProducts: Product[] = products,
    options?: { saleBatchId?: string }
  ) => {
    if (input.items.length === 0) {
      throw new Error('Agrega al menos un producto a la venta.');
    }

    const normalizedCustomerPhone = input.customerPhone.trim();
    if (normalizedCustomerPhone && normalizedCustomerPhone.length < 7) {
      throw new Error('Ingresa un telefono valido o dejalo vacio.');
    }

    const variantStockMap = buildVariantStockMap(baseProducts);
    const lineRecords = input.items.map((item) => {
      const targetProduct = baseProducts.find((product) => product.id === item.productId);
      if (!targetProduct) {
        throw new Error('No se encontro uno de los productos para registrar la venta.');
      }

      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (quantity <= 0) {
        throw new Error('La cantidad vendida debe ser mayor a cero.');
      }

      const availableStock = getProductStock(baseMovements, item.productId);
      if (quantity > availableStock) {
        throw new Error(`La cantidad vendida supera el stock disponible de ${targetProduct.name}.`);
      }

      let variantId: string | undefined;
      let variantName: string | undefined;
      if ((targetProduct.variants?.length ?? 0) > 0) {
        const selectedVariant = getProductVariantById(targetProduct, item.variantId);
        if (!selectedVariant) {
          throw new Error(`Selecciona la opcion disponible de ${targetProduct.name}.`);
        }
        const currentVariantStock = variantStockMap.get(targetProduct.id)?.get(selectedVariant.id) ?? selectedVariant.stock;
        if (quantity > currentVariantStock) {
          throw new Error(`La variante ${selectedVariant.name} de ${targetProduct.name} no tiene stock suficiente.`);
        }
        variantStockMap.get(targetProduct.id)?.set(selectedVariant.id, currentVariantStock - quantity);
        variantId = selectedVariant.id;
        variantName = selectedVariant.name;
      }

      const realUnitCost = getVariantOrProductRealUnitCost(purchases, item.productId, variantId);
      const lineItem: SaleLineItem = {
        productId: item.productId,
        variantId,
        variantName,
        quantity,
        unitPrice: Number(item.unitPrice ?? 0),
        realUnitCost,
        totalSale: quantity * Number(item.unitPrice ?? 0),
        totalCost: quantity * realUnitCost,
      };

      const giftItems = buildSaleGiftItems(item, targetProduct, baseProducts, purchases, baseMovements);
      const serviceItems = (item.serviceItems ?? []).map((serviceItem) => ({
        serviceType: serviceItem.serviceType,
        serviceCategory: serviceItem.serviceCategory?.trim() || undefined,
        price: Math.max(Number(serviceItem.price ?? 0), 0),
        cost: Math.max(Number(serviceItem.cost ?? 0), 0),
        cueReference: serviceItem.cueReference?.trim() || targetProduct.name,
        notes: serviceItem.notes?.trim() || '',
      })).filter((serviceItem) => serviceItem.price > 0 || serviceItem.cost > 0 || serviceItem.cueReference);

      return { lineItem, giftItems, serviceItems, targetProduct };
    });

    const requestedGiftTotals = new Map<string, number>();
    lineRecords.forEach((record) => {
      record.giftItems.forEach((giftItem) => {
        requestedGiftTotals.set(
          giftItem.productId,
          (requestedGiftTotals.get(giftItem.productId) ?? 0) + giftItem.quantity
        );
      });
    });

    for (const [productId, requestedQuantity] of requestedGiftTotals) {
      const availableGiftStock = getProductStock(baseMovements, productId);
      const stockReservedBySale = lineRecords
        .filter((record) => record.lineItem.productId === productId)
        .reduce((sum, record) => sum + record.lineItem.quantity, 0);

      if (requestedQuantity > availableGiftStock - stockReservedBySale) {
        throw new Error('La cantidad de uno de los obsequios supera el stock disponible.');
      }
    }

    const saleBatchId = options?.saleBatchId ?? doc(collection(db, 'sale-batches')).id;

    const batch = writeBatch(db);
    const stockDeltas: Array<{ productId: string; quantity: number }> = [];
    const createdSales: Sale[] = lineRecords.map(({ lineItem, giftItems }) => {
      const saleRef = doc(collection(db, 'sales'));
      const giftedTotalCost = giftItems.reduce((sum, item) => sum + item.totalCost, 0);
      const firstGiftItem = giftItems[0];
      const sale: Sale = {
        id: saleRef.id,
        saleBatchId,
        productId: lineItem.productId,
        soldAt: input.soldAt,
        quantity: lineItem.quantity,
        unitPrice: lineItem.unitPrice,
        totalSale: lineItem.totalSale,
        realUnitCost: lineItem.realUnitCost,
        totalCost: lineItem.totalCost + giftedTotalCost,
        grossProfit: lineItem.totalSale - lineItem.totalCost - giftedTotalCost,
        lineItems: [lineItem],
        giftItems,
        giftedProductId: firstGiftItem?.productId,
        giftedQuantity: firstGiftItem?.quantity ?? 0,
        giftedUnitCost: firstGiftItem?.unitCost ?? 0,
        giftedTotalCost,
        returnedQuantity: 0,
        returnedSaleAmount: 0,
        returnedCostAmount: 0,
        customerName: input.customerName,
        customerPhone: normalizedCustomerPhone,
        notes: input.notes,
        responsibleUser: input.responsibleUser,
      };
      batch.set(doc(db, 'sales', sale.id), {
        ...sale,
        lineItems: sale.lineItems.map((item) => ({
          ...item,
          variantId: item.variantId ?? null,
          variantName: item.variantName ?? null,
        })),
        giftItems: sale.giftItems.map((item) => ({
          ...item,
          kind: item.kind ?? 'gift',
        })),
        variantId: lineItem.variantId ?? null,
        variantName: lineItem.variantName ?? null,
        giftedProductId: sale.giftedProductId ?? null,
        soldAt: Timestamp.fromDate(new Date(input.soldAt)),
      });
      const movementRef = doc(collection(db, 'movements'));
      batch.set(movementRef, {
        id: movementRef.id,
        saleId: sale.id,
        productId: lineItem.productId,
        variantId: lineItem.variantId ?? null,
        variantName: lineItem.variantName ?? null,
        type: 'exit',
        reason: 'sale',
        quantity: -Math.abs(lineItem.quantity),
        notes: input.notes || `Venta registrada${input.customerName ? ` para ${input.customerName}` : ''}`,
        occurredAt: Timestamp.fromDate(new Date(input.soldAt)),
        responsibleUser: input.responsibleUser,
        relatedUnitCost: lineItem.realUnitCost,
      });
      batch.set(doc(db, 'inventory_movements', movementRef.id), {
        id: movementRef.id,
        saleId: sale.id,
        productId: lineItem.productId,
        variantId: lineItem.variantId ?? null,
        variantName: lineItem.variantName ?? null,
        sourceType: 'sale',
        sourceId: saleBatchId,
        type: 'exit',
        reason: 'sale',
        quantity: -Math.abs(lineItem.quantity),
        notes: input.notes || `Venta registrada${input.customerName ? ` para ${input.customerName}` : ''}`,
        occurredAt: Timestamp.fromDate(new Date(input.soldAt)),
        responsibleUser: input.responsibleUser,
        relatedUnitCost: lineItem.realUnitCost,
      });
      stockDeltas.push({ productId: lineItem.productId, quantity: -Math.abs(lineItem.quantity) });

      giftItems.forEach((giftItem) => {
        const giftMovementRef = doc(collection(db, 'movements'));
        batch.set(giftMovementRef, {
          id: giftMovementRef.id,
          saleId: sale.id,
          productId: giftItem.productId,
          type: 'exit',
          reason: 'gift',
          quantity: -Math.abs(giftItem.quantity),
          notes:
            input.notes ||
            `Obsequio asociado a ${targetProductName(baseProducts, lineItem.productId)}${input.customerName ? ` para ${input.customerName}` : ''}`,
          occurredAt: Timestamp.fromDate(new Date(input.soldAt)),
          responsibleUser: input.responsibleUser,
          relatedUnitCost: giftItem.unitCost,
        });
        batch.set(doc(db, 'inventory_movements', giftMovementRef.id), {
          id: giftMovementRef.id,
          saleId: sale.id,
          productId: giftItem.productId,
          sourceType: 'sale-gift',
          sourceId: sale.id,
          type: 'exit',
          reason: 'gift',
          quantity: -Math.abs(giftItem.quantity),
          notes:
            input.notes ||
            `Obsequio asociado a ${targetProductName(baseProducts, lineItem.productId)}${input.customerName ? ` para ${input.customerName}` : ''}`,
          occurredAt: Timestamp.fromDate(new Date(input.soldAt)),
          responsibleUser: input.responsibleUser,
          relatedUnitCost: giftItem.unitCost,
        });
        stockDeltas.push({ productId: giftItem.productId, quantity: -Math.abs(giftItem.quantity) });
      });

      return sale;
    });

    lineRecords.forEach(({ lineItem, serviceItems, targetProduct }, index) => {
      if (serviceItems.length === 0) return;

      const linkedSale = createdSales[index];
      serviceItems.forEach((serviceItem) => {
        const serviceRef = doc(collection(db, 'services'));
        const service: ServiceOrder = {
          id: serviceRef.id,
          serviceType: serviceItem.serviceType,
          serviceCategory: serviceItem.serviceCategory,
          source: 'sale-addon',
          saleId: linkedSale.id,
          saleBatchId,
          performedAt: input.soldAt,
          customerName: input.customerName,
          cueReference: serviceItem.cueReference,
          servicePrice: serviceItem.price,
          totalRevenue: serviceItem.price,
          totalMaterialCost: 0,
          totalOperationalCost: serviceItem.cost,
          totalCost: serviceItem.cost,
          grossProfit: serviceItem.price - serviceItem.cost,
          materials: [],
          notes:
            serviceItem.notes ||
            `Servicio asociado a la venta de ${targetProduct.name}${input.customerName ? ` para ${input.customerName}` : ''}`,
          responsibleUser: input.responsibleUser,
        };

        batch.set(doc(db, 'services', service.id), {
          ...service,
          serviceCategory: service.serviceCategory ?? null,
          source: service.source ?? 'sale-addon',
          saleId: service.saleId ?? null,
          saleBatchId: service.saleBatchId ?? null,
          performedAt: Timestamp.fromDate(new Date(input.soldAt)),
        });
      });
    });

    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(
        baseMovements,
        stockDeltas.map((item) => item.productId),
        stockDeltas
      )
    );
    applyVariantStockMapToBatch(batch, variantStockMap, baseProducts);

    if (input.actorRole === 'sales') {
      const soldUnits = createdSales.reduce((sum, sale) => sum + sale.quantity, 0);
      queueAdminNotification(batch, {
        title: 'Nueva venta registrada',
        message: `${input.responsibleUser} registro ${createdSales.length} item(s) para ${input.customerName || 'cliente'} por ${soldUnits} unidad(es).`,
        href: '/dashboard/ventas',
        createdAt: input.soldAt,
      });
    }

    await batch.commit();

    return createdSales;
  };

  const registerSale = async (input: RegisterSaleInput) => {
    return registerSaleInternal(input, movements);
  };

  const updateSaleBatch = async (saleBatchId: string, input: RegisterSaleInput) => {
    const existingSales = sales.filter((sale) => (sale.saleBatchId ?? sale.id) === saleBatchId);
    if (existingSales.length === 0) {
      throw new Error('No se encontro la venta a editar.');
    }
    const giftMovementsToUpdate = existingSales.flatMap((sale) => findGiftMovementForSale(movements, sale));
    const linkedServiceOrders = services.filter(
      (service) => service.source === 'sale-addon' && service.saleBatchId === saleBatchId
    );
    const restoredProducts = products.map((product) => {
      const variantRestorations = new Map<string, number>();
      existingSales.forEach((sale) => {
        sale.lineItems
          .filter((item) => item.productId === product.id && item.variantId)
          .forEach((item) => {
            variantRestorations.set(
              item.variantId!,
              (variantRestorations.get(item.variantId!) ?? 0) + item.quantity
            );
          });
      });

      if (variantRestorations.size === 0) {
        return product;
      }

      return {
        ...product,
        variants: (product.variants ?? []).map((variant) => ({
          ...variant,
          stock: variant.stock + (variantRestorations.get(variant.id) ?? 0),
        })),
      };
    });
    const requestedGiftTotals = new Map<string, number>();
    const nextLineRecords = input.items.map((item) => {
      const targetProduct = restoredProducts.find((product) => product.id === item.productId);
      if (!targetProduct) {
        throw new Error('No se encontro uno de los productos para actualizar la venta.');
      }
      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (quantity <= 0) {
        throw new Error('La cantidad vendida debe ser mayor a cero.');
      }
      const realUnitCost = getProductRealUnitCost(purchases, item.productId);
      const selectedVariant = getProductVariantById(targetProduct, item.variantId);
      if ((targetProduct.variants?.length ?? 0) > 0 && !selectedVariant) {
        throw new Error(`Selecciona la opcion disponible de ${targetProduct.name}.`);
      }
      const lineItem: SaleLineItem = {
        productId: item.productId,
        variantId: selectedVariant?.id,
        variantName: selectedVariant?.name,
        quantity,
        unitPrice: Number(item.unitPrice ?? 0),
        realUnitCost,
        totalSale: quantity * Number(item.unitPrice ?? 0),
        totalCost: quantity * realUnitCost,
      };

      const giftItems = buildSaleGiftItems(item, targetProduct, restoredProducts, purchases, movements);
      giftItems.forEach((giftItem) => {
        requestedGiftTotals.set(giftItem.productId, (requestedGiftTotals.get(giftItem.productId) ?? 0) + giftItem.quantity);
      });

      return { lineItem, giftItems };
    });

    const touchedProductIds = new Set<string>([
      ...existingSales.flatMap((sale) => sale.lineItems.map((item) => item.productId)),
      ...nextLineRecords.map((record) => record.lineItem.productId),
      ...existingSales.flatMap((sale) => sale.giftItems.map((item) => item.productId)),
      ...nextLineRecords.flatMap((record) => record.giftItems.map((item) => item.productId)),
    ].filter((value): value is string => Boolean(value)));

    for (const productId of touchedProductIds) {
      const restoredStock =
        getProductStock(movements, productId) +
        existingSales
          .flatMap((sale) => sale.lineItems)
          .filter((item) => item.productId === productId)
          .reduce((sum, item) => sum + item.quantity, 0) +
        existingSales
          .flatMap((sale) => sale.giftItems)
          .filter((item) => item.productId === productId)
          .reduce((sum, item) => sum + item.quantity, 0);
      const requestedStock =
        nextLineRecords
          .filter((record) => record.lineItem.productId === productId)
          .reduce((sum, record) => sum + record.lineItem.quantity, 0) +
        (requestedGiftTotals.get(productId) ?? 0);

      if (requestedStock > restoredStock) {
        throw new Error(
          requestedGiftTotals.has(productId)
            ? 'La cantidad de uno de los obsequios supera el stock disponible.'
            : 'La cantidad vendida supera el stock disponible.'
        );
      }
    }

    const batch = writeBatch(db);
    existingSales.forEach((sale) => batch.delete(doc(db, 'sales', sale.id)));
    linkedServiceOrders.forEach((service) => batch.delete(doc(db, 'services', service.id)));
    movements
      .filter((movement) => existingSales.some((sale) => sale.id === movement.saleId))
      .forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    giftMovementsToUpdate.forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    await batch.commit();

    const remainingMovements = movements.filter(
      (movement) => !existingSales.some((sale) => sale.id === movement.saleId)
    );

    return registerSaleInternal({
      ...input,
      items: nextLineRecords.map((record, index) => ({
        productId: record.lineItem.productId,
        variantId: record.lineItem.variantId,
        variantName: record.lineItem.variantName,
        quantity: record.lineItem.quantity,
        unitPrice: record.lineItem.unitPrice,
        serviceItems: input.items[index]?.serviceItems ?? [],
        giftItems: record.giftItems.map((giftItem) => ({
          productId: giftItem.productId,
          quantity: giftItem.quantity,
        })),
      })),
    }, remainingMovements, restoredProducts, { saleBatchId });
  };

  const registerSaleReturn = async (input: RegisterSaleReturnInput) => {
    const sale = sales.find((item) => item.id === input.saleId);
    if (!sale) {
      throw new Error('No se encontro la venta para registrar la devolucion.');
    }

    const remainingQuantity = sale.quantity - (sale.returnedQuantity ?? 0);
    if (input.quantity <= 0) {
      throw new Error('La cantidad devuelta debe ser mayor a cero.');
    }
    if (input.quantity > remainingQuantity) {
      throw new Error('La cantidad a devolver supera lo pendiente de esa venta.');
    }

    const returnedSaleAmount = input.quantity * sale.unitPrice;
    const returnedCostAmount = input.quantity * sale.realUnitCost;
    const nextReturnedQuantity = (sale.returnedQuantity ?? 0) + input.quantity;
    const nextReturnedSaleAmount = (sale.returnedSaleAmount ?? 0) + returnedSaleAmount;
    const nextReturnedCostAmount = (sale.returnedCostAmount ?? 0) + returnedCostAmount;

    const movementRef = doc(collection(db, 'movements'));
    const batch = writeBatch(db);
    batch.update(doc(db, 'sales', sale.id), {
      returnedQuantity: nextReturnedQuantity,
      returnedSaleAmount: nextReturnedSaleAmount,
      returnedCostAmount: nextReturnedCostAmount,
    });
    batch.set(movementRef, {
      id: movementRef.id,
      saleId: sale.id,
      productId: sale.productId,
      variantId: sale.lineItems[0]?.variantId ?? null,
      variantName: sale.lineItems[0]?.variantName ?? null,
      type: 'entry',
      reason: 'return',
      quantity: Math.abs(input.quantity),
      notes: input.notes || `Devolucion registrada de ${sale.customerName || 'cliente'}`,
      occurredAt: Timestamp.fromDate(new Date(input.returnedAt)),
      responsibleUser: input.responsibleUser,
      relatedUnitCost: sale.realUnitCost,
    });
    batch.set(doc(db, 'inventory_movements', movementRef.id), {
      id: movementRef.id,
      saleId: sale.id,
      productId: sale.productId,
      variantId: sale.lineItems[0]?.variantId ?? null,
      variantName: sale.lineItems[0]?.variantName ?? null,
      sourceType: 'sale-return',
      sourceId: sale.id,
      type: 'entry',
      reason: 'return',
      quantity: Math.abs(input.quantity),
      notes: input.notes || `Devolucion registrada de ${sale.customerName || 'cliente'}`,
      occurredAt: Timestamp.fromDate(new Date(input.returnedAt)),
      responsibleUser: input.responsibleUser,
      relatedUnitCost: sale.realUnitCost,
    });
    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(movements, [sale.productId], [
        { productId: sale.productId, quantity: Math.abs(input.quantity) },
      ])
    );
    if (sale.lineItems[0]?.variantId) {
      const variantStockMap = buildVariantStockMap(products);
      const productVariantMap = variantStockMap.get(sale.productId);
      const currentVariantStock = productVariantMap?.get(sale.lineItems[0].variantId!) ?? 0;
      productVariantMap?.set(sale.lineItems[0].variantId!, currentVariantStock + Math.abs(input.quantity));
      applyVariantStockMapToBatch(batch, variantStockMap, products);
    }

    await batch.commit();

    return {
      ...sale,
      returnedQuantity: nextReturnedQuantity,
      returnedSaleAmount: nextReturnedSaleAmount,
      returnedCostAmount: nextReturnedCostAmount,
    };
  };

  const registerSaleReturns = async (input: RegisterSaleReturnBatchInput) => {
    if (input.items.length === 0) {
      throw new Error('Agrega al menos un producto para devolver.');
    }

    const requestedReturns = input.items
      .map((item) => ({
        saleId: item.saleId,
        quantity: Math.max(Number(item.quantity ?? 0), 0),
      }))
      .filter((item) => item.quantity > 0);

    if (requestedReturns.length === 0) {
      throw new Error('Ingresa al menos una cantidad valida para devolver.');
    }

    const saleMap = new Map<string, Sale>();
    requestedReturns.forEach((item) => {
      if (saleMap.has(item.saleId)) {
        throw new Error('No repitas el mismo producto en la devolucion.');
      }
      const sale = sales.find((current) => current.id === item.saleId);
      if (!sale) {
        throw new Error('No se encontro una de las ventas para registrar la devolucion.');
      }
      const remainingQuantity = sale.quantity - (sale.returnedQuantity ?? 0);
      if (item.quantity > remainingQuantity) {
        throw new Error('La cantidad a devolver supera lo pendiente de uno de los productos.');
      }
      saleMap.set(item.saleId, sale);
    });

    const batch = writeBatch(db);
    const stockDeltas: Array<{ productId: string; quantity: number }> = [];
    const updatedSales: Sale[] = [];

    requestedReturns.forEach((item) => {
      const sale = saleMap.get(item.saleId);
      if (!sale) return;

      const returnedSaleAmount = item.quantity * sale.unitPrice;
      const returnedCostAmount = item.quantity * sale.realUnitCost;
      const nextReturnedQuantity = (sale.returnedQuantity ?? 0) + item.quantity;
      const nextReturnedSaleAmount = (sale.returnedSaleAmount ?? 0) + returnedSaleAmount;
      const nextReturnedCostAmount = (sale.returnedCostAmount ?? 0) + returnedCostAmount;

      batch.update(doc(db, 'sales', sale.id), {
        returnedQuantity: nextReturnedQuantity,
        returnedSaleAmount: nextReturnedSaleAmount,
        returnedCostAmount: nextReturnedCostAmount,
      });

      const movementRef = doc(collection(db, 'movements'));
      batch.set(movementRef, {
        id: movementRef.id,
        saleId: sale.id,
        productId: sale.productId,
        variantId: sale.lineItems[0]?.variantId ?? null,
        variantName: sale.lineItems[0]?.variantName ?? null,
        type: 'entry',
        reason: 'return',
        quantity: Math.abs(item.quantity),
        notes: input.notes || `Devolucion registrada de ${sale.customerName || 'cliente'}`,
        occurredAt: Timestamp.fromDate(new Date(input.returnedAt)),
        responsibleUser: input.responsibleUser,
        relatedUnitCost: sale.realUnitCost,
      });
      batch.set(doc(db, 'inventory_movements', movementRef.id), {
        id: movementRef.id,
        saleId: sale.id,
        productId: sale.productId,
        variantId: sale.lineItems[0]?.variantId ?? null,
        variantName: sale.lineItems[0]?.variantName ?? null,
        sourceType: 'sale-return',
        sourceId: sale.id,
        type: 'entry',
        reason: 'return',
        quantity: Math.abs(item.quantity),
        notes: input.notes || `Devolucion registrada de ${sale.customerName || 'cliente'}`,
        occurredAt: Timestamp.fromDate(new Date(input.returnedAt)),
        responsibleUser: input.responsibleUser,
        relatedUnitCost: sale.realUnitCost,
      });

      stockDeltas.push({ productId: sale.productId, quantity: Math.abs(item.quantity) });
      updatedSales.push({
        ...sale,
        returnedQuantity: nextReturnedQuantity,
        returnedSaleAmount: nextReturnedSaleAmount,
        returnedCostAmount: nextReturnedCostAmount,
      });
    });

    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(
        movements,
        stockDeltas.map((item) => item.productId),
        stockDeltas
      )
    );
    const variantStockMap = buildVariantStockMap(products);
    updatedSales.forEach((sale) => {
      const variantId = sale.lineItems[0]?.variantId;
      if (!variantId) return;
      const productVariantMap = variantStockMap.get(sale.productId);
      const currentVariantStock = productVariantMap?.get(variantId) ?? 0;
      const restoredQuantity =
        requestedReturns.find((item) => item.saleId === sale.id)?.quantity ?? 0;
      productVariantMap?.set(variantId, currentVariantStock + Math.abs(restoredQuantity));
    });
    applyVariantStockMapToBatch(batch, variantStockMap, products);

    await batch.commit();

    return updatedSales;
  };

  const registerService = async (input: RegisterServiceInput) => {
    if ((Number(input.servicePrice) || 0) <= 0) {
      throw new Error('El valor del servicio debe ser mayor a cero.');
    }

    const directServiceCost = Math.max(Number(input.serviceCost ?? 0), 0);
    if (input.materials.length === 0 && directServiceCost <= 0) {
      throw new Error('Agrega materiales o un costo para registrar el servicio.');
    }

    const materialMap = new Map<string, number>();
    input.materials.forEach((item) => {
      const productId = item.productId?.trim();
      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (!productId) {
        throw new Error('Selecciona todos los productos usados en el servicio.');
      }
      if (quantity <= 0) {
        throw new Error('La cantidad de cada producto consumido debe ser mayor a cero.');
      }
      materialMap.set(productId, (materialMap.get(productId) ?? 0) + quantity);
    });

    const materials: ServiceMaterialItem[] = Array.from(materialMap.entries()).map(([productId, quantity]) => {
      const product = products.find((item) => item.id === productId);
      if (!product) {
        throw new Error('Uno de los productos del servicio no existe en el inventario.');
      }

      const availableStock = getProductStock(movements, productId);
      if (quantity > availableStock) {
        throw new Error(`La cantidad usada supera el stock disponible de ${product.name}.`);
      }

      const unitCost = getProductRealUnitCost(purchases, productId);
      return {
        productId,
        quantity,
        unitCost,
        totalCost: quantity * unitCost,
      };
    });

    const serviceRef = doc(collection(db, 'services'));
    const totalMaterialCost = materials.reduce((sum, item) => sum + item.totalCost, 0);
    const totalRevenue = Number(input.servicePrice) || 0;
    const totalCost = totalMaterialCost + directServiceCost;
    const grossProfit = totalRevenue - totalCost;
    const service: ServiceOrder = {
      id: serviceRef.id,
      serviceType: input.serviceType,
      serviceCategory: input.serviceCategory?.trim() || undefined,
      source: input.source === 'sale-addon' ? 'sale-addon' : 'standalone',
      saleId: input.saleId?.trim() || undefined,
      saleBatchId: input.saleBatchId?.trim() || undefined,
      performedAt: input.performedAt,
      customerName: input.customerName,
      cueReference: input.cueReference,
      servicePrice: totalRevenue,
      totalRevenue,
      totalMaterialCost,
      totalOperationalCost: directServiceCost,
      totalCost,
      grossProfit,
      materials,
      notes: input.notes,
      responsibleUser: input.responsibleUser,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'services', service.id), {
      ...service,
      serviceCategory: service.serviceCategory ?? null,
      source: service.source ?? 'standalone',
      saleId: service.saleId ?? null,
      saleBatchId: service.saleBatchId ?? null,
      performedAt: Timestamp.fromDate(new Date(input.performedAt)),
    });

    const stockDeltas: Array<{ productId: string; quantity: number }> = [];
    materials.forEach((material) => {
      const movementRef = doc(collection(db, 'movements'));
      batch.set(movementRef, {
        id: movementRef.id,
        serviceOrderId: service.id,
        productId: material.productId,
        type: 'exit',
        reason: 'service',
        quantity: -Math.abs(material.quantity),
        notes:
          input.notes ||
          `Consumo por servicio para ${input.customerName || 'cliente'}${input.cueReference ? ` - ${input.cueReference}` : ''}`,
        occurredAt: Timestamp.fromDate(new Date(input.performedAt)),
        responsibleUser: input.responsibleUser,
        relatedUnitCost: material.unitCost,
      });
      stockDeltas.push({ productId: material.productId, quantity: -Math.abs(material.quantity) });
    });

    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(
        movements,
        stockDeltas.map((item) => item.productId),
        stockDeltas
      )
    );

    if (input.actorRole === 'sales') {
      queueAdminNotification(batch, {
        title: 'Nuevo servicio registrado',
        message: `${input.responsibleUser} registro ${input.customerName || 'un cliente'} en ${input.serviceType}.`,
        href: '/dashboard/servicios',
        createdAt: input.performedAt,
      });
    }

    await batch.commit();
    return service;
  };

  const createAuthorizationRequest = async (input: CreateAuthorizationRequestInput) => {
    const trimmedReason = input.reason.trim();
    if (!trimmedReason) {
      throw new Error('Escribe el motivo de la solicitud para que el administrador pueda revisarla.');
    }

    const duplicateRequest = authorizationRequests.find(
      (request) =>
        request.saleBatchId === input.saleBatchId &&
        request.requestType === input.requestType &&
        (request.status === 'pending' || request.status === 'approved')
    );

    if (duplicateRequest) {
      throw new Error(
        duplicateRequest.status === 'approved'
          ? 'Ya existe una autorizacion aprobada para esta accion.'
          : 'Ya existe una solicitud pendiente para esta accion.'
      );
    }

    const createdAt = new Date().toISOString();
    const requestRef = doc(collection(db, 'authorization-requests'));
    const request: AuthorizationRequest = {
      id: requestRef.id,
      saleId: input.saleId,
      saleBatchId: input.saleBatchId,
      requestType: input.requestType,
      status: 'pending',
      customerName: input.customerName,
      saleSummary: input.saleSummary,
      reason: trimmedReason,
      requestedBy: input.requestedBy,
      requestedByRole: input.requestedByRole,
      reviewedBy: '',
      reviewNote: '',
      createdAt,
      updatedAt: createdAt,
    };

    const batch = writeBatch(db);
    batch.set(requestRef, {
      ...request,
      createdAt: Timestamp.fromDate(new Date(createdAt)),
      updatedAt: Timestamp.fromDate(new Date(createdAt)),
    });

    queueAdminNotification(batch, {
      title:
        input.requestType === 'sale-return'
          ? 'Solicitud de devolucion'
          : 'Solicitud de edicion de venta',
      message: `${input.requestedBy} solicito autorizacion para ${input.customerName || 'cliente'}.`,
      href: '/dashboard/autorizaciones',
      createdAt,
    });

    await batch.commit();
    return request;
  };

  const reviewAuthorizationRequest = async (
    requestId: string,
    input: ReviewAuthorizationRequestInput
  ) => {
    const request = authorizationRequests.find((item) => item.id === requestId);
    if (!request) {
      throw new Error('No se encontro la solicitud a revisar.');
    }
    if (request.status !== 'pending') {
      throw new Error('Solo se pueden revisar solicitudes pendientes.');
    }

    const updatedAt = new Date().toISOString();
    await updateDoc(doc(db, 'authorization-requests', requestId), {
      status: input.status,
      reviewNote: input.reviewNote.trim(),
      reviewedBy: input.reviewedBy,
      reviewedAt: Timestamp.fromDate(new Date(updatedAt)),
      updatedAt: Timestamp.fromDate(new Date(updatedAt)),
    });

    return {
      ...request,
      status: input.status,
      reviewNote: input.reviewNote.trim(),
      reviewedBy: input.reviewedBy,
      reviewedAt: updatedAt,
      updatedAt,
    };
  };

  const completeAuthorizationRequest = async (
    input: CompleteAuthorizationRequestInput
  ): Promise<AuthorizationRequest> => {
    const request = authorizationRequests.find((item) => item.id === input.requestId);
    if (!request) {
      throw new Error('No se encontro la autorizacion usada para esta accion.');
    }
    if (request.status !== 'approved') {
      throw new Error('La autorizacion ya no esta disponible para usarse.');
    }

    const completedAt = new Date().toISOString();
    await updateDoc(doc(db, 'authorization-requests', input.requestId), {
      status: 'completed',
      reviewedBy: request.reviewedBy || input.completedBy,
      completedAt: Timestamp.fromDate(new Date(completedAt)),
      updatedAt: Timestamp.fromDate(new Date(completedAt)),
    });

    return {
      ...request,
      status: 'completed' as AuthorizationRequestStatus,
      reviewedBy: request.reviewedBy || input.completedBy,
      completedAt,
      updatedAt: completedAt,
    };
  };

  const summary = useMemo(
    () => getDashboardSummary(products, movements, purchases, sales, services),
    [movements, products, purchases, sales, services]
  );
  const latestMovements = useMemo(() => getLatestMovements(movements), [movements]);

  return (
    <AdminDataContext.Provider
      value={{
        loading,
        categories,
        products,
        suppliers,
        movements,
        purchases,
        sales,
        services,
        authorizationRequests,
        summary,
        latestMovements,
        getOperationalResetSummary,
        exportOperationalResetSnapshot,
        runOperationalReset,
        syncPublicProductStocks,
        createCategory,
        updateCategory,
        deleteCategory,
        createSubcategory,
        updateSubcategory,
        deleteSubcategory,
        createProduct,
        updateProduct,
        deleteProduct,
        createSupplier,
        updateSupplier,
        deleteSupplier,
        registerMovement,
        registerInitialStock,
        registerPurchase,
        updatePurchase,
        updatePurchaseBatch,
        deletePurchase,
        deletePurchaseBatch,
        registerSale,
        updateSaleBatch,
        registerSaleReturn,
        registerSaleReturns,
        registerService,
        createAuthorizationRequest,
        reviewAuthorizationRequest,
        completeAuthorizationRequest,
      }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error('useAdminData debe usarse dentro de AdminDataProvider');
  }

  return context;
}
