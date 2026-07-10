'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
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
  type QuerySnapshot,
} from 'firebase/firestore';
import {
  calculateMargin,
  calculatePurchaseTotals,
  getDashboardSummary,
  getLatestMovements,
  getProductRealUnitCost,
  getStoredProductStock,
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
  getVariantSalePrice,
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
  Customer,
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
  ServiceVisit,
  ServiceVisitStatus,
  Supplier,
  UserRole,
} from '@/lib/admin/types';

type ProductMutationInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'publicStock'> & {
  historyVariantName?: string;
};
type NewProductInput = ProductMutationInput;
type NewSupplierInput = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>;
type CustomerMutationInput = {
  fullName: string;
  phone?: string;
  documentNumber?: string;
};
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

// Keep sales payment fields disabled in UI/flow for now, but easy to re-enable later.
const SALES_PAYMENT_FIELDS_ENABLED = false;
const SERVICES_PAYMENT_FIELDS_ENABLED = false;

interface RegisterMovementInput {
  productId: string;
  variantId?: string;
  variantName?: string;
  type: MovementType;
  reason: MovementReason;
  quantity: number;
  occurredAt?: string;
  notes: string;
  responsibleUser: string;
  relatedUnitCost?: number;
  customerName?: string;
  customerPhone?: string;
  giftReason?: string;
  giftTotalCost?: number;
}

interface RegisterPurchaseInput {
  supplierId?: string;
  supplier: string;
  purchasedAt: string;
  discountPercent?: number;
  shippingValueTotal: number;
  purchaseType?: 'local' | 'international';
  internationalVendorName?: string;
  productsValueUsd?: number;
  shippingValueUsd?: number;
  platformFeePercent?: number;
  usdToCopRate?: number;
  customsTaxCop?: number;
  items: Array<{
    productId: string;
    variantId?: string;
    variantName?: string;
    presentationQuantity: number;
    purchaseUnitValue: number;
    purchaseUnitValueUsd?: number;
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

interface RegisterInitialStockBatchInput {
  productId: string;
  occurredAt: string;
  notes: string;
  responsibleUser: string;
  items: Array<{
    variantId?: string;
    variantName?: string;
    quantity: number;
    estimatedUnitCost: number;
    suggestedSalePrice?: number;
  }>;
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
  customerDocument?: string;
  paymentMethod?: string;
  paymentReference?: string;
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
  serviceLabel?: string;
  serviceCategory?: string;
  performedAt: string;
  customerName: string;
  cueReference: string;
  paymentMethod: string;
  paymentReference?: string;
  servicePrice: number;
  serviceCost?: number;
  materials: Array<{
    productId: string;
    variantId?: string;
    variantName?: string;
    quantity: number;
  }>;
  notes: string;
  responsibleUser: string;
  actorRole?: UserRole;
  source?: 'standalone' | 'sale-addon';
  saleId?: string;
  saleBatchId?: string;
}

interface CreateServiceVisitInput {
  customerName: string;
  customerPhone?: string;
  cueReference: string;
  scheduledAt: string;
  address?: string;
  zone?: string;
  logisticsNotes?: string;
  createdBy: string;
}

interface AssignServiceVisitInput {
  technicianId: string;
  technicianName: string;
  assignedBy: string;
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
  draftSalePayload?: AuthorizationRequest['draftSalePayload'];
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
  customers: Customer[];
  services: ServiceOrder[];
  serviceVisits: ServiceVisit[];
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
  createCustomer: (input: CustomerMutationInput) => Promise<Customer>;
  updateCustomer: (customerId: string, input: CustomerMutationInput) => Promise<Customer>;
  registerMovement: (input: RegisterMovementInput) => Promise<InventoryMovement>;
  registerInitialStock: (input: RegisterInitialStockInput) => Promise<{
    movement: InventoryMovement;
    purchase: Purchase;
  }>;
  registerInitialStockBatch: (input: RegisterInitialStockBatchInput) => Promise<{
    movements: InventoryMovement[];
    purchases: Purchase[];
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
  updateService: (serviceId: string, input: RegisterServiceInput) => Promise<ServiceOrder>;
  createServiceVisit: (input: CreateServiceVisitInput) => Promise<ServiceVisit>;
  assignServiceVisit: (visitId: string, input: AssignServiceVisitInput) => Promise<ServiceVisit>;
  startServiceVisit: (visitId: string) => Promise<ServiceVisit>;
  completeServiceVisit: (visitId: string, serviceOrderId: string) => Promise<ServiceVisit>;
  cancelServiceVisit: (visitId: string, reason: string) => Promise<ServiceVisit>;
  createAuthorizationRequest: (input: CreateAuthorizationRequestInput) => Promise<AuthorizationRequest>;
  reviewAuthorizationRequest: (
    requestId: string,
    input: ReviewAuthorizationRequestInput
  ) => Promise<AuthorizationRequest>;
  completeAuthorizationRequest: (input: CompleteAuthorizationRequestInput) => Promise<AuthorizationRequest>;
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined);

type AdminLiveCollectionKey =
  | 'product_categories'
  | 'products'
  | 'product_variants'
  | 'suppliers'
  | 'movements'
  | 'purchases'
  | 'sales'
  | 'customers'
  | 'services'
  | 'service-visits'
  | 'authorization-requests';

const allAdminLiveCollections: AdminLiveCollectionKey[] = [
  'product_categories',
  'products',
  'product_variants',
  'suppliers',
  'movements',
  'purchases',
  'sales',
  'customers',
  'services',
  'service-visits',
  'authorization-requests',
];

const noAdminLiveCollections: AdminLiveCollectionKey[] = [];

function getAdminLiveCollectionsForPath(pathname: string | null): AdminLiveCollectionKey[] {
  const normalizedPathname = (pathname ?? '').replace(/\/$/, '') || '/dashboard';

  if (normalizedPathname === '/dashboard/web' || normalizedPathname === '/dashboard/usuarios') {
    return noAdminLiveCollections;
  }

  if (normalizedPathname === '/dashboard') {
    return ['products', 'movements', 'purchases', 'sales', 'services', 'authorization-requests'];
  }

  if (normalizedPathname === '/dashboard/compras') {
    return ['products', 'suppliers', 'purchases'];
  }

  if (normalizedPathname === '/dashboard/proveedores') {
    return ['suppliers', 'purchases'];
  }

  if (normalizedPathname === '/dashboard/clientes') {
    return ['customers'];
  }

  if (normalizedPathname === '/dashboard/categorias') {
    return ['product_categories', 'products'];
  }

  if (normalizedPathname === '/dashboard/productos') {
    return ['product_categories', 'products', 'product_variants', 'movements', 'purchases', 'sales', 'services'];
  }

  if (normalizedPathname === '/dashboard/inventario') {
    return ['product_categories', 'products', 'movements', 'purchases', 'sales', 'services'];
  }

  if (normalizedPathname === '/dashboard/ventas') {
    return ['products', 'movements', 'purchases', 'sales', 'customers', 'services', 'authorization-requests'];
  }

  if (normalizedPathname === '/dashboard/servicios') {
    return ['products', 'movements', 'purchases', 'services', 'service-visits'];
  }

  if (normalizedPathname === '/dashboard/reportes') {
    return ['products', 'movements', 'sales', 'services'];
  }

  if (normalizedPathname === '/dashboard/autorizaciones') {
    return ['products', 'movements', 'purchases', 'sales', 'authorization-requests'];
  }

  return allAdminLiveCollections;
}

const ANONYMOUS_CUSTOMER_NAME = 'Cliente NN';

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

function normalizeCustomerName(value: string) {
  const trimmedValue = value.trim().replace(/\s+/g, ' ');
  if (!trimmedValue) return ANONYMOUS_CUSTOMER_NAME;
  if (trimmedValue.toLowerCase() === 'cliente mostrador') return ANONYMOUS_CUSTOMER_NAME;
  return trimmedValue;
}

function isAnonymousCustomerName(value: string) {
  return normalizeCustomerName(value).toLowerCase() === ANONYMOUS_CUSTOMER_NAME.toLowerCase();
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildCustomerId(name: string, phone: string, documentNumber: string) {
  const normalizedDocument = documentNumber.replace(/\D/g, '');
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedName = normalizeSearchText(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalizedDocument) return `doc-${normalizedDocument}`;
  return normalizedPhone ? `phone-${normalizedPhone}` : `name-${normalizedName || 'cliente'}`;
}

function normalizeCustomerMutationInput(input: CustomerMutationInput) {
  const fullName = normalizeCustomerName(input.fullName);
  const phone = input.phone?.trim() ?? '';
  const documentNumber = input.documentNumber?.trim() ?? '';

  if (isAnonymousCustomerName(fullName)) {
    throw new Error('Ingresa un nombre real para crear el cliente.');
  }
  if (phone && phone.length < 7) {
    throw new Error('Ingresa un telefono valido o dejalo vacio.');
  }

  return { fullName, phone, documentNumber };
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
    if (giftQuantity > Math.max(Number(item.quantity ?? 0), 0)) {
      throw new Error(`La cantidad del obsequio no puede superar la cantidad vendida de ${targetProduct.name}.`);
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

function serializePurchaseForFirestore(purchase: Purchase) {
  return {
    ...purchase,
    variantId: purchase.variantId ?? null,
    variantName: purchase.variantName ?? null,
    supplierId: purchase.supplierId ?? null,
    purchaseBatchId: purchase.purchaseBatchId ?? null,
    source: purchase.source ?? null,
    purchaseUnitValueUsd: purchase.purchaseUnitValueUsd ?? null,
    purchaseGrossValueTotal: purchase.purchaseGrossValueTotal ?? purchase.purchaseValueTotal,
    purchaseDiscountPercent: purchase.purchaseDiscountPercent ?? null,
    purchaseDiscountTotal: purchase.purchaseDiscountTotal ?? null,
    purchaseType: purchase.purchaseType ?? 'local',
    internationalVendorName: purchase.internationalVendorName ?? null,
    productsValueUsd: purchase.productsValueUsd ?? null,
    shippingValueUsd: purchase.shippingValueUsd ?? null,
    platformFeePercent: purchase.platformFeePercent ?? null,
    platformFeeUsd: purchase.platformFeeUsd ?? null,
    usdToCopRate: purchase.usdToCopRate ?? null,
    customsTaxCop: purchase.customsTaxCop ?? null,
    internationalChargesCop: purchase.internationalChargesCop ?? null,
    notes: purchase.notes ?? null,
  };
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

function buildVariantStockMap(products: Product[], sourceMovements: InventoryMovement[] = []) {
  void sourceMovements;
  return new Map(
    products.map((product) => [
      product.id,
      new Map(
        (product.variants ?? []).map((variant) => [
          variant.id,
          Math.max(Number(variant.stock ?? variant.publicStock ?? 0), 0),
        ])
      ),
    ])
  );
}

function buildVariantStockMapFromProductState(products: Product[]) {
  return new Map(
    products.map((product) => [
      product.id,
      new Map(
        (product.variants ?? []).map((variant) => [
          variant.id,
          Math.max(Number(variant.stock ?? 0), 0),
        ])
      ),
    ])
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
    customerName: data.customerName ? String(data.customerName) : undefined,
    customerPhone: data.customerPhone ? String(data.customerPhone) : undefined,
    giftReason: data.giftReason ? String(data.giftReason) : undefined,
    giftTotalCost: data.giftTotalCost !== undefined ? Number(data.giftTotalCost ?? 0) : undefined,
  };
}

function serializeMovementForFirestore(movement: InventoryMovement) {
  return {
    ...movement,
    variantId: movement.variantId ?? null,
    variantName: movement.variantName ?? null,
    purchaseId: movement.purchaseId ?? null,
    purchaseBatchId: movement.purchaseBatchId ?? null,
    saleId: movement.saleId ?? null,
    serviceOrderId: movement.serviceOrderId ?? null,
    relatedUnitCost: Number(movement.relatedUnitCost ?? 0),
    customerName: movement.customerName ?? null,
    customerPhone: movement.customerPhone ?? null,
    giftReason: movement.giftReason ?? null,
    giftTotalCost: movement.giftTotalCost ?? null,
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
    purchaseUnitValueUsd: Number(data.purchaseUnitValueUsd ?? 0),
    quantityPurchased: Number(data.quantityPurchased ?? 0),
    purchasePresentation:
      data.purchasePresentation === 'dozen' || data.purchasePresentation === 'box-12'
        ? data.purchasePresentation
        : 'unit',
    conversionFactor: Number(data.conversionFactor ?? 1),
    purchaseGrossValueTotal: Number(data.purchaseGrossValueTotal ?? data.purchaseValueTotal ?? 0),
    purchaseDiscountPercent: Number(data.purchaseDiscountPercent ?? 0),
    purchaseDiscountTotal: Number(data.purchaseDiscountTotal ?? 0),
    purchaseValueTotal: Number(data.purchaseValueTotal ?? 0),
    shippingValueTotal: Number(data.shippingValueTotal ?? 0),
    purchaseType: data.purchaseType === 'international' ? 'international' : 'local',
    internationalVendorName: data.internationalVendorName ? String(data.internationalVendorName) : undefined,
    productsValueUsd: Number(data.productsValueUsd ?? 0),
    shippingValueUsd: Number(data.shippingValueUsd ?? 0),
    platformFeePercent: Number(data.platformFeePercent ?? 0),
    platformFeeUsd: Number(data.platformFeeUsd ?? 0),
    usdToCopRate: Number(data.usdToCopRate ?? 0),
    customsTaxCop: Number(data.customsTaxCop ?? 0),
    internationalChargesCop: Number(data.internationalChargesCop ?? 0),
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
    customerId: data.customerId ? String(data.customerId) : undefined,
    customerName: String(data.customerName ?? ''),
    customerPhone: String(data.customerPhone ?? ''),
    customerDocument: data.customerDocument ? String(data.customerDocument) : undefined,
    paymentMethod: String(data.paymentMethod ?? ''),
    paymentReference: String(data.paymentReference ?? ''),
    notes: String(data.notes ?? ''),
    responsibleUser: String(data.responsibleUser ?? 'Administrador'),
  };
}

function mapCustomerDocument(documentId: string, data: DocumentData): Customer {
  return {
    id: documentId,
    fullName: String(data.fullName ?? ''),
    normalizedName: String(data.normalizedName ?? ''),
    phone: data.phone ? String(data.phone) : undefined,
    documentNumber: data.documentNumber ? String(data.documentNumber) : undefined,
    lastSaleAt: data.lastSaleAt ? normalizeDateValue(data.lastSaleAt) : undefined,
    lastSaleBatchId: data.lastSaleBatchId ? String(data.lastSaleBatchId) : undefined,
    saleCount: Number(data.saleCount ?? 0),
    totalRevenue: Number(data.totalRevenue ?? 0),
    createdAt: data.createdAt ? normalizeDateValue(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? normalizeDateValue(data.updatedAt) : undefined,
  };
}

function mapServiceDocument(documentId: string, data: DocumentData): ServiceOrder {
  const materials: ServiceMaterialItem[] = Array.isArray(data.materials)
    ? data.materials
        .map((item) => ({
          productId: String(item?.productId ?? ''),
          variantId: item?.variantId ? String(item.variantId) : undefined,
          variantName: item?.variantName ? String(item.variantName) : undefined,
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
      data.serviceType === 'ferrule-installation' ||
      data.serviceType === 'tip-ferrule-installation' ||
      data.serviceType === 'extension-installation' ||
      data.serviceType === 'shaft-reduction' ||
      data.serviceType === 'shaft-straightening' ||
      data.serviceType === 'custom-turning'
        ? data.serviceType
        : 'tip-installation',
    serviceLabel: data.serviceLabel ? String(data.serviceLabel) : undefined,
    serviceCategory: data.serviceCategory ? String(data.serviceCategory) : undefined,
    source: data.source === 'sale-addon' ? 'sale-addon' : 'standalone',
    saleId: data.saleId ? String(data.saleId) : undefined,
    saleBatchId: data.saleBatchId ? String(data.saleBatchId) : undefined,
    performedAt: normalizeDateValue(data.performedAt),
    customerName: String(data.customerName ?? ''),
    cueReference: String(data.cueReference ?? ''),
    paymentMethod: String(data.paymentMethod ?? ''),
    paymentReference: String(data.paymentReference ?? ''),
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

function mapServiceVisitDocument(documentId: string, data: DocumentData): ServiceVisit {
  const status: ServiceVisitStatus =
    data.status === 'assigned' ||
    data.status === 'in_progress' ||
    data.status === 'completed' ||
    data.status === 'cancelled'
      ? data.status
      : 'scheduled';

  return {
    id: documentId,
    status,
    customerName: String(data.customerName ?? ''),
    customerPhone: data.customerPhone ? String(data.customerPhone) : undefined,
    cueReference: String(data.cueReference ?? ''),
    scheduledAt: normalizeDateValue(data.scheduledAt),
    address: data.address ? String(data.address) : undefined,
    zone: data.zone ? String(data.zone) : undefined,
    logisticsNotes: String(data.logisticsNotes ?? ''),
    assignedTechnicianId: data.assignedTechnicianId ? String(data.assignedTechnicianId) : undefined,
    assignedTechnicianName: data.assignedTechnicianName ? String(data.assignedTechnicianName) : undefined,
    assignedBy: data.assignedBy ? String(data.assignedBy) : undefined,
    createdBy: String(data.createdBy ?? 'Administrador'),
    createdAt: normalizeDateValue(data.createdAt),
    updatedAt: normalizeDateValue(data.updatedAt),
    startedAt: data.startedAt ? normalizeDateValue(data.startedAt) : undefined,
    completedAt: data.completedAt ? normalizeDateValue(data.completedAt) : undefined,
    cancelledAt: data.cancelledAt ? normalizeDateValue(data.cancelledAt) : undefined,
    cancelledReason: data.cancelledReason ? String(data.cancelledReason) : undefined,
    linkedServiceOrderId: data.linkedServiceOrderId ? String(data.linkedServiceOrderId) : undefined,
  };
}

function serializeServiceMaterials(materials: ServiceMaterialItem[]) {
  return materials.map((material) => ({
    productId: material.productId,
    variantId: material.variantId ?? null,
    variantName: material.variantName ?? null,
    quantity: Number(material.quantity ?? 0),
    unitCost: Number(material.unitCost ?? 0),
    totalCost: Number(material.totalCost ?? 0),
  }));
}

function serializeServiceForFirestore(service: ServiceOrder, performedAt: Timestamp) {
  return {
    id: service.id,
    serviceType: service.serviceType,
    serviceLabel: service.serviceLabel ?? null,
    serviceCategory: service.serviceCategory ?? null,
    source: service.source ?? 'standalone',
    saleId: service.saleId ?? null,
    saleBatchId: service.saleBatchId ?? null,
    performedAt,
    customerName: service.customerName ?? '',
    cueReference: service.cueReference ?? '',
    paymentMethod: service.paymentMethod ?? 'efectivo',
    paymentReference: service.paymentReference ?? null,
    servicePrice: Number(service.servicePrice ?? 0),
    totalRevenue: Number(service.totalRevenue ?? 0),
    totalMaterialCost: Number(service.totalMaterialCost ?? 0),
    totalOperationalCost: Number(service.totalOperationalCost ?? 0),
    totalCost: Number(service.totalCost ?? 0),
    grossProfit: Number(service.grossProfit ?? 0),
    materials: serializeServiceMaterials(service.materials ?? []),
    notes: service.notes ?? '',
    responsibleUser: service.responsibleUser ?? 'Administrador',
  };
}

function mapAuthorizationRequestDocument(documentId: string, data: DocumentData): AuthorizationRequest {
  return {
    id: documentId,
    saleId: String(data.saleId ?? ''),
    saleBatchId: String(data.saleBatchId ?? data.saleId ?? ''),
    requestType:
      data.requestType === 'sale-return'
        ? 'sale-return'
        : data.requestType === 'sale-discount'
          ? 'sale-discount'
          : 'sale-edit',
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
    requestedByRole:
      data.requestedByRole === 'sales'
        ? 'sales'
        : data.requestedByRole === 'superadmin'
          ? 'superadmin'
          : 'admin',
    reviewedBy: String(data.reviewedBy ?? ''),
    reviewNote: String(data.reviewNote ?? ''),
    draftSalePayload: data.draftSalePayload
      ? {
          soldAt: String(data.draftSalePayload.soldAt ?? ''),
          items: Array.isArray(data.draftSalePayload.items)
            ? data.draftSalePayload.items.map((item: DocumentData) => ({
                productId: String(item?.productId ?? ''),
                variantId: item?.variantId ? String(item.variantId) : undefined,
                variantName: item?.variantName ? String(item.variantName) : undefined,
                quantity: Number(item?.quantity ?? 0),
                unitPrice: Number(item?.unitPrice ?? 0),
                serviceItems: Array.isArray(item?.serviceItems)
                  ? item.serviceItems.map((serviceItem: DocumentData) => ({
                      serviceType:
                        serviceItem?.serviceType === 'tip-ferrule-installation' ||
                        serviceItem?.serviceType === 'extension-installation' ||
                        serviceItem?.serviceType === 'ferrule-installation' ||
                        serviceItem?.serviceType === 'shaft-reduction' ||
                        serviceItem?.serviceType === 'shaft-straightening' ||
                        serviceItem?.serviceType === 'custom-turning'
                          ? serviceItem.serviceType
                          : 'tip-installation',
                      serviceCategory: String(serviceItem?.serviceCategory ?? 'torno'),
                      price: Number(serviceItem?.price ?? 0),
                      cost: Number(serviceItem?.cost ?? 0),
                      cueReference: String(serviceItem?.cueReference ?? ''),
                      notes: String(serviceItem?.notes ?? ''),
                      materials: Array.isArray(serviceItem?.materials)
                        ? serviceItem.materials.map((material: DocumentData) => ({
                            productId: String(material?.productId ?? ''),
                            variantId: material?.variantId ? String(material.variantId) : undefined,
                            variantName: material?.variantName ? String(material.variantName) : undefined,
                            quantity: Number(material?.quantity ?? 0),
                          }))
                        : [],
                    }))
                  : [],
                giftItems: Array.isArray(item?.giftItems)
                  ? item.giftItems.map((giftItem: DocumentData) => ({
                      productId: String(giftItem?.productId ?? ''),
                      quantity: Number(giftItem?.quantity ?? 0),
                    }))
                  : [],
              }))
            : [],
          customerName: String(data.draftSalePayload.customerName ?? ''),
          customerPhone: String(data.draftSalePayload.customerPhone ?? ''),
          customerDocument: data.draftSalePayload.customerDocument
            ? String(data.draftSalePayload.customerDocument)
            : undefined,
          paymentMethod: data.draftSalePayload.paymentMethod
            ? String(data.draftSalePayload.paymentMethod)
            : undefined,
          paymentReference: data.draftSalePayload.paymentReference
            ? String(data.draftSalePayload.paymentReference)
            : undefined,
          notes: String(data.draftSalePayload.notes ?? ''),
          responsibleUser: String(data.draftSalePayload.responsibleUser ?? 'Usuario de ventas'),
          actorRole:
            data.draftSalePayload.actorRole === 'superadmin'
              ? 'superadmin'
              : data.draftSalePayload.actorRole === 'admin'
                ? 'admin'
                : 'sales',
        }
      : undefined,
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
  const nextVariantsById = new Map(nextVariants.map((variant) => [variant.id, variant]));

  if (nextVariants.length < currentVariants.length) return true;

  for (const currentVariant of currentVariants) {
    const nextVariant = nextVariantsById.get(currentVariant.id);

    if (!nextVariant) return true;
    // Existing variant IDs are the stable inventory key. Allow correcting visible
    // attribute/name typos such as "Balnco" -> "Blanco" without treating it as a
    // structural migration, as long as rows, IDs, stock and status are preserved.
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

function resetVariantInventoryState(variants: ProductVariant[]) {
  return variants.map((variant) => ({
    ...variant,
    latestUnitCost: Number(variant.latestUnitCost ?? 0),
    stock: 0,
    publicStock: 0,
  }));
}

function preserveVariantInventoryState(
  variants: ProductVariant[],
  existingVariants: ProductVariant[] = []
) {
  const existingById = new Map(existingVariants.map((variant) => [variant.id, variant]));

  return variants.map((variant) => {
    const existingVariant = existingById.get(variant.id);
    const preservedStock = Math.max(Number(existingVariant?.stock ?? 0), 0);
    const preservedPublicStock = Math.max(
      Number(existingVariant?.publicStock ?? existingVariant?.stock ?? preservedStock),
      0
    );

    return {
      ...variant,
      latestUnitCost: Number(existingVariant?.latestUnitCost ?? variant.latestUnitCost ?? 0),
      stock: preservedStock,
      publicStock: preservedPublicStock,
    };
  });
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeCollections = useMemo(() => getAdminLiveCollectionsForPath(pathname), [pathname]);
  const activeCollectionSignature = activeCollections.join('|');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ProductCategoryRecord[]>([]);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements);
  const [purchases, setPurchases] = useState<Purchase[]>(initialPurchases);
  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<ServiceOrder[]>(initialServices);
  const [serviceVisits, setServiceVisits] = useState<ServiceVisit[]>([]);
  const [authorizationRequests, setAuthorizationRequests] = useState<AuthorizationRequest[]>([]);
  const publicStockAutoSyncInFlightRef = useRef(false);
  const shouldAutoSyncPublicStock =
    activeCollections.includes('products') && activeCollections.includes('movements');

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
    const activeCollectionSet = new Set(activeCollections);
    if (activeCollectionSet.size === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const readyCollections = new Set<string>();
    const markReady = (collectionName: string) => {
      readyCollections.add(collectionName);
      if (readyCollections.size >= activeCollectionSet.size) {
        setLoading(false);
      }
    };
    const applyConfirmedSnapshot = (
      collectionName: string,
      snapshot: QuerySnapshot<DocumentData>,
      applySnapshot: () => void
    ) => {
      if (snapshot.metadata.hasPendingWrites) {
        markReady(collectionName);
        return;
      }

      applySnapshot();
      markReady(collectionName);
    };
    const unsubscribers: Array<() => void> = [];

    if (activeCollectionSet.has('product_categories')) {
      unsubscribers.push(onSnapshot(
        collection(db, 'product_categories'),
        (snapshot) => {
          applyConfirmedSnapshot('product_categories', snapshot, () =>
            setCategories(
              snapshot.docs
                .map((item) => mapProductCategoryDocument(item.id, item.data()))
                .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'es'))
            )
          );
        },
        (error) => {
          console.error('Error leyendo categorias desde Firestore:', error);
          markReady('product_categories');
        }
      ));
    }

    if (activeCollectionSet.has('products')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'products'), orderBy('createdAt', 'desc')),
        (snapshot) => {
          applyConfirmedSnapshot('products', snapshot, () =>
            setProducts(snapshot.docs.map((item) => mapProductDocument(item.id, item.data())))
          );
        },
        (error) => {
          console.error('Error leyendo productos desde Firestore:', error);
          markReady('products');
        }
      ));
    }

    if (activeCollectionSet.has('suppliers')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'suppliers'), orderBy('createdAt', 'desc')),
        (snapshot) => {
          applyConfirmedSnapshot('suppliers', snapshot, () =>
            setSuppliers(snapshot.docs.map((item) => mapSupplierDocument(item.id, item.data())))
          );
        },
        (error) => {
          console.error('Error leyendo proveedores desde Firestore:', error);
          markReady('suppliers');
        }
      ));
    }

    if (activeCollectionSet.has('product_variants')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'product_variants'), orderBy('productId', 'asc')),
        (snapshot) => {
          applyConfirmedSnapshot('product_variants', snapshot, () =>
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
            )
          );
        },
        (error) => {
          console.error('Error leyendo variantes desde Firestore:', error);
          markReady('product_variants');
        }
      ));
    }

    if (activeCollectionSet.has('movements')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'movements'), orderBy('occurredAt', 'desc')),
        (snapshot) => {
          applyConfirmedSnapshot('movements', snapshot, () =>
            setMovements(snapshot.docs.map((item) => mapMovementDocument(item.id, item.data())))
          );
        },
        (error) => {
          console.error('Error leyendo movimientos desde Firestore:', error);
          markReady('movements');
        }
      ));
    }

    if (activeCollectionSet.has('purchases')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'purchases'), orderBy('purchasedAt', 'desc')),
        (snapshot) => {
          applyConfirmedSnapshot('purchases', snapshot, () =>
            setPurchases(snapshot.docs.map((item) => mapPurchaseDocument(item.id, item.data())))
          );
        },
        (error) => {
          console.error('Error leyendo compras desde Firestore:', error);
          markReady('purchases');
        }
      ));
    }

    if (activeCollectionSet.has('sales')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'sales'), orderBy('soldAt', 'desc')),
        (snapshot) => {
          applyConfirmedSnapshot('sales', snapshot, () =>
            setSales(snapshot.docs.map((item) => mapSaleDocument(item.id, item.data())))
          );
        },
        (error) => {
          console.error('Error leyendo ventas desde Firestore:', error);
          markReady('sales');
        }
      ));
    }

    if (activeCollectionSet.has('customers')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'customers'), orderBy('fullName', 'asc')),
        (snapshot) => {
          applyConfirmedSnapshot('customers', snapshot, () =>
            setCustomers(snapshot.docs.map((item) => mapCustomerDocument(item.id, item.data())))
          );
        },
        (error) => {
          console.error('Error leyendo clientes desde Firestore:', error);
          markReady('customers');
        }
      ));
    }

    if (activeCollectionSet.has('services')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'services'), orderBy('performedAt', 'desc')),
        (snapshot) => {
          applyConfirmedSnapshot('services', snapshot, () =>
            setServices(snapshot.docs.map((item) => mapServiceDocument(item.id, item.data())))
          );
        },
        (error) => {
          console.error('Error leyendo servicios desde Firestore:', error);
          markReady('services');
        }
      ));
    }

    if (activeCollectionSet.has('service-visits')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'service-visits'), orderBy('scheduledAt', 'desc')),
        (snapshot) => {
          applyConfirmedSnapshot('service-visits', snapshot, () =>
            setServiceVisits(snapshot.docs.map((item) => mapServiceVisitDocument(item.id, item.data())))
          );
        },
        (error) => {
          console.error('Error leyendo visitas de servicio desde Firestore:', error);
          markReady('service-visits');
        }
      ));
    }

    if (activeCollectionSet.has('authorization-requests')) {
      unsubscribers.push(onSnapshot(
        query(collection(db, 'authorization-requests'), orderBy('createdAt', 'desc')),
        (snapshot) => {
          applyConfirmedSnapshot('authorization-requests', snapshot, () =>
            setAuthorizationRequests(
              snapshot.docs.map((item) => mapAuthorizationRequestDocument(item.id, item.data()))
            )
          );
        },
        (error) => {
          console.error('Error leyendo autorizaciones desde Firestore:', error);
          markReady('authorization-requests');
        }
      ));
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [activeCollectionSignature]);

  const buildPublicStockMap = (
    sourceProducts: Product[],
    touchedProductIds: string[],
    addedMovements: Array<{ productId: string; quantity: number }> = []
  ) => {
    const uniqueProductIds = Array.from(new Set(touchedProductIds.filter(Boolean)));

    return new Map(
      uniqueProductIds.map((productId) => {
        const product = sourceProducts.find((item) => item.id === productId);
        const currentStock = getStoredProductStock(product);
        const delta = addedMovements
          .filter((movement) => movement.productId === productId)
          .reduce((total, movement) => total + movement.quantity, 0);
        return [productId, Math.max(currentStock + delta, 0)];
      })
    );
  };

  const buildForwardPublicStockMap = (
    sourceProducts: Product[],
    touchedProductIds: string[],
    addedMovements: Array<{ productId: string; quantity: number }> = [],
    baseMovements: InventoryMovement[] = movements
  ) => {
    void baseMovements;
    const simpleProductIds = touchedProductIds.filter((productId) => {
      const product = sourceProducts.find((item) => item.id === productId);
      return product ? getProductSaleMode(product) !== 'varianted' : true;
    });

    return buildPublicStockMap(sourceProducts, simpleProductIds, addedMovements);
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
          stock: publicStock,
          stockOnHand: publicStock,
          ...(publicStock > 0 ? { status: 'active' } : {}),
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
          ...(productVariantPayload.some((variant) => Math.max(Number(variant.stock ?? 0), 0) > 0)
            ? { status: 'active' }
            : {}),
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

  const projectProductsWithoutPurchases = (baseProducts: Product[], removedPurchases: Purchase[]) => {
    const nextProducts = baseProducts.map((product) => ({
      ...product,
      variants: (product.variants ?? []).map((variant) => ({ ...variant })),
    }));

    removedPurchases.forEach((purchase) => {
      if (!purchase.variantId) return;
      const targetProduct = nextProducts.find((product) => product.id === purchase.productId);
      const targetVariant = targetProduct?.variants?.find((variant) => variant.id === purchase.variantId);
      if (!targetVariant) return;
      targetVariant.stock = Math.max(
        Number(targetVariant.stock ?? 0) - Number(purchase.quantityPurchased ?? purchase.presentationQuantity ?? 0),
        0
      );
    });

    return nextProducts;
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
      if (getProductSaleMode(product) === 'varianted') {
        const variantStockMap = buildVariantStockMap([product]).get(product.id) ?? new Map<string, number>();
        const computedPublicStock = Array.from(variantStockMap.values()).reduce((total, stock) => total + stock, 0);
        const currentPublicStock = Math.max(Number(product.publicStock ?? 0), 0);
        const hasVariantPublicStockMismatch = (product.variants ?? []).some(
          (variant) => Math.max(Number(variant.publicStock ?? 0), 0) !== Math.max(Number(variant.stock ?? 0), 0)
        );
        const shouldForcePublicStatus = computedPublicStock > 0 && product.status !== 'active';

        if (computedPublicStock === currentPublicStock && !hasVariantPublicStockMismatch && !shouldForcePublicStatus) {
          return;
        }

        applyVariantStockMapToBatch(
          batch,
          new Map([[product.id, variantStockMap]]),
          products
        );
        if (shouldForcePublicStatus) {
          batch.set(
            doc(db, 'products', product.id),
            {
              status: 'active',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
        changedCount += 1;
        return;
      }

      const publicStock = getStoredProductStock(product);
      const shouldForcePublicStatus = publicStock > 0 && product.status !== 'active';
      if (!shouldForcePublicStatus) {
        return;
      }

      batch.set(
        doc(db, 'products', product.id),
        {
          publicStock,
          stock: publicStock,
          stockOnHand: publicStock,
          ...(shouldForcePublicStatus ? { status: 'active' } : {}),
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
      retries: 0,
      initialDelayMs: 700,
    });
    return changedCount;
  };

  useEffect(() => {
    if (!shouldAutoSyncPublicStock) return;
    if (loading) return;
    if (products.length === 0) return;
    if (publicStockAutoSyncInFlightRef.current) return;

    const hasMismatch = products.some((product) => {
      if (getProductSaleMode(product) === 'varianted') {
        const computedVariantStock = (product.variants ?? []).reduce(
          (total, variant) => total + getProductVariantStock(product, variant.id, []),
          0
        );
        const hasVariantPublicStockMismatch = (product.variants ?? []).some(
          (variant) =>
            Math.max(Number(variant.publicStock ?? variant.stock ?? 0), 0) !==
            getProductVariantStock(product, variant.id, [])
        );

        return (
          Math.max(Number(product.publicStock ?? 0), 0) !== computedVariantStock ||
          hasVariantPublicStockMismatch ||
          (computedVariantStock > 0 && product.status !== 'active')
        );
      }

      const stock = getStoredProductStock(product);
      return stock > 0 && product.status !== 'active';
    });

    if (!hasMismatch) return;

    publicStockAutoSyncInFlightRef.current = true;
    void syncPublicProductStocks()
      .catch((error) => {
        console.error('Error reconciliando stock publico automaticamente:', error);
      })
      .finally(() => {
        publicStockAutoSyncInFlightRef.current = false;
      });
  }, [loading, products, shouldAutoSyncPublicStock]);

  const createProduct = async (input: NewProductInput) => {
    const createdAt = new Date().toISOString();
    const productRef = doc(collection(db, 'products'));
    const inputUsesVariants = input.saleMode === 'varianted';
    const normalizedVariantAttributes = inputUsesVariants
      ? normalizeVariantAttributeDefinitions(input.variantAttributes)
      : [];
    const normalizedVariants = inputUsesVariants
      ? resetVariantInventoryState(
          normalizeProductVariantRecords(
            productRef.id,
            normalizedVariantAttributes,
            input.variants
          )
      )
      : [];
    const nextSaleMode = inputUsesVariants && normalizedVariants.length > 0 ? 'varianted' : 'simple';
    const productSummary =
      nextSaleMode === 'varianted'
        ? {
            publicStock: 0,
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

    const inputUsesVariants = input.saleMode === 'varianted';
    const normalizedVariantAttributes = inputUsesVariants
      ? normalizeVariantAttributeDefinitions(input.variantAttributes)
      : [];
    const normalizedVariants = inputUsesVariants
      ? preserveVariantInventoryState(
          normalizeProductVariantRecords(
            productId,
            normalizedVariantAttributes,
            input.variants
          ),
          existingProduct.variants ?? []
        )
      : [];
    const nextSaleMode = inputUsesVariants && normalizedVariants.length > 0 ? 'varianted' : 'simple';
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
          ? normalizedVariants.reduce(
              (total, variant) => total + Math.max(Number(variant.publicStock ?? variant.stock ?? 0), 0),
              0
            )
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
      const currentLegacyStock = getStoredProductStock(existingProduct);

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
          const desiredStock = baseStock;
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
        variants: baseMigratedVariants,
        publicStock: currentLegacyStock,
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
      .forEach((movement) => {
        batch.delete(doc(db, 'movements', movement.id));
        batch.delete(doc(db, 'inventory_movements', movement.id));
      });
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

  const createCustomer = async (input: CustomerMutationInput) => {
    const normalized = normalizeCustomerMutationInput(input);
    const customerId = buildCustomerId(normalized.fullName, normalized.phone, normalized.documentNumber);
    const existingCustomer = customers.find((customer) => customer.id === customerId);
    if (existingCustomer) {
      throw new Error('Ya existe un cliente con esa cedula, telefono o nombre.');
    }

    const now = new Date().toISOString();
    const customer: Customer = {
      id: customerId,
      fullName: normalized.fullName,
      normalizedName: normalizeSearchText(normalized.fullName),
      phone: normalized.phone || undefined,
      documentNumber: normalized.documentNumber || undefined,
      saleCount: 0,
      totalRevenue: 0,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'customers', customerId), {
      ...customer,
      phone: customer.phone ?? null,
      documentNumber: customer.documentNumber ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setCustomers((current) =>
      [customer, ...current.filter((item) => item.id !== customer.id)].sort((left, right) =>
        left.fullName.localeCompare(right.fullName, 'es')
      )
    );

    return customer;
  };

  const updateCustomer = async (customerId: string, input: CustomerMutationInput) => {
    const existingCustomer = customers.find((customer) => customer.id === customerId);
    if (!existingCustomer) {
      throw new Error('No se encontro el cliente a actualizar.');
    }

    const normalized = normalizeCustomerMutationInput(input);
    const updatedCustomer: Customer = {
      ...existingCustomer,
      fullName: normalized.fullName,
      normalizedName: normalizeSearchText(normalized.fullName),
      phone: normalized.phone || undefined,
      documentNumber: normalized.documentNumber || undefined,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, 'customers', customerId), {
      fullName: updatedCustomer.fullName,
      normalizedName: updatedCustomer.normalizedName,
      phone: updatedCustomer.phone ?? null,
      documentNumber: updatedCustomer.documentNumber ?? null,
      updatedAt: serverTimestamp(),
    });

    setCustomers((current) =>
      current
        .map((customer) => (customer.id === customerId ? updatedCustomer : customer))
        .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es'))
    );

    return updatedCustomer;
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

    const inputQuantity = Number(input.quantity);
    if (!Number.isFinite(inputQuantity) || inputQuantity <= 0) {
      throw new Error('La cantidad del movimiento debe ser mayor a cero.');
    }
    const occurredAtDate = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAtDate.getTime())) {
      throw new Error('La fecha del movimiento no es valida.');
    }
    const normalizedQuantity =
      input.type === 'exit' ? -Math.abs(inputQuantity) : inputQuantity;
    if (input.type === 'exit') {
      const availableStock = selectedVariant
        ? getProductVariantStock(targetProduct, selectedVariant.id, movements)
        : getStoredProductStock(targetProduct);
      if (inputQuantity > availableStock) {
        throw new Error(
          `No hay stock suficiente para ${targetProduct.name}. Disponible: ${availableStock}, solicitado: ${inputQuantity}.`
        );
      }
    }
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
      occurredAt: occurredAtDate.toISOString(),
      responsibleUser: input.responsibleUser,
      relatedUnitCost:
        input.relatedUnitCost ?? getVariantOrProductRealUnitCost(purchases, input.productId, selectedVariant?.id),
      customerName: input.customerName?.trim() || undefined,
      customerPhone: input.customerPhone?.trim() || undefined,
      giftReason: input.giftReason?.trim() || undefined,
      giftTotalCost: input.giftTotalCost,
    };

    const batch = writeBatch(db);
    batch.set(movementRef, {
      ...serializeMovementForFirestore(movement),
      occurredAt: Timestamp.fromDate(occurredAtDate),
    });
    batch.set(doc(db, 'inventory_movements', movement.id), {
      ...serializeMovementForFirestore(movement),
      occurredAt: Timestamp.fromDate(occurredAtDate),
      sourceType: input.reason === 'gift' ? 'gift' : 'manual-adjustment',
      sourceId: movement.id,
    });
    applyPublicStockMapToBatch(
      batch,
      buildForwardPublicStockMap(products, [input.productId], [
        { productId: input.productId, quantity: normalizedQuantity },
      ])
    );
    if (selectedVariant) {
      const variantStockMap = buildVariantStockMap(products, movements);
      const productVariantMap = variantStockMap.get(input.productId);
      const currentVariantStock = productVariantMap?.get(selectedVariant.id) ?? selectedVariant.stock ?? 0;
      productVariantMap?.set(selectedVariant.id, Math.max(currentVariantStock + normalizedQuantity, 0));
      applyVariantStockMapToBatch(batch, variantStockMap, products);
    }
    await runFirestoreWriteWithBackoff(() => batch.commit(), {
      retries: 0,
      initialDelayMs: 700,
      timeoutMs: 9000,
    });

    return movement;
  };

  const getFreshProductsForPurchase = async (input: RegisterPurchaseInput) => {
    const touchedProductIds = Array.from(new Set(input.items.map((item) => item.productId).filter(Boolean)));
    if (touchedProductIds.length === 0) {
      return products;
    }

    const freshProductDocs = await Promise.all(
      touchedProductIds.map((productId) => getDoc(doc(db, 'products', productId)))
    );
    const freshProductsById = new Map(
      freshProductDocs
        .filter((snapshot) => snapshot.exists())
        .map((snapshot) => [snapshot.id, mapProductDocument(snapshot.id, snapshot.data())])
    );

    return products.map((product) => freshProductsById.get(product.id) ?? product);
  };

  const registerPurchase = async (input: RegisterPurchaseInput) => {
    const freshProducts = await getFreshProductsForPurchase(input);
    return createPurchaseBatch(input, undefined, movements, freshProducts);
  };

  const registerInitialStock = async (input: RegisterInitialStockInput) => {
    const targetProduct = products.find((product) => product.id === input.productId);
    if (!targetProduct) {
      throw new Error('No se encontro el producto para cargar inventario inicial.');
    }
    const selectedVariant = input.variantId ? getProductVariantById(targetProduct, input.variantId) : null;
    if (getProductSaleMode(targetProduct) === 'varianted' && !selectedVariant) {
      throw new Error(`Selecciona una variante valida para cargar inventario inicial de ${targetProduct.name}.`);
    }

    const quantity = Number(input.quantity);
    const estimatedUnitCost = Number(input.estimatedUnitCost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La cantidad inicial debe ser mayor a cero.');
    }
    if (!Number.isFinite(estimatedUnitCost) || estimatedUnitCost < 0) {
      throw new Error('El costo estimado debe ser un valor valido.');
    }
    const alreadyHasInventoryHistory = movements.some(
      (movement) =>
        movement.productId === input.productId &&
        (selectedVariant ? movement.variantId === selectedVariant.id : !movement.variantId)
    );
    if (alreadyHasInventoryHistory) {
      throw new Error(
        'Este producto ya tiene historial de inventario. Usa Registrar movimiento para corregir stock sin duplicar la carga inicial.'
      );
    }

    const purchaseRef = doc(collection(db, 'purchases'));
    const movementRef = doc(collection(db, 'movements'));
    const purchaseValueTotal = Number((quantity * estimatedUnitCost).toFixed(2));
    const purchase: Purchase = {
      id: purchaseRef.id,
      purchaseId: purchaseRef.id,
      productId: input.productId,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name ?? input.variantName,
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
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name ?? input.variantName,
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
      ...serializePurchaseForFirestore(purchase),
      docType: 'legacy-line',
      purchasedAt: Timestamp.fromDate(new Date(input.occurredAt)),
    });
    batch.set(doc(db, 'purchase_items', purchase.id), {
      ...serializePurchaseForFirestore(purchase),
      purchaseId: purchase.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      purchasedAt: Timestamp.fromDate(new Date(input.occurredAt)),
    });
    batch.set(doc(db, 'movements', movement.id), {
      ...serializeMovementForFirestore(movement),
      occurredAt: Timestamp.fromDate(new Date(input.occurredAt)),
    });
    batch.set(doc(db, 'inventory_movements', movement.id), {
      ...serializeMovementForFirestore(movement),
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
      buildForwardPublicStockMap(products, [input.productId], [
        { productId: input.productId, quantity },
      ])
    );
    if (selectedVariant) {
      const variantStockMap = buildVariantStockMap(products, movements);
      const productVariantMap = variantStockMap.get(input.productId);
      const currentVariantStock = productVariantMap?.get(selectedVariant.id) ?? selectedVariant.stock ?? 0;
      productVariantMap?.set(selectedVariant.id, currentVariantStock + quantity);
      applyVariantStockMapToBatch(batch, variantStockMap, products);
    }

    await batch.commit();

    return {
      movement,
      purchase,
    };
  };

  const registerInitialStockBatch = async (input: RegisterInitialStockBatchInput) => {
    const targetProduct = products.find((product) => product.id === input.productId);
    if (!targetProduct) {
      throw new Error('No se encontro el producto para cargar inventario inicial.');
    }

    const normalizedItems = input.items
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity ?? 0),
        estimatedUnitCost: Number(item.estimatedUnitCost ?? 0),
        suggestedSalePrice:
          typeof item.suggestedSalePrice === 'number' ? Number(item.suggestedSalePrice) : undefined,
      }))
      .filter((item) => item.quantity > 0);

    if (normalizedItems.length === 0) {
      throw new Error('Agrega al menos una linea con cantidad mayor a cero.');
    }

    const isVarianted = getProductSaleMode(targetProduct) === 'varianted';
    const variantStockMap = buildVariantStockMap(products, movements);
    const productVariantMap = variantStockMap.get(input.productId);
    const batchId = doc(collection(db, 'purchase-batches')).id;
    const stockDeltas: Array<{ productId: string; quantity: number }> = [];
    const batch = writeBatch(db);
    const purchasesCreated: Purchase[] = [];
    const movementsCreated: InventoryMovement[] = [];
    let lastSuggestedSalePriceForSimpleProduct: number | undefined;

    normalizedItems.forEach((item, index) => {
      const selectedVariant = item.variantId ? getProductVariantById(targetProduct, item.variantId) : null;
      if (isVarianted && !selectedVariant) {
        throw new Error(`Selecciona una variante valida para cargar inventario inicial de ${targetProduct.name}.`);
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error('La cantidad inicial debe ser mayor a cero.');
      }
      if (!Number.isFinite(item.estimatedUnitCost) || item.estimatedUnitCost < 0) {
        throw new Error('El costo estimado debe ser un valor valido.');
      }
      const alreadyHasInventoryHistory = movements.some(
        (movement) =>
          movement.productId === input.productId &&
          (selectedVariant ? movement.variantId === selectedVariant.id : !movement.variantId)
      );
      if (alreadyHasInventoryHistory) {
        throw new Error(
          selectedVariant
            ? `La variante ${selectedVariant.name} ya tiene historial de inventario. Usa Registrar movimiento para corregir stock.`
            : 'Este producto ya tiene historial de inventario. Usa Registrar movimiento para corregir stock sin duplicar la carga inicial.'
        );
      }

      const purchaseRef = doc(collection(db, 'purchases'));
      const movementRef = doc(collection(db, 'movements'));
      const purchaseValueTotal = Number((item.quantity * item.estimatedUnitCost).toFixed(2));
      const suggestedSalePrice =
        typeof item.suggestedSalePrice === 'number' && Number.isFinite(item.suggestedSalePrice) && item.suggestedSalePrice >= 0
          ? item.suggestedSalePrice
          : Number(selectedVariant?.salePrice ?? targetProduct.salePrice ?? 0);

      const purchase: Purchase = {
        id: purchaseRef.id,
        purchaseId: batchId,
        purchaseBatchId: batchId,
        productId: input.productId,
        variantId: selectedVariant?.id,
        variantName: selectedVariant?.name ?? item.variantName,
        supplier: 'Inventario inicial sin proveedor',
        source: 'initial-load',
        purchasedAt: input.occurredAt,
        presentationQuantity: item.quantity,
        purchaseUnitValue: item.estimatedUnitCost,
        quantityPurchased: item.quantity,
        purchasePresentation: 'unit',
        conversionFactor: 1,
        purchaseValueTotal,
        shippingValueTotal: 0,
        totalInvestment: purchaseValueTotal,
        realUnitCost: item.estimatedUnitCost,
        suggestedSalePrice,
        estimatedMargin: calculateMargin(item.estimatedUnitCost, suggestedSalePrice),
        notes: input.notes,
      };

      const movement: InventoryMovement = {
        id: movementRef.id,
        productId: input.productId,
        variantId: selectedVariant?.id,
        variantName: selectedVariant?.name ?? item.variantName,
        purchaseId: purchase.id,
        purchaseBatchId: batchId,
        type: 'entry',
        reason: 'initial-load',
        quantity: item.quantity,
        notes: input.notes,
        occurredAt: input.occurredAt,
        responsibleUser: input.responsibleUser,
        relatedUnitCost: item.estimatedUnitCost,
      };

      purchasesCreated.push(purchase);
      movementsCreated.push(movement);
      stockDeltas.push({ productId: input.productId, quantity: item.quantity });

      batch.set(doc(db, 'purchases', purchase.id), {
        ...serializePurchaseForFirestore(purchase),
        docType: 'legacy-line',
        purchasedAt: Timestamp.fromDate(new Date(input.occurredAt)),
      });
      batch.set(doc(db, 'purchase_items', purchase.id), {
        ...serializePurchaseForFirestore(purchase),
        purchaseId: batchId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        purchasedAt: Timestamp.fromDate(new Date(input.occurredAt)),
      });
      batch.set(doc(db, 'movements', movement.id), {
        ...serializeMovementForFirestore(movement),
        occurredAt: Timestamp.fromDate(new Date(input.occurredAt)),
      });
      batch.set(doc(db, 'inventory_movements', movement.id), {
        ...serializeMovementForFirestore(movement),
        sourceType: 'initial-load',
        sourceId: batchId,
        occurredAt: Timestamp.fromDate(new Date(input.occurredAt)),
      });

      if (selectedVariant) {
        const currentVariantStock = productVariantMap?.get(selectedVariant.id) ?? selectedVariant.stock ?? 0;
        productVariantMap?.set(selectedVariant.id, currentVariantStock + item.quantity);
      } else if (!isVarianted) {
        lastSuggestedSalePriceForSimpleProduct = suggestedSalePrice;
      }

      if (selectedVariant && typeof suggestedSalePrice === 'number') {
        const variantRecord = (targetProduct.variants ?? []).find((variant) => variant.id === selectedVariant.id);
        if (variantRecord) {
          variantRecord.salePrice = suggestedSalePrice;
        }
      }

      if (index === normalizedItems.length - 1 && !isVarianted && typeof lastSuggestedSalePriceForSimpleProduct === 'number') {
        batch.update(doc(db, 'products', input.productId), {
          salePrice: lastSuggestedSalePriceForSimpleProduct,
          updatedAt: serverTimestamp(),
        });
      }
    });

    applyPublicStockMapToBatch(
      batch,
      buildForwardPublicStockMap(
        products,
        [input.productId],
        stockDeltas
      )
    );
    if (isVarianted) {
      applyVariantStockMapToBatch(batch, variantStockMap, products);
    }

    await batch.commit();

    return {
      movements: movementsCreated,
      purchases: purchasesCreated,
    };
  };

  const addPurchaseBatchWritesToBatch = (
    batch: ReturnType<typeof writeBatch>,
    input: RegisterPurchaseInput,
    existingBatchId?: string,
    baseMovements: InventoryMovement[] = movements,
    baseProducts: Product[] = products
  ) => {
    if (input.items.length === 0) {
      throw new Error('Agrega al menos un producto a la compra.');
    }
    const purchasedAtDate = new Date(input.purchasedAt);
    if (Number.isNaN(purchasedAtDate.getTime())) {
      throw new Error('La fecha de la compra no es valida.');
    }

    input.items.forEach((item) => {
      const targetProduct = baseProducts.find((product) => product.id === item.productId);
      if (!targetProduct) {
        throw new Error('Uno de los productos de la compra no existe.');
      }
      if (getProductSaleMode(targetProduct) === 'varianted' && !getProductVariantById(targetProduct, item.variantId)) {
        throw new Error(`Selecciona una variante valida para comprar ${targetProduct.name}.`);
      }
    });
    const isInternationalPurchase = input.purchaseType === 'international';
    const normalizedUsdToCopRate = Number(input.usdToCopRate ?? 0);
    if (isInternationalPurchase && normalizedUsdToCopRate <= 0) {
      throw new Error('La compra internacional requiere una tasa USD a COP mayor a cero.');
    }

    const normalizedItems = input.items.map((item) => ({
      ...item,
      presentationQuantity: Number(item.presentationQuantity || 0),
      purchaseUnitValue: Number(item.purchaseUnitValue || 0),
      purchaseUnitValueUsd: Number(item.purchaseUnitValueUsd || 0),
      suggestedSalePrice: Number(item.suggestedSalePrice || 0),
    }));
    const normalizedItemsWithConvertedPrice = normalizedItems.map((item) => ({
      ...item,
      purchaseUnitValue: isInternationalPurchase
        ? Number(((Number(item.purchaseUnitValueUsd || 0) * normalizedUsdToCopRate)).toFixed(2))
        : Number(item.purchaseUnitValue || 0),
    }));
    if (normalizedItemsWithConvertedPrice.some((item) => item.purchaseUnitValue <= 0)) {
      throw new Error(
        isInternationalPurchase
          ? 'Cada linea internacional debe tener un valor unitario en USD mayor a cero.'
          : 'Cada linea debe tener un valor unitario de compra mayor a cero.'
      );
    }
    if (normalizedItemsWithConvertedPrice.some((item) => item.presentationQuantity <= 0)) {
      throw new Error('Cada linea debe tener una cantidad comprada mayor a cero.');
    }
    if (normalizedItemsWithConvertedPrice.some((item) => item.suggestedSalePrice < 0)) {
      throw new Error('El precio sugerido no puede ser negativo.');
    }
    const totalPurchasedUnits = normalizedItems.reduce(
      (total, item) => total + item.presentationQuantity,
      0
    );
    const totalPurchaseValue = normalizedItemsWithConvertedPrice.reduce(
      (total, item) => total + Number((item.purchaseUnitValue * item.presentationQuantity).toFixed(2)),
      0
    );
    const normalizedDiscountPercent = Math.min(Math.max(Number(input.discountPercent ?? 0), 0), 100);
    const totalDiscountValue = Number(((totalPurchaseValue * normalizedDiscountPercent) / 100).toFixed(2));
    const batchId = existingBatchId ?? doc(collection(db, 'purchase-batches')).id;
    const purchasesCreated: Purchase[] = [];
    const stockDeltas: Array<{ productId: string; quantity: number }> = [];

    normalizedItemsWithConvertedPrice.forEach((item, index) => {
      const conversionFactor = 1;
      const quantityPurchased = item.presentationQuantity;
      const purchaseGrossValueTotal = Number((item.purchaseUnitValue * item.presentationQuantity).toFixed(2));
      const purchaseDiscountBase = Number(((purchaseGrossValueTotal * normalizedDiscountPercent) / 100).toFixed(2));
      const adjustedPurchaseDiscount =
        index === normalizedItemsWithConvertedPrice.length - 1
          ? Number(
              (
                totalDiscountValue -
                purchasesCreated.reduce((sum, purchase) => sum + Number(purchase.purchaseDiscountTotal ?? 0), 0)
              ).toFixed(2)
            )
          : purchaseDiscountBase;
      const purchaseValueTotal = Number(Math.max(purchaseGrossValueTotal - adjustedPurchaseDiscount, 0).toFixed(2));
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
      const subtotalUsd = Number(input.productsValueUsd ?? 0) + Number(input.shippingValueUsd ?? 0);
      const platformFeeUsd = Number(((subtotalUsd * Number(input.platformFeePercent ?? 0)) / 100).toFixed(6));
      const internationalChargesCop = Number(
        (
          (Number(input.shippingValueUsd ?? 0) + platformFeeUsd) * Number(input.usdToCopRate ?? 0)
        ).toFixed(2)
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
        purchaseUnitValueUsd: isInternationalPurchase ? Number(item.purchaseUnitValueUsd ?? 0) : undefined,
        quantityPurchased,
        purchasePresentation: 'unit',
        conversionFactor,
        purchaseGrossValueTotal,
        purchaseDiscountPercent: normalizedDiscountPercent,
        purchaseDiscountTotal: adjustedPurchaseDiscount,
        purchaseValueTotal,
        shippingValueTotal: adjustedShippingShare,
        purchaseType: isInternationalPurchase ? 'international' : 'local',
        internationalVendorName: isInternationalPurchase ? String(input.internationalVendorName ?? '') : undefined,
        productsValueUsd: isInternationalPurchase ? Number(input.productsValueUsd ?? 0) : undefined,
        shippingValueUsd: isInternationalPurchase ? Number(input.shippingValueUsd ?? 0) : undefined,
        platformFeePercent: isInternationalPurchase ? Number(input.platformFeePercent ?? 0) : undefined,
        platformFeeUsd: isInternationalPurchase ? platformFeeUsd : undefined,
        usdToCopRate: isInternationalPurchase ? Number(input.usdToCopRate ?? 0) : undefined,
        customsTaxCop: isInternationalPurchase ? Number(input.customsTaxCop ?? 0) : undefined,
        internationalChargesCop: isInternationalPurchase ? internationalChargesCop : undefined,
        totalInvestment: totals.totalInvestment,
        realUnitCost: totals.realUnitCost,
        suggestedSalePrice: item.suggestedSalePrice,
        estimatedMargin: calculateMargin(totals.realUnitCost, item.suggestedSalePrice),
      };

      purchasesCreated.push(purchase);

      const movementRef = doc(collection(db, 'movements'));
      batch.set(doc(db, 'purchases', purchase.id), {
        ...serializePurchaseForFirestore(purchase),
        docType: 'legacy-line',
        purchasedAt: Timestamp.fromDate(purchasedAtDate),
      });
      batch.set(doc(db, 'purchase_items', purchase.id), {
        ...serializePurchaseForFirestore(purchase),
        purchaseId: batchId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        purchasedAt: Timestamp.fromDate(purchasedAtDate),
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
        occurredAt: Timestamp.fromDate(purchasedAtDate),
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
        occurredAt: Timestamp.fromDate(purchasedAtDate),
        responsibleUser: 'Administrador',
        relatedUnitCost: totals.realUnitCost,
      });
      stockDeltas.push({ productId: item.productId, quantity: quantityPurchased });
      if (item.variantId) {
        const targetProduct = baseProducts.find((product) => product.id === item.productId);
        const variantRecord = (targetProduct?.variants ?? []).find((variant) => variant.id === item.variantId);
        if (variantRecord) {
          variantRecord.salePrice = Number(item.suggestedSalePrice ?? variantRecord.salePrice ?? targetProduct?.salePrice ?? 0);
          variantRecord.latestUnitCost = totals.realUnitCost;
        }
      }
      batch.update(doc(db, 'products', item.productId), {
        salePrice:
          item.variantId && getProductSaleMode(baseProducts.find((product) => product.id === item.productId)) === 'varianted'
            ? baseProducts.find((product) => product.id === item.productId)?.salePrice ?? item.suggestedSalePrice
            : item.suggestedSalePrice,
        // Keep purchased products publishable in public catalog query (status == active).
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    });

    applyPublicStockMapToBatch(
      batch,
      buildForwardPublicStockMap(
        baseProducts,
        stockDeltas.map((item) => item.productId),
        stockDeltas,
        baseMovements
      )
    );
    const variantStockMap = buildVariantStockMap(baseProducts, baseMovements);
    normalizedItems.forEach((item) => {
      if (!item.variantId) return;
      const targetProduct = baseProducts.find((product) => product.id === item.productId);
      const targetVariant = targetProduct ? getProductVariantById(targetProduct, item.variantId) : null;
      if (!targetVariant) return;
      const currentStock = variantStockMap.get(item.productId)?.get(item.variantId) ?? targetVariant.stock ?? 0;
      variantStockMap.get(item.productId)?.set(item.variantId, currentStock + item.presentationQuantity);
      const variantRecord = (targetProduct?.variants ?? []).find((variant) => variant.id === item.variantId);
      if (variantRecord) {
        variantRecord.salePrice = Number(item.suggestedSalePrice ?? variantRecord.salePrice ?? targetProduct?.salePrice ?? 0);
      }
    });
    applyVariantStockMapToBatch(batch, variantStockMap, baseProducts);

    return purchasesCreated;
  };

  const createPurchaseBatch = async (
    input: RegisterPurchaseInput,
    existingBatchId?: string,
    baseMovements: InventoryMovement[] = movements,
    baseProducts: Product[] = products
  ) => {
    const batch = writeBatch(db);
    const purchasesCreated = addPurchaseBatchWritesToBatch(
      batch,
      input,
      existingBatchId,
      baseMovements,
      baseProducts
    );
    await runFirestoreWriteWithBackoff(() => batch.commit(), {
      retries: 0,
      initialDelayMs: 700,
      timeoutMs: 12000,
    });
    return purchasesCreated;
  };

  const updatePurchaseBatch = async (batchId: string, input: RegisterPurchaseInput) => {
    const targetPurchases = purchases.filter((purchase) => purchase.purchaseBatchId === batchId);
    if (targetPurchases.length === 0) {
      throw new Error('No se encontro la compra agrupada a editar.');
    }

    const batch = writeBatch(db);
    targetPurchases.forEach((purchase) => {
      batch.delete(doc(db, 'purchases', purchase.id));
      batch.delete(doc(db, 'purchase_items', purchase.id));
    });
    movements
      .filter((movement) => movement.purchaseBatchId === batchId)
      .forEach((movement) => {
        batch.delete(doc(db, 'movements', movement.id));
        batch.delete(doc(db, 'inventory_movements', movement.id));
      });

    const remainingMovements = movements.filter((movement) => movement.purchaseBatchId !== batchId);
    const projectedProducts = projectProductsWithoutPurchases(products, targetPurchases);
    const updatedPurchases = addPurchaseBatchWritesToBatch(
      batch,
      input,
      batchId,
      remainingMovements,
      projectedProducts
    );
    await batch.commit();
    return updatedPurchases;
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
    batch.delete(doc(db, 'purchase_items', purchaseId));
    movements
      .filter((movement) => movement.purchaseId === purchaseId)
      .forEach((movement) => {
        batch.delete(doc(db, 'movements', movement.id));
        batch.delete(doc(db, 'inventory_movements', movement.id));
      });

    const remainingMovements = movements.filter((movement) => movement.purchaseId !== purchaseId);
    const projectedProducts = projectProductsWithoutPurchases(products, [targetPurchase]);
    const [updatedPurchase] = addPurchaseBatchWritesToBatch(
      batch,
      input,
      targetPurchase.purchaseBatchId,
      remainingMovements,
      projectedProducts
    );
    await batch.commit();
    return updatedPurchase;
  };

  const deletePurchase = async (purchaseId: string) => {
    const targetPurchase = purchases.find((purchase) => purchase.id === purchaseId);
    if (!targetPurchase) {
      throw new Error('No se encontro la compra a eliminar.');
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, 'purchases', purchaseId));
    batch.delete(doc(db, 'purchase_items', purchaseId));
    const removedMovements = movements.filter((movement) => movement.purchaseId === purchaseId);
    removedMovements.forEach((movement) => {
      batch.delete(doc(db, 'movements', movement.id));
      batch.delete(doc(db, 'inventory_movements', movement.id));
    });
    const remainingMovements = movements.filter((movement) => movement.purchaseId !== purchaseId);
    const projectedProducts = projectProductsWithoutPurchases(products, [targetPurchase]);
    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(
        projectedProducts,
        removedMovements.map((movement) => movement.productId)
      )
    );
    applyVariantStockMapToBatch(batch, buildVariantStockMap(projectedProducts, remainingMovements), projectedProducts);
    await batch.commit();
  };

  const deletePurchaseBatch = async (batchId: string) => {
    const targetPurchases = purchases.filter((purchase) => purchase.purchaseBatchId === batchId);
    if (targetPurchases.length === 0) {
      throw new Error('No se encontro la compra agrupada a eliminar.');
    }

    const batch = writeBatch(db);
    targetPurchases.forEach((purchase) => {
      batch.delete(doc(db, 'purchases', purchase.id));
      batch.delete(doc(db, 'purchase_items', purchase.id));
    });
    const removedMovements = movements.filter((movement) => movement.purchaseBatchId === batchId);
    removedMovements.forEach((movement) => {
      batch.delete(doc(db, 'movements', movement.id));
      batch.delete(doc(db, 'inventory_movements', movement.id));
    });
    const remainingMovements = movements.filter((movement) => movement.purchaseBatchId !== batchId);
    const projectedProducts = projectProductsWithoutPurchases(products, targetPurchases);
    applyPublicStockMapToBatch(
      batch,
      buildPublicStockMap(
        projectedProducts,
        removedMovements.map((movement) => movement.productId)
      )
    );
    applyVariantStockMapToBatch(batch, buildVariantStockMap(projectedProducts, remainingMovements), projectedProducts);
    await batch.commit();
  };

  const addSaleWritesToBatch = (
    batch: ReturnType<typeof writeBatch>,
    input: RegisterSaleInput,
    baseMovements: InventoryMovement[] = movements,
    baseProducts: Product[] = products,
    options?: {
      saleBatchId?: string;
      initialVariantStockMap?: Map<string, Map<string, number>>;
    }
  ) => {
    if (input.items.length === 0) {
      throw new Error('Agrega al menos un producto a la venta.');
    }

    const normalizedCustomerName = normalizeCustomerName(input.customerName);
    const normalizedCustomerPhone = input.customerPhone.trim();
    const normalizedCustomerDocument = input.customerDocument?.trim() ?? '';
    const normalizedPaymentMethod = SALES_PAYMENT_FIELDS_ENABLED
      ? input.paymentMethod?.trim() || 'efectivo'
      : 'efectivo';
    const normalizedPaymentReference = SALES_PAYMENT_FIELDS_ENABLED
      ? input.paymentReference?.trim() ?? ''
      : '';
    if (normalizedCustomerPhone && normalizedCustomerPhone.length < 7) {
      throw new Error('Ingresa un telefono valido o dejalo vacio.');
    }

    const variantStockMap = options?.initialVariantStockMap ?? buildVariantStockMap(baseProducts, baseMovements);
    const simpleStockMap = new Map<string, number>();
    const lineRecords = input.items.map((item) => {
      const targetProduct = baseProducts.find((product) => product.id === item.productId);
      if (!targetProduct) {
        throw new Error('No se encontro uno de los productos para registrar la venta.');
      }

      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (quantity <= 0) {
        throw new Error('La cantidad vendida debe ser mayor a cero.');
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
      } else {
        const availableStock = simpleStockMap.has(item.productId)
          ? Number(simpleStockMap.get(item.productId) ?? 0)
          : getStoredProductStock(targetProduct);
        if (quantity > availableStock) {
          throw new Error(`La cantidad vendida supera el stock disponible de ${targetProduct.name}.`);
        }
        simpleStockMap.set(item.productId, availableStock - quantity);
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
        materials: (serviceItem.materials ?? []).map((material) => {
          const materialProductId = material.productId?.trim();
          const materialProduct = baseProducts.find((product) => product.id === materialProductId);
          if (!materialProduct) {
            throw new Error('Selecciona todos los materiales del servicio asociado.');
          }

          const quantity = Math.max(Number(material.quantity ?? 0), 0);
          if (quantity <= 0) {
            throw new Error('La cantidad de cada material del servicio debe ser mayor a cero.');
          }

          const selectedVariant = material.variantId
            ? getProductVariantById(materialProduct, material.variantId)
            : null;
          if (getProductSaleMode(materialProduct) === 'varianted' && !selectedVariant) {
            throw new Error(`Selecciona una variante valida para ${materialProduct.name} en el servicio.`);
          }

          if (selectedVariant) {
            const currentVariantStock =
              variantStockMap.get(materialProduct.id)?.get(selectedVariant.id) ?? selectedVariant.stock;
            if (quantity > currentVariantStock) {
              throw new Error(`La variante ${selectedVariant.name} de ${materialProduct.name} no tiene stock suficiente.`);
            }
            variantStockMap.get(materialProduct.id)?.set(selectedVariant.id, currentVariantStock - quantity);
          } else {
            const availableStock = simpleStockMap.has(materialProduct.id)
              ? Number(simpleStockMap.get(materialProduct.id) ?? 0)
              : getStoredProductStock(materialProduct);
            if (quantity > availableStock) {
              throw new Error(`La cantidad usada supera el stock disponible de ${materialProduct.name}.`);
            }
            simpleStockMap.set(materialProduct.id, availableStock - quantity);
          }

          const unitCost = getVariantOrProductRealUnitCost(purchases, materialProduct.id, selectedVariant?.id);
          const unitPrice = getVariantSalePrice(materialProduct, selectedVariant?.id);
          return {
            productId: materialProduct.id,
            variantId: selectedVariant?.id,
            variantName: selectedVariant?.name ?? material.variantName?.trim() ?? undefined,
            quantity,
            unitCost,
            totalCost: quantity * unitCost,
            unitPrice,
            totalRevenue: quantity * unitPrice,
          };
        }),
      })).filter(
        (serviceItem) =>
          serviceItem.price > 0 ||
          serviceItem.cost > 0 ||
          serviceItem.materials.length > 0 ||
          serviceItem.cueReference
      );

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
      const giftProduct = baseProducts.find((product) => product.id === productId);
      const availableGiftStock = getStoredProductStock(giftProduct);
      const stockReservedBySale = lineRecords
        .filter((record) => record.lineItem.productId === productId)
        .reduce((sum, record) => sum + record.lineItem.quantity, 0);

      if (requestedQuantity > availableGiftStock - stockReservedBySale) {
        throw new Error('La cantidad de uno de los obsequios supera el stock disponible.');
      }
    }

    const saleBatchId = options?.saleBatchId ?? doc(collection(db, 'sale-batches')).id;

    const stockDeltas: Array<{ productId: string; quantity: number }> = [];
    const createdSales: Sale[] = lineRecords.map(({ lineItem, giftItems }) => {
      const saleRef = doc(collection(db, 'sales'));
      const giftedTotalCost = giftItems.reduce((sum, item) => sum + item.totalCost, 0);
      const firstGiftItem = giftItems[0];
      const sale: Sale = {
        id: saleRef.id,
        saleBatchId,
        customerId: isAnonymousCustomerName(normalizedCustomerName)
          ? undefined
          : buildCustomerId(normalizedCustomerName, normalizedCustomerPhone, normalizedCustomerDocument),
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
        customerName: normalizedCustomerName,
        customerPhone: normalizedCustomerPhone,
        customerDocument: normalizedCustomerDocument || undefined,
        paymentMethod: normalizedPaymentMethod,
        paymentReference: normalizedPaymentReference,
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
        customerId: sale.customerId ?? null,
        customerDocument: sale.customerDocument ?? null,
        paymentMethod: sale.paymentMethod,
        paymentReference: sale.paymentReference ?? null,
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
        notes: input.notes || `Venta registrada para ${normalizedCustomerName}`,
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
        notes: input.notes || `Venta registrada para ${normalizedCustomerName}`,
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
            `Obsequio asociado a ${targetProductName(baseProducts, lineItem.productId)} para ${normalizedCustomerName}`,
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
            `Obsequio asociado a ${targetProductName(baseProducts, lineItem.productId)} para ${normalizedCustomerName}`,
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
        const materials: ServiceMaterialItem[] = serviceItem.materials.map((material) => ({
          productId: material.productId,
          variantId: material.variantId,
          variantName: material.variantName,
          quantity: material.quantity,
          unitCost: material.unitCost,
          totalCost: material.totalCost,
        }));
        const totalMaterialRevenue = serviceItem.materials.reduce((sum, material) => sum + material.totalRevenue, 0);
        const totalMaterialCost = materials.reduce((sum, material) => sum + material.totalCost, 0);
        const totalRevenue = serviceItem.price + totalMaterialRevenue;
        const totalCost = serviceItem.cost + totalMaterialCost;
        const service: ServiceOrder = {
          id: serviceRef.id,
          serviceType: serviceItem.serviceType,
          serviceCategory: serviceItem.serviceCategory,
          source: 'sale-addon',
          saleId: linkedSale.id,
          saleBatchId,
          performedAt: input.soldAt,
          customerName: normalizedCustomerName,
          cueReference: serviceItem.cueReference,
          paymentMethod: normalizedPaymentMethod,
          paymentReference: normalizedPaymentReference,
          servicePrice: totalRevenue,
          totalRevenue,
          totalMaterialCost,
          totalOperationalCost: serviceItem.cost,
          totalCost,
          grossProfit: totalRevenue - totalCost,
          materials,
          notes:
            serviceItem.notes ||
            `Servicio asociado a la venta de ${targetProduct.name} para ${normalizedCustomerName}`,
          responsibleUser: input.responsibleUser,
        };

        batch.set(
          doc(db, 'services', service.id),
          serializeServiceForFirestore(service, Timestamp.fromDate(new Date(input.soldAt)))
        );

        materials.forEach((material) => {
          const serviceMovementRef = doc(collection(db, 'movements'));
          const movementNotes =
            serviceItem.notes ||
            `Material usado en servicio asociado a la venta de ${targetProduct.name} para ${normalizedCustomerName}`;
          batch.set(serviceMovementRef, {
            id: serviceMovementRef.id,
            saleId: linkedSale.id,
            serviceOrderId: service.id,
            productId: material.productId,
            variantId: material.variantId ?? null,
            variantName: material.variantName ?? null,
            type: 'exit',
            reason: 'service',
            quantity: -Math.abs(material.quantity),
            notes: movementNotes,
            occurredAt: Timestamp.fromDate(new Date(input.soldAt)),
            responsibleUser: input.responsibleUser,
            relatedUnitCost: material.unitCost,
          });
          batch.set(doc(db, 'inventory_movements', serviceMovementRef.id), {
            id: serviceMovementRef.id,
            saleId: linkedSale.id,
            serviceOrderId: service.id,
            productId: material.productId,
            variantId: material.variantId ?? null,
            variantName: material.variantName ?? null,
            sourceType: 'service',
            sourceId: service.id,
            type: 'exit',
            reason: 'service',
            quantity: -Math.abs(material.quantity),
            notes: movementNotes,
            occurredAt: Timestamp.fromDate(new Date(input.soldAt)),
            responsibleUser: input.responsibleUser,
            relatedUnitCost: material.unitCost,
          });
          stockDeltas.push({ productId: material.productId, quantity: -Math.abs(material.quantity) });
        });
      });
    });

    applyPublicStockMapToBatch(
      batch,
      buildForwardPublicStockMap(
        baseProducts,
        stockDeltas.map((item) => item.productId),
        stockDeltas,
        baseMovements
      )
    );
    applyVariantStockMapToBatch(batch, variantStockMap, baseProducts);

    if (!isAnonymousCustomerName(normalizedCustomerName)) {
      const customerId = buildCustomerId(normalizedCustomerName, normalizedCustomerPhone, normalizedCustomerDocument);
      const customerRevenue = createdSales.reduce((sum, sale) => sum + sale.totalSale, 0);
      const customerPayload: Omit<Customer, 'createdAt' | 'updatedAt'> = {
        id: customerId,
        fullName: normalizedCustomerName,
        normalizedName: normalizeSearchText(normalizedCustomerName),
        phone: normalizedCustomerPhone || undefined,
        documentNumber: normalizedCustomerDocument || undefined,
        lastSaleAt: input.soldAt,
        lastSaleBatchId: saleBatchId,
        saleCount: 0,
        totalRevenue: 0,
      };
      batch.set(
        doc(db, 'customers', customerId),
        {
          ...customerPayload,
          phone: customerPayload.phone ?? null,
          documentNumber: customerPayload.documentNumber ?? null,
          saleCount: options?.saleBatchId ? increment(0) : increment(createdSales.length),
          totalRevenue: options?.saleBatchId ? increment(0) : increment(customerRevenue),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (input.actorRole === 'sales') {
      const soldUnits = createdSales.reduce((sum, sale) => sum + sale.quantity, 0);
      queueAdminNotification(batch, {
        title: 'Nueva venta registrada',
        message: `${input.responsibleUser} registro ${createdSales.length} item(s) para ${normalizedCustomerName} por ${soldUnits} unidad(es).`,
        href: '/dashboard/ventas',
        createdAt: input.soldAt,
      });
    }

    return createdSales;
  };

  const getFreshProductsForSale = async (input: RegisterSaleInput) => {
    const touchedProductIds = new Set<string>();
    input.items.forEach((item) => {
      if (item.productId) touchedProductIds.add(item.productId);
      item.giftItems?.forEach((giftItem) => {
        if (giftItem.productId) touchedProductIds.add(giftItem.productId);
      });
      item.serviceItems?.forEach((serviceItem) => {
        serviceItem.materials?.forEach((material) => {
          if (material.productId) touchedProductIds.add(material.productId);
        });
      });
    });

    if (touchedProductIds.size === 0) {
      return products;
    }

    const freshProductDocs = await Promise.all(
      Array.from(touchedProductIds).map((productId) => getDoc(doc(db, 'products', productId)))
    );
    const freshProductsById = new Map(
      freshProductDocs
        .filter((snapshot) => snapshot.exists())
        .map((snapshot) => [snapshot.id, mapProductDocument(snapshot.id, snapshot.data())])
    );

    return products.map((product) => freshProductsById.get(product.id) ?? product);
  };

  const registerSaleInternal = async (
    input: RegisterSaleInput,
    baseMovements: InventoryMovement[] = movements,
    baseProducts: Product[] = products,
    options?: { saleBatchId?: string }
  ) => {
    const batch = writeBatch(db);
    const createdSales = addSaleWritesToBatch(batch, input, baseMovements, baseProducts, options);
    await runFirestoreWriteWithBackoff(() => batch.commit(), {
      retries: 0,
      initialDelayMs: 700,
      timeoutMs: 12000,
    });
    return createdSales;
  };

  const registerSale = async (input: RegisterSaleInput) => {
    const freshProducts = await getFreshProductsForSale(input);
    return registerSaleInternal(input, movements, freshProducts);
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
      linkedServiceOrders.forEach((service) => {
        service.materials
          .filter((material) => material.productId === product.id && material.variantId)
          .forEach((material) => {
            variantRestorations.set(
              material.variantId!,
              (variantRestorations.get(material.variantId!) ?? 0) + material.quantity
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
      const selectedVariant = getProductVariantById(targetProduct, item.variantId);
      if ((targetProduct.variants?.length ?? 0) > 0 && !selectedVariant) {
        throw new Error(`Selecciona la opcion disponible de ${targetProduct.name}.`);
      }
      const realUnitCost = getVariantOrProductRealUnitCost(
        purchases,
        item.productId,
        selectedVariant?.id
      );
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
      const restoredProduct = restoredProducts.find((product) => product.id === productId);
      const currentProduct = products.find((product) => product.id === productId);
      const restoredExistingQuantity =
        existingSales
          .flatMap((sale) => sale.lineItems)
          .filter((item) => item.productId === productId)
          .reduce((sum, item) => sum + item.quantity, 0) +
        existingSales
          .flatMap((sale) => sale.giftItems)
          .filter((item) => item.productId === productId)
          .reduce((sum, item) => sum + item.quantity, 0);
      const restoredStock =
        restoredProduct && getProductSaleMode(restoredProduct) === 'varianted'
          ? getStoredProductStock(restoredProduct)
          : getStoredProductStock(currentProduct) + restoredExistingQuantity;
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
    const saleMovementsToDelete = new Map<string, InventoryMovement>();
    movements
      .filter((movement) => existingSales.some((sale) => sale.id === movement.saleId))
      .forEach((movement) => saleMovementsToDelete.set(movement.id, movement));
    giftMovementsToUpdate.forEach((movement) => saleMovementsToDelete.set(movement.id, movement));
    saleMovementsToDelete.forEach((movement) => {
      batch.delete(doc(db, 'movements', movement.id));
      batch.delete(doc(db, 'inventory_movements', movement.id));
    });
    const remainingMovements = movements.filter(
      (movement) =>
        !existingSales.some((sale) => sale.id === movement.saleId) &&
        !saleMovementsToDelete.has(movement.id)
    );

    const updatedSales = addSaleWritesToBatch(
      batch,
      {
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
      },
      remainingMovements,
      restoredProducts,
      {
        saleBatchId,
        initialVariantStockMap: buildVariantStockMapFromProductState(restoredProducts),
      }
    );
    await batch.commit();
    return updatedSales;
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
      buildForwardPublicStockMap(products, [sale.productId], [
        { productId: sale.productId, quantity: Math.abs(input.quantity) },
      ])
    );
    if (sale.lineItems[0]?.variantId) {
      const variantStockMap = buildVariantStockMap(products, movements);
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
      buildForwardPublicStockMap(
        products,
        stockDeltas.map((item) => item.productId),
        stockDeltas
      )
    );
    const variantStockMap = buildVariantStockMap(products, movements);
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

  const buildServiceWritePlan = (
    input: RegisterServiceInput,
    baseMovements: InventoryMovement[] = movements,
    baseProducts: Product[] = products,
    options?: { serviceId?: string }
  ) => {
    if ((Number(input.servicePrice) || 0) <= 0) {
      throw new Error('El valor del servicio debe ser mayor a cero.');
    }
    const normalizedPaymentMethod = SERVICES_PAYMENT_FIELDS_ENABLED
      ? input.paymentMethod.trim()
      : 'efectivo';
    const normalizedPaymentReference = SERVICES_PAYMENT_FIELDS_ENABLED
      ? input.paymentReference?.trim() ?? ''
      : '';
    if (SERVICES_PAYMENT_FIELDS_ENABLED && !normalizedPaymentMethod) {
      throw new Error('Selecciona el metodo de pago.');
    }

    const directServiceCost = Math.max(Number(input.serviceCost ?? 0), 0);
    const materialMap = new Map<string, { productId: string; variantId?: string; variantName?: string; quantity: number }>();
    input.materials.forEach((item) => {
      const productId = item.productId?.trim();
      const variantId = item.variantId?.trim() || undefined;
      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (!productId) {
        throw new Error('Selecciona todos los productos usados en el servicio.');
      }
      if (quantity <= 0) {
        throw new Error('La cantidad de cada producto consumido debe ser mayor a cero.');
      }
      const materialKey = `${productId}::${variantId ?? ''}`;
      const current = materialMap.get(materialKey);
      materialMap.set(materialKey, {
        productId,
        variantId,
        variantName: item.variantName?.trim() || undefined,
        quantity: (current?.quantity ?? 0) + quantity,
      });
    });

    const materials: ServiceMaterialItem[] = Array.from(materialMap.values()).map(({ productId, variantId, variantName, quantity }) => {
      const product = baseProducts.find((item) => item.id === productId);
      if (!product) {
        throw new Error('Uno de los productos del servicio no existe en el inventario.');
      }

      const selectedVariant = variantId ? getProductVariantById(product, variantId) : null;
      if (getProductSaleMode(product) === 'varianted' && !selectedVariant) {
        throw new Error(`Selecciona una variante valida para ${product.name} en el servicio.`);
      }

      const availableStock = selectedVariant
        ? getProductVariantStock(product, selectedVariant.id, baseMovements)
        : getStoredProductStock(product);
      if (quantity > availableStock) {
        throw new Error(
          `La cantidad usada supera el stock disponible de ${selectedVariant ? `${product.name} - ${selectedVariant.name}` : product.name}.`
        );
      }

      const unitCost = getVariantOrProductRealUnitCost(purchases, productId, selectedVariant?.id);
      return {
        productId,
        variantId: selectedVariant?.id,
        variantName: selectedVariant?.name ?? variantName,
        quantity,
        unitCost,
        totalCost: quantity * unitCost,
      };
    });

    const serviceRef = options?.serviceId ? doc(db, 'services', options.serviceId) : doc(collection(db, 'services'));
    const totalMaterialCost = materials.reduce((sum, item) => sum + item.totalCost, 0);
    const totalRevenue = Number(input.servicePrice) || 0;
    const totalCost = totalMaterialCost + directServiceCost;
    const grossProfit = totalRevenue - totalCost;
    const service: ServiceOrder = {
      id: serviceRef.id,
      serviceType: input.serviceType,
      serviceLabel: input.serviceLabel?.trim() || undefined,
      serviceCategory: input.serviceCategory?.trim() || undefined,
      source: input.source === 'sale-addon' ? 'sale-addon' : 'standalone',
      saleId: input.saleId?.trim() || undefined,
      saleBatchId: input.saleBatchId?.trim() || undefined,
      performedAt: input.performedAt,
      customerName: input.customerName,
      cueReference: input.cueReference,
      paymentMethod: normalizedPaymentMethod,
      paymentReference: normalizedPaymentReference,
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

    return { service, materials };
  };

  const addServiceWritesToBatch = (
    batch: ReturnType<typeof writeBatch>,
    input: RegisterServiceInput,
    plan: { service: ServiceOrder; materials: ServiceMaterialItem[] },
    baseProducts: Product[],
    baseMovements: InventoryMovement[],
    extraTouchedProductIds: string[] = [],
    extraTouchedVariantProductIds: string[] = []
  ) => {
    const { service, materials } = plan;
    batch.set(
      doc(db, 'services', service.id),
      serializeServiceForFirestore(service, Timestamp.fromDate(new Date(input.performedAt)))
    );

    const stockDeltas: Array<{ productId: string; quantity: number }> = [];
    const variantStockMap = buildVariantStockMap(baseProducts, baseMovements);
    materials.forEach((material) => {
      const movementRef = doc(collection(db, 'movements'));
      batch.set(movementRef, {
        id: movementRef.id,
        serviceOrderId: service.id,
        productId: material.productId,
        variantId: material.variantId ?? null,
        variantName: material.variantName ?? null,
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
      batch.set(doc(db, 'inventory_movements', movementRef.id), {
        id: movementRef.id,
        serviceOrderId: service.id,
        productId: material.productId,
        variantId: material.variantId ?? null,
        variantName: material.variantName ?? null,
        sourceType: 'service',
        sourceId: service.id,
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

      if (material.variantId) {
        const productVariantMap = variantStockMap.get(material.productId);
        const currentStock = productVariantMap?.get(material.variantId) ?? 0;
        productVariantMap?.set(material.variantId, currentStock - Math.abs(material.quantity));
      }
    });

    applyPublicStockMapToBatch(
      batch,
      buildForwardPublicStockMap(
        baseProducts,
        [...extraTouchedProductIds, ...stockDeltas.map((item) => item.productId)],
        stockDeltas,
        baseMovements
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

    const touchedVariantProducts = Array.from(
      new Set([
        ...extraTouchedVariantProductIds,
        ...materials.filter((material) => material.variantId).map((material) => material.productId),
      ])
    );
    if (touchedVariantProducts.length > 0) {
      applyVariantStockMapToBatch(batch, variantStockMap, baseProducts);
    }

  };

  const registerServiceInternal = async (
    input: RegisterServiceInput,
    baseMovements: InventoryMovement[] = movements,
    baseProducts: Product[] = products,
    options?: { serviceId?: string }
  ) => {
    const plan = buildServiceWritePlan(input, baseMovements, baseProducts, options);
    const batch = writeBatch(db);
    addServiceWritesToBatch(batch, input, plan, baseProducts, baseMovements);
    await batch.commit();
    return plan.service;
  };

  const registerService = async (input: RegisterServiceInput) => {
    return registerServiceInternal(input);
  };

  const updateService = async (serviceId: string, input: RegisterServiceInput) => {
    const existingService = services.find((service) => service.id === serviceId);
    if (!existingService) {
      throw new Error('No se encontro el servicio a editar.');
    }
    if (existingService.source === 'sale-addon') {
      throw new Error('Los servicios asociados a una venta deben editarse desde la venta original.');
    }

    const linkedMovements = movements.filter((movement) => movement.serviceOrderId === serviceId);
    const restoredProducts = products.map((product) => {
      const variantRestorations = new Map<string, number>();
      existingService.materials
        .filter((item) => item.productId === product.id && item.variantId)
        .forEach((item) => {
          variantRestorations.set(
            item.variantId!,
            (variantRestorations.get(item.variantId!) ?? 0) + item.quantity
          );
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

    const remainingMovements = movements.filter((movement) => movement.serviceOrderId !== serviceId);
    const plan = buildServiceWritePlan(input, remainingMovements, restoredProducts, { serviceId });

    const batch = writeBatch(db);
    linkedMovements.forEach((movement) => {
      batch.delete(doc(db, 'movements', movement.id));
      batch.delete(doc(db, 'inventory_movements', movement.id));
    });
    addServiceWritesToBatch(
      batch,
      input,
      plan,
      restoredProducts,
      remainingMovements,
      linkedMovements.map((movement) => movement.productId),
      linkedMovements.filter((movement) => movement.variantId).map((movement) => movement.productId)
    );
    await batch.commit();

    return plan.service;
  };

  const createServiceVisit = async (input: CreateServiceVisitInput): Promise<ServiceVisit> => {
    const customerName = input.customerName.trim();
    const cueReference = input.cueReference.trim();
    const scheduledAt = input.scheduledAt.trim();
    const createdBy = input.createdBy.trim();

    if (!customerName) {
      throw new Error('Ingresa el nombre del cliente para agendar la visita.');
    }
    if (!cueReference) {
      throw new Error('Ingresa la referencia del taco o servicio a visitar.');
    }
    if (!scheduledAt) {
      throw new Error('Selecciona la fecha y hora de la visita.');
    }
    if (!createdBy) {
      throw new Error('No se pudo identificar quien agenda la visita.');
    }

    const visitRef = doc(collection(db, 'service-visits'));
    const now = new Date().toISOString();
    const visit: ServiceVisit = {
      id: visitRef.id,
      status: 'scheduled',
      customerName,
      customerPhone: input.customerPhone?.trim() || undefined,
      cueReference,
      scheduledAt,
      address: input.address?.trim() || undefined,
      zone: input.zone?.trim() || undefined,
      logisticsNotes: input.logisticsNotes?.trim() || '',
      createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(visitRef, {
      ...visit,
      customerPhone: visit.customerPhone ?? null,
      address: visit.address ?? null,
      zone: visit.zone ?? null,
      assignedTechnicianId: null,
      assignedTechnicianName: null,
      assignedBy: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelledReason: null,
      linkedServiceOrderId: null,
      scheduledAt: Timestamp.fromDate(new Date(scheduledAt)),
      createdAt: Timestamp.fromDate(new Date(now)),
      updatedAt: Timestamp.fromDate(new Date(now)),
    });

    return visit;
  };

  const assignServiceVisit = async (
    visitId: string,
    input: AssignServiceVisitInput
  ): Promise<ServiceVisit> => {
    const visit = serviceVisits.find((item) => item.id === visitId);
    if (!visit) {
      throw new Error('No se encontro la visita a asignar.');
    }
    if (visit.status !== 'scheduled') {
      throw new Error('Solo se pueden asignar visitas agendadas.');
    }

    const technicianId = input.technicianId.trim();
    const technicianName = input.technicianName.trim();
    const assignedBy = input.assignedBy.trim();
    if (!technicianId || !technicianName) {
      throw new Error('Selecciona el tecnico que atendera la visita.');
    }
    if (!assignedBy) {
      throw new Error('No se pudo identificar quien realiza la asignacion.');
    }

    const updatedAt = new Date().toISOString();
    await updateDoc(doc(db, 'service-visits', visitId), {
      status: 'assigned',
      assignedTechnicianId: technicianId,
      assignedTechnicianName: technicianName,
      assignedBy,
      updatedAt: Timestamp.fromDate(new Date(updatedAt)),
    });

    return {
      ...visit,
      status: 'assigned',
      assignedTechnicianId: technicianId,
      assignedTechnicianName: technicianName,
      assignedBy,
      updatedAt,
    };
  };

  const startServiceVisit = async (visitId: string): Promise<ServiceVisit> => {
    const visit = serviceVisits.find((item) => item.id === visitId);
    if (!visit) {
      throw new Error('No se encontro la visita a iniciar.');
    }
    if (visit.status !== 'assigned') {
      throw new Error('Solo se pueden iniciar visitas asignadas.');
    }
    if (!visit.assignedTechnicianId || !visit.assignedTechnicianName) {
      throw new Error('La visita debe tener un tecnico asignado antes de iniciar.');
    }
    if (visit.linkedServiceOrderId) {
      throw new Error('Esta visita ya tiene un servicio enlazado.');
    }

    const startedAt = new Date().toISOString();
    await updateDoc(doc(db, 'service-visits', visitId), {
      status: 'in_progress',
      startedAt: Timestamp.fromDate(new Date(startedAt)),
      updatedAt: Timestamp.fromDate(new Date(startedAt)),
    });

    return {
      ...visit,
      status: 'in_progress',
      startedAt,
      updatedAt: startedAt,
    };
  };

  const completeServiceVisit = async (
    visitId: string,
    serviceOrderId: string
  ): Promise<ServiceVisit> => {
    const visit = serviceVisits.find((item) => item.id === visitId);
    if (!visit) {
      throw new Error('No se encontro la visita a completar.');
    }
    if (visit.status !== 'in_progress') {
      throw new Error('Solo se pueden completar visitas en progreso.');
    }
    if (visit.linkedServiceOrderId) {
      throw new Error('Esta visita ya tiene un servicio enlazado.');
    }

    const normalizedServiceOrderId = serviceOrderId.trim();
    if (!normalizedServiceOrderId) {
      throw new Error('Debes indicar el servicio enlazado para completar la visita.');
    }

    const completedAt = new Date().toISOString();
    await updateDoc(doc(db, 'service-visits', visitId), {
      status: 'completed',
      linkedServiceOrderId: normalizedServiceOrderId,
      completedAt: Timestamp.fromDate(new Date(completedAt)),
      updatedAt: Timestamp.fromDate(new Date(completedAt)),
    });

    return {
      ...visit,
      status: 'completed',
      linkedServiceOrderId: normalizedServiceOrderId,
      completedAt,
      updatedAt: completedAt,
    };
  };

  const cancelServiceVisit = async (visitId: string, reason: string): Promise<ServiceVisit> => {
    const visit = serviceVisits.find((item) => item.id === visitId);
    if (!visit) {
      throw new Error('No se encontro la visita a cancelar.');
    }
    if (!['scheduled', 'assigned', 'in_progress'].includes(visit.status)) {
      throw new Error('Solo se pueden cancelar visitas activas.');
    }
    if (visit.linkedServiceOrderId) {
      throw new Error('No puedes cancelar una visita que ya tiene un servicio enlazado.');
    }

    const cancelledReason = reason.trim();
    if (!cancelledReason) {
      throw new Error('Escribe el motivo de la cancelacion.');
    }

    const cancelledAt = new Date().toISOString();
    await updateDoc(doc(db, 'service-visits', visitId), {
      status: 'cancelled',
      cancelledReason,
      cancelledAt: Timestamp.fromDate(new Date(cancelledAt)),
      updatedAt: Timestamp.fromDate(new Date(cancelledAt)),
    });

    return {
      ...visit,
      status: 'cancelled',
      cancelledReason,
      cancelledAt,
      updatedAt: cancelledAt,
    };
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
      draftSalePayload: input.draftSalePayload,
      createdAt,
      updatedAt: createdAt,
    };

    const batch = writeBatch(db);
    batch.set(requestRef, {
      ...request,
      draftSalePayload: request.draftSalePayload ?? null,
      createdAt: Timestamp.fromDate(new Date(createdAt)),
      updatedAt: Timestamp.fromDate(new Date(createdAt)),
    });

    queueAdminNotification(batch, {
      title:
        input.requestType === 'sale-return'
          ? 'Solicitud de devolucion'
          : input.requestType === 'sale-discount'
            ? 'Solicitud de descuento'
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
        customers,
        services,
        serviceVisits,
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
        createCustomer,
        updateCustomer,
        registerMovement,
        registerInitialStock,
        registerInitialStockBatch,
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
        updateService,
        createServiceVisit,
        assignServiceVisit,
        startServiceVisit,
        completeServiceVisit,
        cancelServiceVisit,
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
