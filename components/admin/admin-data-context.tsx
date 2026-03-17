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
  calculateMargin,
  calculatePurchaseImpact,
  calculatePurchaseTotals,
  getDashboardSummary,
  getLatestMovements,
} from '@/lib/admin/calculations';
import { initialMovements, initialProducts, initialPurchases } from '@/lib/admin/mock-data';
import type {
  DashboardSummary,
  InventoryMovement,
  MovementReason,
  MovementType,
  Product,
  Purchase,
} from '@/lib/admin/types';

type NewProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'profitMargin'>;

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
  productId: string;
  supplier: string;
  purchasedAt: string;
  presentationQuantity: number;
  purchasePresentation: Purchase['purchasePresentation'];
  conversionFactor: number;
  purchaseValueTotal: number;
  shippingValueTotal: number;
  suggestedSalePrice: number;
}

interface AdminDataContextValue {
  loading: boolean;
  products: Product[];
  movements: InventoryMovement[];
  purchases: Purchase[];
  summary: DashboardSummary;
  latestMovements: InventoryMovement[];
  createProduct: (input: NewProductInput) => Product;
  updateProduct: (productId: string, input: NewProductInput) => Product | undefined;
  deleteProduct: (productId: string) => void;
  registerMovement: (input: RegisterMovementInput) => InventoryMovement | undefined;
  registerPurchase: (input: RegisterPurchaseInput) => Purchase | undefined;
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined);

function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [movements, setMovements] = useState<InventoryMovement[]>(initialMovements);
  const [purchases, setPurchases] = useState<Purchase[]>(initialPurchases);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 550);
    return () => window.clearTimeout(timer);
  }, []);

  const createProduct = (input: NewProductInput) => {
    const createdAt = new Date().toISOString();
    const newProduct: Product = {
      ...input,
      id: generateId('prod'),
      profitMargin: calculateMargin(input.realUnitCost, input.salePrice),
      createdAt,
      updatedAt: createdAt,
    };

    setProducts((current) => [newProduct, ...current]);
    return newProduct;
  };

  const updateProduct = (productId: string, input: NewProductInput) => {
    let updatedProduct: Product | undefined;

    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) return product;

        updatedProduct = {
          ...product,
          ...input,
          profitMargin: calculateMargin(input.realUnitCost, input.salePrice),
          updatedAt: new Date().toISOString(),
        };

        return updatedProduct;
      })
    );

    return updatedProduct;
  };

  const deleteProduct = (productId: string) => {
    setProducts((current) => current.filter((product) => product.id !== productId));
    setMovements((current) => current.filter((movement) => movement.productId !== productId));
    setPurchases((current) => current.filter((purchase) => purchase.productId !== productId));
  };

  const registerMovement = (input: RegisterMovementInput) => {
    const targetProduct = products.find((product) => product.id === input.productId);
    if (!targetProduct) return undefined;

    const normalizedQuantity =
      input.type === 'exit' ? -Math.abs(input.quantity) : input.quantity;
    const nextStock = Math.max(targetProduct.stockQuantity + normalizedQuantity, 0);
    const movement: InventoryMovement = {
      id: generateId('mov'),
      productId: input.productId,
      type: input.type,
      reason: input.reason,
      quantity: normalizedQuantity,
      notes: input.notes,
      occurredAt: new Date().toISOString(),
      responsibleUser: input.responsibleUser,
      relatedUnitCost: input.relatedUnitCost ?? targetProduct.realUnitCost,
    };

    setProducts((current) =>
      current.map((product) =>
        product.id === input.productId
          ? { ...product, stockQuantity: nextStock, updatedAt: new Date().toISOString() }
          : product
      )
    );
    setMovements((current) => [movement, ...current]);

    return movement;
  };

  const registerPurchase = (input: RegisterPurchaseInput) => {
    const targetProduct = products.find((product) => product.id === input.productId);
    if (!targetProduct) return undefined;

    const quantityPurchased = input.presentationQuantity * input.conversionFactor;
    const totals = calculatePurchaseTotals(
      input.purchaseValueTotal,
      input.shippingValueTotal,
      quantityPurchased
    );
    const purchase: Purchase = {
      id: generateId('buy'),
      productId: input.productId,
      supplier: input.supplier,
      purchasedAt: input.purchasedAt,
      presentationQuantity: input.presentationQuantity,
      quantityPurchased,
      purchasePresentation: input.purchasePresentation,
      conversionFactor: input.conversionFactor,
      purchaseValueTotal: input.purchaseValueTotal,
      shippingValueTotal: input.shippingValueTotal,
      totalInvestment: totals.totalInvestment,
      realUnitCost: totals.realUnitCost,
      suggestedSalePrice: input.suggestedSalePrice,
      estimatedMargin: calculateMargin(totals.realUnitCost, input.suggestedSalePrice),
    };

    const productImpact = calculatePurchaseImpact(targetProduct, {
      quantityPurchased,
      realUnitCost: totals.realUnitCost,
      shippingValueTotal: input.shippingValueTotal,
      purchaseValueTotal: input.purchaseValueTotal,
    });

    setPurchases((current) => [purchase, ...current]);
    setProducts((current) =>
      current.map((product) =>
        product.id === input.productId
          ? {
              ...product,
              ...productImpact,
              salePrice: input.suggestedSalePrice,
              updatedAt: new Date().toISOString(),
            }
          : product
      )
    );
    setMovements((current) => [
      {
        id: generateId('mov'),
        productId: input.productId,
        type: 'purchase',
        reason: 'purchase',
        quantity: quantityPurchased,
        notes: `Compra registrada a proveedor ${input.supplier}`,
        occurredAt: input.purchasedAt,
        responsibleUser: 'Administrador',
        relatedUnitCost: totals.realUnitCost,
      },
      ...current,
    ]);

    return purchase;
  };

  const summary = useMemo(() => getDashboardSummary(products), [products]);
  const latestMovements = useMemo(() => getLatestMovements(movements), [movements]);

  return (
    <AdminDataContext.Provider
      value={{
        loading,
        products,
        movements,
        purchases,
        summary,
        latestMovements,
        createProduct,
        updateProduct,
        deleteProduct,
        registerMovement,
        registerPurchase,
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
