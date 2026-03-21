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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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
} from '@/lib/admin/calculations';
import { initialMovements, initialProducts, initialPurchases, initialSales, initialSuppliers } from '@/lib/admin/mock-data';
import { db } from '@/lib/firebase';
import type {
  DashboardSummary,
  InventoryMovement,
  MovementReason,
  MovementType,
  Product,
  Purchase,
  Sale,
  SaleGiftItem,
  SaleLineItem,
  Supplier,
} from '@/lib/admin/types';

type NewProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
type NewSupplierInput = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>;

interface RegisterMovementInput {
  productId: string;
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
    presentationQuantity: number;
    purchaseUnitValue: number;
    suggestedSalePrice: number;
  }>;
}

interface RegisterInitialStockInput {
  productId: string;
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
    quantity: number;
    unitPrice: number;
  }>;
  giftItems?: Array<{
    productId: string;
    quantity: number;
  }>;
  customerName: string;
  notes: string;
  responsibleUser: string;
}

interface RegisterSaleReturnInput {
  saleId: string;
  returnedAt: string;
  quantity: number;
  notes: string;
  responsibleUser: string;
}

interface AdminDataContextValue {
  loading: boolean;
  products: Product[];
  suppliers: Supplier[];
  movements: InventoryMovement[];
  purchases: Purchase[];
  sales: Sale[];
  summary: DashboardSummary;
  latestMovements: InventoryMovement[];
  createProduct: (input: NewProductInput) => Promise<Product>;
  updateProduct: (productId: string, input: NewProductInput) => Promise<Product>;
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
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined);

function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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
  return {
    id: documentId,
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    category: String(data.category ?? ''),
    subcategory: String(data.subcategory ?? ''),
    brand: String(data.brand ?? ''),
    salePrice: Number(data.salePrice ?? 0),
    image: String(data.image ?? '/images/logo.png'),
    imageRotation: Number(data.imageRotation ?? 0),
    status:
      data.status === 'draft' || data.status === 'archived' || data.status === 'active'
        ? data.status
        : 'active',
    createdAt: normalizeDateValue(data.createdAt),
    updatedAt: normalizeDateValue(data.updatedAt),
  };
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
    purchaseId: data.purchaseId ? String(data.purchaseId) : undefined,
    purchaseBatchId: data.purchaseBatchId ? String(data.purchaseBatchId) : undefined,
    saleId: data.saleId ? String(data.saleId) : undefined,
    type:
      data.type === 'entry' || data.type === 'exit' || data.type === 'adjustment' || data.type === 'purchase'
        ? data.type
        : 'adjustment',
    reason:
      data.reason === 'purchase' ||
      data.reason === 'sale' ||
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
    purchaseBatchId: data.purchaseBatchId ? String(data.purchaseBatchId) : undefined,
    productId: String(data.productId ?? ''),
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
    ? data.giftItems.map((item) => ({
        productId: String(item?.productId ?? ''),
        quantity: Number(item?.quantity ?? 0),
        unitCost: Number(item?.unitCost ?? 0),
        totalCost: Number(item?.totalCost ?? 0),
      })).filter((item) => item.productId && item.quantity > 0)
    : legacyGiftedProductId && legacyGiftedQuantity > 0
      ? [
          {
            productId: legacyGiftedProductId,
            quantity: legacyGiftedQuantity,
            unitCost: legacyGiftedUnitCost,
            totalCost: legacyGiftedTotalCost,
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
    notes: String(data.notes ?? ''),
    responsibleUser: String(data.responsibleUser ?? 'Administrador'),
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

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements);
  const [purchases, setPurchases] = useState<Purchase[]>(initialPurchases);
  const [sales, setSales] = useState<Sale[]>(initialSales);

  useEffect(() => {
    const readyCollections = new Set<string>();
    const markReady = (collectionName: string) => {
      readyCollections.add(collectionName);
      if (readyCollections.size === 5) {
        setLoading(false);
      }
    };

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

    return () => {
      unsubProducts();
      unsubSuppliers();
      unsubMovements();
      unsubPurchases();
      unsubSales();
    };
  }, []);

  const createProduct = async (input: NewProductInput) => {
    const createdAt = new Date().toISOString();
    const productRef = doc(collection(db, 'products'));
    const newProduct: Product = {
      ...input,
      id: productRef.id,
      createdAt,
      updatedAt: createdAt,
    };

    await setDoc(productRef, {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return newProduct;
  };

  const updateProduct = async (productId: string, input: NewProductInput) => {
    const existingProduct = products.find((product) => product.id === productId);
    if (!existingProduct) {
      throw new Error('No se encontro el producto a actualizar.');
    }

    await updateDoc(doc(db, 'products', productId), {
      ...input,
      updatedAt: serverTimestamp(),
    });

    return {
      ...existingProduct,
      ...input,
      updatedAt: new Date().toISOString(),
    };
  };

  const deleteProduct = async (productId: string) => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'products', productId));
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

    const normalizedQuantity =
      input.type === 'exit' ? -Math.abs(input.quantity) : input.quantity;
    const movementRef = doc(collection(db, 'movements'));
    const movement: InventoryMovement = {
      id: movementRef.id,
      productId: input.productId,
      type: input.type,
      reason: input.reason,
      quantity: normalizedQuantity,
      notes: input.notes,
      occurredAt: new Date().toISOString(),
      responsibleUser: input.responsibleUser,
      relatedUnitCost:
        input.relatedUnitCost ?? getProductRealUnitCost(purchases, input.productId),
    };

    await setDoc(movementRef, {
      ...movement,
      occurredAt: serverTimestamp(),
    });

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
      productId: input.productId,
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
      purchasedAt: Timestamp.fromDate(new Date(input.occurredAt)),
    });
    batch.set(doc(db, 'movements', movement.id), {
      ...movement,
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

    await batch.commit();

    return {
      movement,
      purchase,
    };
  };

  const createPurchaseBatch = async (input: RegisterPurchaseInput, existingBatchId?: string) => {
    if (input.items.length === 0) {
      throw new Error('Agrega al menos un producto a la compra.');
    }

    input.items.forEach((item) => {
      const targetProduct = products.find((product) => product.id === item.productId);
      if (!targetProduct) {
        throw new Error('Uno de los productos de la compra no existe.');
      }
    });

    const totalPurchasedUnits = input.items.reduce(
      (total, item) => total + Number(item.presentationQuantity || 0),
      0
    );
    const totalPurchaseValue = input.items.reduce(
      (total, item) => total + Number((Number(item.purchaseUnitValue || 0) * Number(item.presentationQuantity || 0)).toFixed(2)),
      0
    );
    const batchId = existingBatchId ?? doc(collection(db, 'purchase-batches')).id;
    const batch = writeBatch(db);
    const purchasesCreated: Purchase[] = [];

    input.items.forEach((item, index) => {
      const conversionFactor = 1;
      const quantityPurchased = Number(item.presentationQuantity) || 0;
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
        purchaseBatchId: batchId,
        productId: item.productId,
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
        purchasedAt: Timestamp.fromDate(new Date(input.purchasedAt)),
      });
      batch.set(movementRef, {
        id: movementRef.id,
        productId: item.productId,
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
      batch.update(doc(db, 'products', item.productId), {
        salePrice: item.suggestedSalePrice,
        updatedAt: serverTimestamp(),
      });
    });

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

    return createPurchaseBatch(input, batchId);
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

    const [updatedPurchase] = await createPurchaseBatch(input, targetPurchase.purchaseBatchId);
    return updatedPurchase;
  };

  const deletePurchase = async (purchaseId: string) => {
    const targetPurchase = purchases.find((purchase) => purchase.id === purchaseId);
    if (!targetPurchase) {
      throw new Error('No se encontro la compra a eliminar.');
    }

    const batch = writeBatch(db);
    batch.delete(doc(db, 'purchases', purchaseId));
    movements
      .filter((movement) => movement.purchaseId === purchaseId)
      .forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    await batch.commit();
  };

  const deletePurchaseBatch = async (batchId: string) => {
    const targetPurchases = purchases.filter((purchase) => purchase.purchaseBatchId === batchId);
    if (targetPurchases.length === 0) {
      throw new Error('No se encontro la compra agrupada a eliminar.');
    }

    const batch = writeBatch(db);
    targetPurchases.forEach((purchase) => batch.delete(doc(db, 'purchases', purchase.id)));
    movements
      .filter((movement) => movement.purchaseBatchId === batchId)
      .forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    await batch.commit();
  };

  const registerSale = async (input: RegisterSaleInput) => {
    if (input.items.length === 0) {
      throw new Error('Agrega al menos un producto a la venta.');
    }

    const lineItems: SaleLineItem[] = input.items.map((item) => {
      const targetProduct = products.find((product) => product.id === item.productId);
      if (!targetProduct) {
        throw new Error('No se encontro uno de los productos para registrar la venta.');
      }
      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (quantity <= 0) {
        throw new Error('La cantidad vendida debe ser mayor a cero.');
      }
      const availableStock = getProductStock(movements, item.productId);
      if (quantity > availableStock) {
        throw new Error(`La cantidad vendida supera el stock disponible de ${targetProduct.name}.`);
      }
      const realUnitCost = getProductRealUnitCost(purchases, item.productId);
      return {
        productId: item.productId,
        quantity,
        unitPrice: Number(item.unitPrice ?? 0),
        realUnitCost,
        totalSale: quantity * Number(item.unitPrice ?? 0),
        totalCost: quantity * realUnitCost,
      };
    });

    const requestedGiftTotals = new Map<string, number>();
    const giftItems: SaleGiftItem[] = (input.giftItems ?? []).map((item) => {
      const productId = item.productId?.trim();
      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (!productId) {
        throw new Error('Selecciona el producto obsequiado.');
      }
      if (quantity <= 0) {
        throw new Error('La cantidad del obsequio debe ser mayor a cero.');
      }
      const giftedProduct = products.find((product) => product.id === productId);
      if (!giftedProduct) {
        throw new Error('No se encontro uno de los productos obsequiados.');
      }
      requestedGiftTotals.set(productId, (requestedGiftTotals.get(productId) ?? 0) + quantity);
      const unitCost = getProductRealUnitCost(purchases, productId);
      return {
        productId,
        quantity,
        unitCost,
        totalCost: quantity * unitCost,
      };
    });

    for (const [productId, requestedQuantity] of requestedGiftTotals) {
      const availableGiftStock = getProductStock(movements, productId);
      const stockReservedBySale = lineItems
        .filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (requestedQuantity > availableGiftStock - stockReservedBySale) {
        throw new Error('La cantidad de uno de los obsequios supera el stock disponible.');
      }
    }

    const totalSale = lineItems.reduce((sum, item) => sum + item.totalSale, 0);
    const giftedTotalCost = giftItems.reduce((sum, item) => sum + item.totalCost, 0);
    const firstGiftItem = giftItems[0];
    const totalCost = lineItems.reduce((sum, item) => sum + item.totalCost, 0) + giftedTotalCost;
    const grossProfit = totalSale - totalCost;

    const saleBatchId = doc(collection(db, 'sale-batches')).id;

    const batch = writeBatch(db);
    const createdSales: Sale[] = lineItems.map((lineItem, index) => {
      const saleRef = doc(collection(db, 'sales'));
      const sale: Sale = {
        id: saleRef.id,
        saleBatchId,
        productId: lineItem.productId,
        soldAt: input.soldAt,
        quantity: lineItem.quantity,
        unitPrice: lineItem.unitPrice,
        totalSale: lineItem.totalSale,
        realUnitCost: lineItem.realUnitCost,
        totalCost: lineItem.totalCost + (index === 0 ? giftedTotalCost : 0),
        grossProfit: lineItem.totalSale - lineItem.totalCost - (index === 0 ? giftedTotalCost : 0),
        lineItems: [lineItem],
        giftItems: index === 0 ? giftItems : [],
        giftedProductId: index === 0 ? firstGiftItem?.productId : undefined,
        giftedQuantity: index === 0 ? firstGiftItem?.quantity ?? 0 : 0,
        giftedUnitCost: index === 0 ? firstGiftItem?.unitCost ?? 0 : 0,
        giftedTotalCost: index === 0 ? giftedTotalCost : 0,
        returnedQuantity: 0,
        returnedSaleAmount: 0,
        returnedCostAmount: 0,
        customerName: input.customerName,
        notes: input.notes,
        responsibleUser: input.responsibleUser,
      };
      batch.set(doc(db, 'sales', sale.id), {
        ...sale,
        giftedProductId: sale.giftedProductId ?? null,
        soldAt: Timestamp.fromDate(new Date(input.soldAt)),
      });
      const movementRef = doc(collection(db, 'movements'));
      batch.set(movementRef, {
        id: movementRef.id,
        saleId: sale.id,
        productId: lineItem.productId,
        type: 'exit',
        reason: 'sale',
        quantity: -Math.abs(lineItem.quantity),
        notes: input.notes || `Venta registrada${input.customerName ? ` para ${input.customerName}` : ''}`,
        occurredAt: Timestamp.fromDate(new Date(input.soldAt)),
        responsibleUser: input.responsibleUser,
        relatedUnitCost: lineItem.realUnitCost,
      });
      return sale;
    });

    for (const giftItem of giftItems) {
      const giftMovementRef = doc(collection(db, 'movements'));
      batch.set(giftMovementRef, {
        id: giftMovementRef.id,
        saleId: createdSales[0].id,
        productId: giftItem.productId,
        type: 'exit',
        reason: 'gift',
        quantity: -Math.abs(giftItem.quantity),
        notes:
          input.notes ||
          `Obsequio asociado a venta${input.customerName ? ` para ${input.customerName}` : ''}`,
        occurredAt: Timestamp.fromDate(new Date(input.soldAt)),
        responsibleUser: input.responsibleUser,
        relatedUnitCost: giftItem.unitCost,
      });
    }

    await batch.commit();

    return createdSales;
  };

  const updateSaleBatch = async (saleBatchId: string, input: RegisterSaleInput) => {
    const existingSales = sales.filter((sale) => (sale.saleBatchId ?? sale.id) === saleBatchId);
    if (existingSales.length === 0) {
      throw new Error('No se encontro la venta a editar.');
    }
    const existingSale = existingSales[0];
    const giftMovementsToUpdate = existingSales.flatMap((sale) => findGiftMovementForSale(movements, sale));
    const requestedGiftTotals = new Map<string, number>();
    const nextLineItems: SaleLineItem[] = input.items.map((item) => {
      const targetProduct = products.find((product) => product.id === item.productId);
      if (!targetProduct) {
        throw new Error('No se encontro uno de los productos para actualizar la venta.');
      }
      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (quantity <= 0) {
        throw new Error('La cantidad vendida debe ser mayor a cero.');
      }
      const realUnitCost = getProductRealUnitCost(purchases, item.productId);
      return {
        productId: item.productId,
        quantity,
        unitPrice: Number(item.unitPrice ?? 0),
        realUnitCost,
        totalSale: quantity * Number(item.unitPrice ?? 0),
        totalCost: quantity * realUnitCost,
      };
    });
    const giftItems: SaleGiftItem[] = (input.giftItems ?? []).map((item) => {
      const productId = item.productId?.trim();
      const quantity = Math.max(Number(item.quantity ?? 0), 0);
      if (!productId) {
        throw new Error('Selecciona el producto obsequiado.');
      }
      if (quantity <= 0) {
        throw new Error('La cantidad del obsequio debe ser mayor a cero.');
      }
      const giftedProduct = products.find((product) => product.id === productId);
      if (!giftedProduct) {
        throw new Error('No se encontro uno de los productos obsequiados.');
      }
      requestedGiftTotals.set(productId, (requestedGiftTotals.get(productId) ?? 0) + quantity);
      const unitCost = getProductRealUnitCost(purchases, productId);
      return {
        productId,
        quantity,
        unitCost,
        totalCost: quantity * unitCost,
      };
    });

    const touchedProductIds = new Set<string>([
      ...existingSales.flatMap((sale) => sale.lineItems.map((item) => item.productId)),
      ...nextLineItems.map((item) => item.productId),
      ...existingSales.flatMap((sale) => sale.giftItems.map((item) => item.productId)),
      ...giftItems.map((item) => item.productId),
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
        nextLineItems
          .filter((item) => item.productId === productId)
          .reduce((sum, item) => sum + item.quantity, 0) +
        (requestedGiftTotals.get(productId) ?? 0);

      if (requestedStock > restoredStock) {
        throw new Error(
          requestedGiftTotals.has(productId)
            ? 'La cantidad de uno de los obsequios supera el stock disponible.'
            : 'La cantidad vendida supera el stock disponible.'
        );
      }
    }

    const giftedTotalCost = giftItems.reduce((sum, item) => sum + item.totalCost, 0);
    const firstGiftItem = giftItems[0];
    const batch = writeBatch(db);
    existingSales.forEach((sale) => batch.delete(doc(db, 'sales', sale.id)));
    movements
      .filter((movement) => existingSales.some((sale) => sale.id === movement.saleId))
      .forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    giftMovementsToUpdate.forEach((movement) => batch.delete(doc(db, 'movements', movement.id)));
    await batch.commit();

    return registerSale({
      ...input,
      items: nextLineItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
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
      type: 'entry',
      reason: 'return',
      quantity: Math.abs(input.quantity),
      notes: input.notes || `Devolucion registrada de ${sale.customerName || 'cliente'}`,
      occurredAt: Timestamp.fromDate(new Date(input.returnedAt)),
      responsibleUser: input.responsibleUser,
      relatedUnitCost: sale.realUnitCost,
    });

    await batch.commit();

    return {
      ...sale,
      returnedQuantity: nextReturnedQuantity,
      returnedSaleAmount: nextReturnedSaleAmount,
      returnedCostAmount: nextReturnedCostAmount,
    };
  };

  const summary = useMemo(
    () => getDashboardSummary(products, movements, purchases, sales),
    [movements, products, purchases, sales]
  );
  const latestMovements = useMemo(() => getLatestMovements(movements), [movements]);

  return (
    <AdminDataContext.Provider
      value={{
        loading,
        products,
        suppliers,
        movements,
        purchases,
        sales,
        summary,
        latestMovements,
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
