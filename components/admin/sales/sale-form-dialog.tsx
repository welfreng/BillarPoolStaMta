'use client';

import Image from 'next/image';
import { useEffect, useId, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CalendarDays,
  Check,
  ClipboardList,
  Coins,
  Gift,
  MinusCircle,
  PackageCheck,
  Pencil,
  PlusCircle,
  ReceiptText,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import { AdminMobileSection } from '@/components/admin/admin-mobile-section';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { CustomerAutocomplete } from '@/components/admin/shared/customer-autocomplete';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatNumber, getStoredProductStock, getVariantOrProductRealUnitCost } from '@/lib/admin/calculations';
import { serviceTypeLabels } from '@/lib/admin/catalogs';
import { getTodayDateInputValue } from '@/lib/admin/date-utils';
import { matchesProductCategoryFamily } from '@/lib/admin/category-rules';
import {
  formatSaleGiftCategoryList,
  getAllowedSaleGiftCategories,
  getSaleGiftCategoryKey,
  saleGiftCategories,
  type SaleGiftCategory,
} from '@/lib/admin/sale-gift-rules';
import type { Customer, InventoryMovement, Product, Purchase } from '@/lib/admin/types';
import { createDefaultInstallationServiceItem, supportsInstallationService } from '@/lib/admin/sale-service-helpers';
import { getProductVariantStock, getVariantSalePrice } from '@/lib/admin/variant-helpers';
import { cn } from '@/lib/utils';
import { SITE_LOGO } from '@/lib/branding';
import { ResponsiveRowActions } from '@/components/admin/shared/responsive-row-actions';

const saleGiftItemSchema = z.object({
  productId: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(0),
});

const saleServiceMaterialSchema = z.object({
  productId: z.string().default(''),
  variantId: z.string().default(''),
  variantName: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(1),
});

const saleServiceTypeOptions = [
  'tip-installation',
  'ferrule-installation',
  'tip-ferrule-installation',
  'extension-installation',
  'shaft-reduction',
  'shaft-straightening',
  'custom-turning',
] as const;

const saleServiceItemSchema = z.object({
  serviceType: z.enum(saleServiceTypeOptions).default('tip-installation'),
  serviceCategory: z.string().default('torno'),
  price: z.coerce.number().min(0, 'Ingresa un precio valido').default(0),
  cost: z.coerce.number().min(0, 'Ingresa un costo valido').default(0),
  cueReference: z.string().default(''),
  notes: z.string().default(''),
  materials: z.array(saleServiceMaterialSchema).default([]),
});

const saleLineItemSchema = z.object({
  productId: z.string().default(''),
  variantId: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(0),
  unitPrice: z.coerce.number().min(0, 'Ingresa un precio valido').default(0),
  serviceItems: z.array(saleServiceItemSchema).default([]),
  giftItems: z.array(saleGiftItemSchema).default([]),
});

const saleSchema = z
  .object({
    soldAt: z.string().min(1, 'Selecciona la fecha'),
    items: z.array(saleLineItemSchema).min(1, 'Agrega al menos un producto'),
    customerPhone: z.string().default(''),
    customerDocument: z.string().default(''),
    customerName: z.string().default(''),
    notes: z.string().default(''),
  })
  .superRefine((values, context) => {
    const normalizedCustomerPhone = values.customerPhone.trim();
    if (normalizedCustomerPhone && normalizedCustomerPhone.length < 7) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerPhone'],
        message: 'Ingresa un telefono valido o dejalo vacio.',
      });
    }

    values.items.forEach((item, index) => {
      const selectedGiftCategories = new Set<string>();

      if (!item.productId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'productId'],
          message: 'Selecciona el producto',
        });
      }

      // Si el producto maneja variantes, se validan en tiempo de ejecucion segun el producto elegido.

      if (item.quantity <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'quantity'],
          message: 'La cantidad debe ser mayor a cero',
        });
      }

      const giftItems = item.giftItems ?? [];
      const serviceItems = item.serviceItems ?? [];

      giftItems.forEach((giftItem, giftIndex) => {
        if (!giftItem.productId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'productId'],
            message: 'Selecciona el obsequio',
          });
        }

        if (giftItem.quantity <= 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'quantity'],
            message: 'La cantidad del obsequio debe ser mayor a cero',
          });
        }

        if (giftItem.quantity > item.quantity) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'quantity'],
            message: 'La cantidad del obsequio no puede superar la cantidad vendida en la linea',
          });
        }

        const giftCategory = giftItem.productId ? giftItem.productId : '';
        if (selectedGiftCategories.has(giftCategory)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'productId'],
            message: 'No repitas el mismo obsequio en esta linea',
          });
        }
        selectedGiftCategories.add(giftCategory);
      });

      serviceItems.forEach((serviceItem, serviceIndex) => {
        if ((Number(serviceItem.price) || 0) < 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'serviceItems', serviceIndex, 'price'],
            message: 'Ingresa un cobro adicional valido para el servicio',
          });
        }
        if ((Number(serviceItem.cost) || 0) < 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'serviceItems', serviceIndex, 'cost'],
            message: 'Ingresa un costo valido para el servicio',
          });
        }
        if (!String(serviceItem.cueReference ?? '').trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'serviceItems', serviceIndex, 'cueReference'],
            message: 'Describe el taco o la referencia del servicio',
          });
        }

        const seenMaterials = new Set<string>();
        (serviceItem.materials ?? []).forEach((material, materialIndex) => {
          if (!material.productId) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['items', index, 'serviceItems', serviceIndex, 'materials', materialIndex, 'productId'],
              message: 'Selecciona el material del servicio',
            });
          }
          if ((Number(material.quantity) || 0) <= 0) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['items', index, 'serviceItems', serviceIndex, 'materials', materialIndex, 'quantity'],
              message: 'La cantidad del material debe ser mayor a cero',
            });
          }

          const materialKey = `${material.productId}::${material.variantId || ''}`;
          if (seenMaterials.has(materialKey)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['items', index, 'serviceItems', serviceIndex, 'materials', materialIndex, 'productId'],
              message: 'No repitas el mismo material en el servicio',
            });
          }
          seenMaterials.add(materialKey);
        });
      });
    });

    const seenSaleVariants = new Map<string, number>();
    values.items.forEach((item, index) => {
      const variantKey = buildSaleVariantKey(item.productId, item.variantId);
      if (!variantKey) return;

      const firstIndex = seenSaleVariants.get(variantKey);
      if (firstIndex !== undefined && firstIndex !== index) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'variantId'],
          message: 'Esta variante ya fue agregada en otra linea de la venta.',
        });
        return;
      }

      seenSaleVariants.set(variantKey, index);
    });
  });

export type SaleFormValues = z.infer<typeof saleSchema>;
type SaleLineFormValue = SaleFormValues['items'][number];
type DraftSaleLine = {
  productId: string;
  variantId: string;
  quantity: string;
  unitPrice: string;
  serviceItems: SaleLineFormValue['serviceItems'];
  giftItems: SaleLineFormValue['giftItems'];
};

function buildSaleVariantKey(productId?: string, variantId?: string) {
  const normalizedProductId = productId?.trim() ?? '';
  const normalizedVariantId = variantId?.trim() ?? '';
  return normalizedProductId && normalizedVariantId ? `${normalizedProductId}::${normalizedVariantId}` : '';
}

function getUsedVariantIdsForProduct(
  items: SaleLineFormValue[],
  productId: string,
  excludedIndex?: number | null
) {
  const normalizedProductId = productId.trim();
  const usedVariantIds = new Set<string>();

  if (!normalizedProductId) return usedVariantIds;

  items.forEach((item, index) => {
    if (excludedIndex !== null && excludedIndex !== undefined && index === excludedIndex) return;
    if (item.productId !== normalizedProductId || !item.variantId) return;
    usedVariantIds.add(item.variantId);
  });

  return usedVariantIds;
}

const giftCategoryCopy: Record<SaleGiftCategory, { toggle: string; placeholder: string }> = {
  guantes: { toggle: 'Incluir guante', placeholder: 'Selecciona el guante' },
  estuches: { toggle: 'Incluir estuche', placeholder: 'Selecciona el estuche' },
  extensiones: { toggle: 'Incluir extension', placeholder: 'Selecciona la extension' },
  parachoques: { toggle: 'Incluir parachoque', placeholder: 'Selecciona el parachoque' },
};

function createDefaultLineItem(): SaleLineFormValue {
  return {
    productId: '',
    variantId: '',
    quantity: 1,
    unitPrice: 0,
    serviceItems: [],
    giftItems: [],
  };
}

function createDefaultDraftLine(): DraftSaleLine {
  return {
    productId: '',
    variantId: '',
    quantity: '',
    unitPrice: '',
    serviceItems: [],
    giftItems: [],
  };
}

function createDefaultSaleServiceItem(
  cueReference = '',
  product?: Pick<Product, 'category'> | null
): SaleLineFormValue['serviceItems'][number] {
  const defaultServiceItem = createDefaultInstallationServiceItem(product);
  return {
    serviceType: defaultServiceItem.serviceType,
    serviceCategory: defaultServiceItem.serviceCategory,
    price: 0,
    cost: 0,
    notes: '',
    cueReference,
    materials: [],
  };
}

function normalizeSaleServiceItemForForm(
  item?: Partial<SaleLineFormValue['serviceItems'][number]>,
  product?: Pick<Product, 'category'> | null
): SaleLineFormValue['serviceItems'][number] {
  const fallback = createDefaultSaleServiceItem('', product);
  const serviceType = saleServiceTypeOptions.includes(item?.serviceType as (typeof saleServiceTypeOptions)[number])
    ? (item?.serviceType as (typeof saleServiceTypeOptions)[number])
    : fallback.serviceType;

  return {
    ...fallback,
    ...item,
    serviceType,
    serviceCategory: String(item?.serviceCategory ?? fallback.serviceCategory).trim() || fallback.serviceCategory,
    price: Number(item?.price ?? fallback.price) || 0,
    cost: Number(item?.cost ?? fallback.cost) || 0,
    cueReference: String(item?.cueReference ?? fallback.cueReference),
    notes: String(item?.notes ?? fallback.notes),
    materials: (item?.materials ?? []).map((material) => ({
      productId: String(material.productId ?? ''),
      variantId: String(material.variantId ?? ''),
      variantName: String(material.variantName ?? ''),
      quantity: Math.max(Number(material.quantity) || 1, 1),
    })),
  };
}

function normalizeSaleLineForForm(line?: Partial<SaleLineFormValue>): SaleLineFormValue {
  const fallback = createDefaultLineItem();

  return {
    ...fallback,
    ...line,
    productId: String(line?.productId ?? fallback.productId),
    variantId: String(line?.variantId ?? fallback.variantId),
    quantity: Number(line?.quantity ?? fallback.quantity) || 0,
    unitPrice: Number(line?.unitPrice ?? fallback.unitPrice) || 0,
    serviceItems: (line?.serviceItems ?? []).map((item) => normalizeSaleServiceItemForForm(item)),
    giftItems: (line?.giftItems ?? []).map((item) => ({
      productId: String(item.productId ?? ''),
      quantity: Number(item.quantity) || 0,
    })),
  };
}

function getSaleLineCueReferenceSuggestion(
  items: SaleLineFormValue[],
  products: Product[],
  excludedProductId?: string,
  excludedIndex?: number | null
) {
  const cueLine = items.find((item, index) => {
    if (excludedIndex !== null && excludedIndex !== undefined && index === excludedIndex) return false;
    if (excludedProductId && item.productId === excludedProductId) return false;

    const product = products.find((candidate) => candidate.id === item.productId);
    return matchesProductCategoryFamily(product, 'tacos');
  });

  if (!cueLine) {
    const currentProduct = products.find((product) => product.id === excludedProductId);
    if (matchesProductCategoryFamily(currentProduct, 'tacos')) {
      const currentLine =
        excludedIndex !== null && excludedIndex !== undefined ? items[excludedIndex] : undefined;
      const currentVariant = currentProduct?.variants?.find((variant) => variant.id === currentLine?.variantId);
      return [currentProduct?.name, currentVariant?.name].filter(Boolean).join(' - ') || 'Taco del cliente';
    }

    return 'Taco del cliente';
  }

  const cueProduct = products.find((product) => product.id === cueLine.productId);
  const cueVariant = cueProduct?.variants?.find((variant) => variant.id === cueLine.variantId);

  return [cueProduct?.name, cueVariant?.name].filter(Boolean).join(' - ') || 'Taco del cliente';
}

type ServiceMaterialFamily = 'casquillos' | 'virolas' | 'extensiones';

const serviceMaterialSlots: Record<
  SaleLineFormValue['serviceItems'][number]['serviceType'],
  Array<{ family: ServiceMaterialFamily; label: string; placeholder: string }>
> = {
  'tip-installation': [
    { family: 'casquillos', label: 'Casquillo', placeholder: 'Selecciona el casquillo' },
  ],
  'ferrule-installation': [
    { family: 'virolas', label: 'Virola', placeholder: 'Selecciona la virola' },
  ],
  'tip-ferrule-installation': [
    { family: 'casquillos', label: 'Casquillo', placeholder: 'Selecciona el casquillo' },
    { family: 'virolas', label: 'Virola', placeholder: 'Selecciona la virola' },
  ],
  'extension-installation': [
    { family: 'extensiones', label: 'Extension', placeholder: 'Selecciona la extension' },
  ],
  'shaft-reduction': [],
  'shaft-straightening': [],
  'custom-turning': [],
};

function getDefaultMaterialVariantId(product?: Product) {
  return (product?.variants ?? []).find((variant) => variant.status !== 'inactive')?.id ?? '';
}

function getSaleServiceMaterialPrice(product?: Product, variantId?: string) {
  if (!product) return 0;
  return getVariantSalePrice(product, variantId || undefined);
}

function getSaleServiceMaterialLabel(product?: Product, variantId?: string) {
  if (!product) return 'Material';
  const variant = (product.variants ?? []).find((item) => item.id === variantId);
  return [product.name, variant?.name].filter(Boolean).join(' - ');
}

function getServiceMaterialForFamily(
  materials: NonNullable<SaleLineFormValue['serviceItems'][number]['materials']>,
  products: Product[],
  family: ServiceMaterialFamily
) {
  return materials.find((material) => {
    const product = products.find((item) => item.id === material.productId);
    return matchesProductCategoryFamily(product, family);
  });
}

function setServiceMaterialForFamily(
  serviceItem: SaleLineFormValue['serviceItems'][number],
  products: Product[],
  family: ServiceMaterialFamily,
  productId: string
) {
  const currentMaterials = serviceItem.materials ?? [];
  const nextProduct = products.find((product) => product.id === productId);
  const nextVariantId = getDefaultMaterialVariantId(nextProduct);
  const nextMaterial = {
    productId,
    variantId: nextVariantId,
    variantName: nextProduct?.variants?.find((variant) => variant.id === nextVariantId)?.name ?? '',
    quantity: 1,
  };
  const otherMaterials = currentMaterials.filter((material) => {
    const product = products.find((item) => item.id === material.productId);
    return !matchesProductCategoryFamily(product, family);
  });

  return {
    ...serviceItem,
    materials: productId ? [...otherMaterials, nextMaterial] : otherMaterials,
  };
}

function updateServiceMaterialForFamily(
  serviceItem: SaleLineFormValue['serviceItems'][number],
  products: Product[],
  family: ServiceMaterialFamily,
  updater: (material: NonNullable<SaleLineFormValue['serviceItems'][number]['materials']>[number]) => NonNullable<SaleLineFormValue['serviceItems'][number]['materials']>[number]
) {
  return {
    ...serviceItem,
    materials: (serviceItem.materials ?? []).map((material) => {
      const product = products.find((item) => item.id === material.productId);
      return matchesProductCategoryFamily(product, family) ? updater(material) : material;
    }),
  };
}

function createDraftLineFromValue(line?: SaleLineFormValue): DraftSaleLine {
  if (!line) return createDefaultDraftLine();

  return {
    productId: line.productId ?? '',
    variantId: line.variantId ?? '',
    quantity: line.quantity ? String(line.quantity) : '',
    unitPrice: line.unitPrice ? String(line.unitPrice) : '',
    serviceItems: line.serviceItems ?? [],
    giftItems: line.giftItems ?? [],
  };
}

function getSelectableSaleVariants(
  product: Product | null | undefined,
  movements: InventoryMovement[],
  options?: {
    usedVariantIds?: Set<string>;
    currentVariantId?: string;
  }
) {
  if (!product) return [];

  const usedVariantIds = options?.usedVariantIds ?? new Set<string>();
  const currentVariantId = options?.currentVariantId?.trim() ?? '';

  return (product.variants ?? []).filter((variant) => {
    const isCurrentVariant = variant.id === currentVariantId;
    const hasStock = getProductVariantStock(product, variant.id, movements) > 0;
    const isAvailableVariant = !usedVariantIds.has(variant.id) || isCurrentVariant;

    return variant.status !== 'inactive' && (hasStock || isCurrentVariant) && isAvailableVariant;
  });
}

function getSuggestedSaleVariant(
  product: Product | null | undefined,
  movements: InventoryMovement[],
  options?: {
    usedVariantIds?: Set<string>;
    currentVariantId?: string;
  }
) {
  const variants = getSelectableSaleVariants(product, movements, options);
  return variants.length === 1 ? variants[0] : null;
}

function getDefaultSaleVariant(
  product: Product | null | undefined,
  movements: InventoryMovement[],
  options?: {
    usedVariantIds?: Set<string>;
    currentVariantId?: string;
  }
) {
  return (
    getSuggestedSaleVariant(product, movements, options) ??
    getSelectableSaleVariants(product, movements, options)[0] ??
    null
  );
}

function getInitialSaleUnitPrice(
  product: Product | null | undefined,
  movements: InventoryMovement[],
  variantId?: string
) {
  if (!product) return 0;

  const explicitVariantPrice =
    variantId && product.variants?.find((variant) => variant.id === variantId)?.salePrice;
  if (explicitVariantPrice !== undefined && explicitVariantPrice !== null) {
    return Number(explicitVariantPrice);
  }

  const defaultVariant = getDefaultSaleVariant(product, movements);
  if (defaultVariant?.salePrice !== undefined && defaultVariant?.salePrice !== null) {
    return Number(defaultVariant.salePrice);
  }

  return getVariantSalePrice(product);
}

function getSaleUnitPriceForVariantSelection(
  product: Product | null | undefined,
  variantId?: string
) {
  if (!product) return 0;
  return Number(getVariantSalePrice(product, variantId));
}

function getNormalizedGiftQuantity(value: number | string | undefined, maxQuantity: number, fallback = 1) {
  const safeMax = Math.max(Math.trunc(Number(maxQuantity) || 0), 1);
  const normalized = Math.trunc(Number(value) || 0);
  if (normalized <= 0) return Math.min(fallback, safeMax);
  return Math.min(normalized, safeMax);
}

function normalizeGiftItems(
  items: SaleLineFormValue['giftItems'],
  products: Product[],
  _movements: InventoryMovement[],
  options?: {
    defaultQuantity?: number;
    maxQuantity?: number;
  }
) {
  const seenCategories = new Set<string>();
  const maxQuantity = Math.max(Math.trunc(Number(options?.maxQuantity ?? options?.defaultQuantity ?? 1) || 0), 1);
  const defaultQuantity = getNormalizedGiftQuantity(options?.defaultQuantity ?? 1, maxQuantity, 1);

  const normalizedItems = items.reduce<SaleLineFormValue['giftItems']>((accumulator, item) => {
    const productId = item.productId?.trim();
    if (!productId) return accumulator;

    const product = products.find((current) => current.id === productId);
    if (!product) return accumulator;
    const categoryKey = getSaleGiftCategoryKey(product);
    if (!categoryKey) return accumulator;
    if (seenCategories.has(categoryKey)) return accumulator;

    seenCategories.add(categoryKey);
    accumulator.push({
      productId,
      quantity: getNormalizedGiftQuantity(item.quantity, maxQuantity, defaultQuantity),
    });
    return accumulator;
  }, []);

  return normalizedItems;
}

function getGiftProductIdByCategory(
  items: SaleLineFormValue['giftItems'],
  products: Product[],
  category: SaleGiftCategory
) {
  return (
    items.find((item) => {
      const product = products.find((current) => current.id === item.productId);
      return product ? getSaleGiftCategoryKey(product) === category : false;
    })?.productId ?? ''
  );
}

function hasSelectedGiftItems(items: SaleLineFormValue['giftItems'], products: Product[]) {
  return items.some((item) => {
    const product = products.find((current) => current.id === item.productId);
    return Boolean(product && getSaleGiftCategoryKey(product));
  });
}

function getGiftQuantityByCategory(
  items: SaleLineFormValue['giftItems'],
  products: Product[],
  category: SaleGiftCategory
) {
  return (
    items.find((item) => {
      const product = products.find((current) => current.id === item.productId);
      return product ? getSaleGiftCategoryKey(product) === category : false;
    })?.quantity ?? 0
  );
}

function setGiftSelectionByCategory<T extends { giftItems: SaleLineFormValue['giftItems']; quantity?: number | string }>(
  line: T,
  products: Product[],
  movements: InventoryMovement[],
  category: SaleGiftCategory,
  productId: string,
  enabled: boolean
): T {
  const maxQuantity = Math.max(Math.trunc(Number(line.quantity ?? 0) || 0), 1);
  const preservedQuantity = getGiftQuantityByCategory(line.giftItems, products, category);
  const nextItems = normalizeGiftItems(
    line.giftItems.filter((item) => {
      const product = products.find((current) => current.id === item.productId);
      return product ? getSaleGiftCategoryKey(product) !== category : true;
    }),
    products,
    movements,
    { defaultQuantity: maxQuantity, maxQuantity }
  );

  if (enabled && productId) {
    nextItems.push({
      productId,
      quantity: getNormalizedGiftQuantity(preservedQuantity, maxQuantity, maxQuantity),
    });
  }

  return {
    ...line,
    giftItems: normalizeGiftItems(nextItems, products, movements, {
      defaultQuantity: maxQuantity,
      maxQuantity,
    }),
  };
}

function setGiftQuantityByCategory<T extends { giftItems: SaleLineFormValue['giftItems']; quantity?: number | string }>(
  line: T,
  products: Product[],
  movements: InventoryMovement[],
  category: SaleGiftCategory,
  quantity: number | string
): T {
  const selectedProductId = getGiftProductIdByCategory(line.giftItems, products, category);
  if (!selectedProductId) return line;

  const maxQuantity = Math.max(Math.trunc(Number(line.quantity ?? 0) || 0), 1);
  const nextItems = line.giftItems.map((item) => {
    const product = products.find((current) => current.id === item.productId);
    if (!product || getSaleGiftCategoryKey(product) !== category) return item;
    return {
      ...item,
      quantity: getNormalizedGiftQuantity(quantity, maxQuantity, item.quantity || maxQuantity),
    };
  });

  return {
    ...line,
    giftItems: normalizeGiftItems(nextItems, products, movements, {
      defaultQuantity: maxQuantity,
      maxQuantity,
    }),
  };
}

function getGiftSelectionHelpText(categories: SaleGiftCategory[]) {
  if (categories.length === 0) return 'Este producto no maneja obsequios.';
  return `Puedes incluir ${formatSaleGiftCategoryList(categories)}. Ajusta la cantidad del obsequio segun las unidades vendidas en esa linea.`;
}

function SaleGiftSection({
  enabled,
  onEnabledChange,
  line,
  onLineChange,
  products,
  movements,
  allowedCategories,
  availableGiftOptionsByCategory,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  line: { giftItems: SaleLineFormValue['giftItems']; quantity?: number | string };
  onLineChange: (nextLine: { giftItems: SaleLineFormValue['giftItems'] }) => void;
  products: Product[];
  movements: InventoryMovement[];
  allowedCategories: SaleGiftCategory[];
  availableGiftOptionsByCategory: Record<SaleGiftCategory, Product[]>;
}) {
  if (allowedCategories.length === 0) return null;
  const soldQuantity = Math.max(Math.trunc(Number(line.quantity ?? 0) || 0), 0);
  const selectedGiftQuantity = line.giftItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <Gift className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Obsequio</p>
            <p className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">{getGiftSelectionHelpText(allowedCategories)}</p>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-border bg-card/88 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
          <Checkbox
            checked={enabled}
            onCheckedChange={(checked) => {
              const nextEnabled = checked === true;
              onEnabledChange(nextEnabled);
              if (!nextEnabled) {
                onLineChange({ ...line, giftItems: [] });
              }
            }}
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Incluir obsequio</span>
        </label>
      </div>

      {enabled ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            {formatNumber(soldQuantity)} vendido(s) en esta linea / {formatNumber(selectedGiftQuantity)} obsequio(s) seleccionado(s)
          </div>

          <div className="grid gap-3 md:grid-cols-2">
          {allowedCategories.map((category) => {
            const selectedProductId = getGiftProductIdByCategory(line.giftItems, products, category);
            const selectedQuantity = getGiftQuantityByCategory(line.giftItems, products, category);
            const options = availableGiftOptionsByCategory[category];
            const maxQuantity = Math.max(Math.trunc(Number(line.quantity ?? 0) || 0), 1);

            return (
              <div key={category} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={Boolean(selectedProductId)}
                    onCheckedChange={(checked) => {
                      const nextEnabled = checked === true;
                      const fallbackProductId = options[0]?.id ?? '';
                      const nextValue = nextEnabled ? selectedProductId || fallbackProductId : '';
                      onLineChange(
                        setGiftSelectionByCategory(line, products, movements, category, nextValue, nextEnabled)
                      );
                    }}
                  />
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{giftCategoryCopy[category].toggle}</span>
                </div>

                <div className="mt-3">
                  <Select
                    value={selectedProductId}
                    onValueChange={(value) =>
                      onLineChange(setGiftSelectionByCategory(line, products, movements, category, value, true))
                    }
                    disabled={!selectedProductId || options.length === 0}
                  >
                    <SelectTrigger className="h-10 w-full max-w-full bg-card/88 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100">
                      <SelectValue placeholder={giftCategoryCopy[category].placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedProductId ? (
                  <div className="mt-3 space-y-2">
                    <Label>Cantidad obsequio</Label>
                    <Input
                      type="number"
                      min="1"
                      max={maxQuantity}
                      value={selectedQuantity || maxQuantity}
                      onChange={(event) =>
                        onLineChange(
                          setGiftQuantityByCategory(line, products, movements, category, event.target.value)
                        )
                      }
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Maximo {formatNumber(maxQuantity)} por esta linea.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Al activarlo se sugiere {formatNumber(maxQuantity)} por defecto, pero puedes bajarlo si no todos llevan obsequio.
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SaleServiceSection({
  line,
  onLineChange,
  cueReferenceSuggestion,
  serviceProduct,
  products,
  purchases,
  movements,
  hideFinancialSummary,
}: {
  line: { serviceItems: SaleLineFormValue['serviceItems'] };
  onLineChange: (nextLine: { serviceItems: SaleLineFormValue['serviceItems'] }) => void;
  cueReferenceSuggestion: string;
  serviceProduct?: Pick<Product, 'category'> | null;
  products: Product[];
  purchases: Purchase[];
  movements: InventoryMovement[];
  hideFinancialSummary: boolean;
}) {
  const serviceItems = line.serviceItems ?? [];
  const serviceItem = serviceItems[0] ? normalizeSaleServiceItemForForm(serviceItems[0], serviceProduct) : undefined;
  const enabled = Boolean(serviceItem);
  const selectedServiceType =
    serviceItem && saleServiceTypeOptions.includes(serviceItem.serviceType)
      ? serviceItem.serviceType
      : 'tip-installation';
  const materialSlots = serviceItem
    ? (serviceMaterialSlots[selectedServiceType] ?? []).filter(
        (slot) => !matchesProductCategoryFamily(serviceProduct, slot.family)
      )
    : [];
  const skippedMaterialSlots = serviceItem
    ? (serviceMaterialSlots[selectedServiceType] ?? []).filter((slot) =>
        matchesProductCategoryFamily(serviceProduct, slot.family)
      )
    : [];

  return (
    <div className="space-y-3 rounded-2xl border border-cyan-200/80 bg-cyan-50/75 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-cyan-100 p-2 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-100">
            <Gift className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950 dark:text-cyan-50">Instalacion</p>
          </div>
        </div>

        <label className="flex w-fit shrink-0 cursor-pointer items-center gap-3 rounded-xl border border-cyan-200 bg-card/90 px-3 py-2 dark:border-cyan-900/70 dark:bg-slate-950/60">
          <input
            type="checkbox"
            className="sr-only"
            checked={enabled}
            onChange={(event) => {
              const nextEnabled = event.target.checked;
              onLineChange({
                ...line,
                serviceItems: nextEnabled ? [serviceItem ?? createDefaultSaleServiceItem(cueReferenceSuggestion, serviceProduct)] : [],
              });
            }}
          />
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
              enabled
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-cyan-300 bg-background text-transparent dark:border-cyan-800 dark:bg-slate-950'
            )}
            aria-hidden="true"
          >
            <Check className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium text-slate-800 dark:text-cyan-50">Incluir servicio</span>
        </label>
      </div>

      {enabled && serviceItem ? (
        <div className="grid gap-4">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
            <div className="space-y-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <Label>Referencia del taco</Label>
                <button
                  type="button"
                  className="w-fit text-xs font-medium text-cyan-800 underline-offset-4 hover:underline dark:text-cyan-200"
                  onClick={() =>
                    onLineChange({
                      ...line,
                      serviceItems: [{ ...serviceItem, cueReference: cueReferenceSuggestion }],
                    })
                  }
                >
                  Usar sugerencia
                </button>
              </div>
              <Input
                value={serviceItem.cueReference}
                placeholder={cueReferenceSuggestion}
                onChange={(event) =>
                  onLineChange({
                    ...line,
                    serviceItems: [{ ...serviceItem, cueReference: event.target.value }],
                  })
                }
              />
            </div>

            <div className="min-w-0 space-y-2">
              <Label>Tipo de servicio</Label>
              <Select
                value={selectedServiceType}
                onValueChange={(value) => {
                  const nextServiceType = value as typeof selectedServiceType;
                  const nextSlots = serviceMaterialSlots[nextServiceType] ?? [];
                  onLineChange({
                    ...line,
                    serviceItems: [
                      {
                        ...serviceItem,
                        serviceType: nextServiceType,
                        materials: (serviceItem.materials ?? []).filter((material) => {
                          const product = products.find((item) => item.id === material.productId);
                          return nextSlots.some((slot) => matchesProductCategoryFamily(product, slot.family));
                        }),
                      },
                    ],
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {saleServiceTypeOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {serviceTypeLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {materialSlots.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-cyan-200/70 bg-card/80 p-3 dark:border-cyan-900/60 dark:bg-slate-950/45">
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-cyan-50">Materiales que descuenta inventario</p>
                <p className="text-xs text-cyan-800/75 dark:text-cyan-100/70">
                  {hideFinancialSummary
                    ? 'Opcional: usalo solo si el material no esta agregado como producto de la venta.'
                    : 'Opcional: si agregas material aqui, se descuenta inventario, entra a factura y su costo real baja la utilidad.'}
                </p>
                {skippedMaterialSlots.length > 0 ? (
                  <p className="mt-1 text-xs font-medium text-cyan-900 dark:text-cyan-100">
                    {skippedMaterialSlots.map((slot) => slot.label).join(' y ')} ya se descuenta como producto vendido en esta linea.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {materialSlots.map((slot) => {
                  const material = getServiceMaterialForFamily(serviceItem.materials ?? [], products, slot.family);
                  const materialProduct = products.find((product) => product.id === material?.productId);
                  const materialVariant = materialProduct?.variants?.find((variant) => variant.id === material?.variantId);
                  const materialQuantity = Number(material?.quantity ?? 1) || 1;
                  const materialStock = materialProduct
                    ? materialVariant
                      ? getProductVariantStock(materialProduct, materialVariant.id, movements)
                      : getStoredProductStock(materialProduct)
                    : 0;
                  const materialPrice = getSaleServiceMaterialPrice(materialProduct, materialVariant?.id) * materialQuantity;
                  const materialCost =
                    (materialProduct
                      ? getVariantOrProductRealUnitCost(purchases, materialProduct.id, materialVariant?.id)
                      : 0) * materialQuantity;
                  const options = products
                    .filter((product) => product.status === 'active' && matchesProductCategoryFamily(product, slot.family))
                    .map((product) => ({ value: product.id, label: `${product.name} - ${product.brand || 'Sin marca'}` }));

                  return (
                    <div key={slot.family} className="min-w-0 space-y-3 rounded-xl border border-border/70 bg-background/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                      <div className="space-y-2">
                        <Label>{slot.label}</Label>
                        <SearchableSelect
                          value={material?.productId ?? ''}
                          onChange={(value) =>
                            onLineChange({
                              ...line,
                              serviceItems: [{ ...setServiceMaterialForFamily(serviceItem, products, slot.family, value) }],
                            })
                          }
                          placeholder={slot.placeholder}
                          searchPlaceholder={`Buscar ${slot.label.toLowerCase()}...`}
                          emptyLabel={`No hay ${slot.label.toLowerCase()} activos.`}
                          recentStorageKey={`sales-service-${slot.family}`}
                          options={options}
                        />
                      </div>

                      {materialProduct && (materialProduct.variants?.length ?? 0) > 0 ? (
                        <div className="space-y-2">
                          <Label>{materialProduct.variantLabel || 'Variante'}</Label>
                          <Select
                            value={material?.variantId ?? ''}
                            onValueChange={(value) =>
                              onLineChange({
                                ...line,
                                serviceItems: [
                                  {
                                    ...updateServiceMaterialForFamily(serviceItem, products, slot.family, (current) => ({
                                      ...current,
                                      variantId: value,
                                      variantName:
                                        materialProduct.variants?.find((variant) => variant.id === value)?.name ?? '',
                                    })),
                                  },
                                ],
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona variante" />
                            </SelectTrigger>
                            <SelectContent>
                              {(materialProduct.variants ?? [])
                                .filter((variant) => variant.status !== 'inactive')
                                .map((variant) => (
                                  <SelectItem key={variant.id} value={variant.id}>
                                    {variant.name} ({formatNumber(getProductVariantStock(materialProduct, variant.id, movements))})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      {materialProduct ? (
                        <div className="grid gap-3">
                          <div className="space-y-2">
                            <Label>Cantidad</Label>
                            <Input
                              type="number"
                              min="1"
                              max={Math.max(materialStock, 1)}
                              value={materialQuantity}
                              onChange={(event) =>
                                onLineChange({
                                  ...line,
                                  serviceItems: [
                                    {
                                      ...updateServiceMaterialForFamily(serviceItem, products, slot.family, (current) => ({
                                        ...current,
                                        quantity: Math.max(Math.trunc(Number(event.target.value || 1)), 1),
                                      })),
                                    },
                                  ],
                                })
                              }
                            />
                          </div>
                          <div className="rounded-xl bg-cyan-50/75 px-3 py-2 text-xs leading-5 text-cyan-950 dark:bg-cyan-950/25 dark:text-cyan-50">
                            <p className="font-medium">{getSaleServiceMaterialLabel(materialProduct, materialVariant?.id)}</p>
                            <div className={cn('mt-1 grid gap-1', hideFinancialSummary ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
                              <span>Stock: {formatNumber(materialStock)}</span>
                              <span>Factura: {formatCurrency(materialPrice)}</span>
                              {!hideFinancialSummary ? <span>Costo real: {formatCurrency(materialCost)}</span> : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <Label>Cobro adicional</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={serviceItem.price}
                onChange={(event) =>
                  onLineChange({
                    ...line,
                    serviceItems: [{ ...serviceItem, price: Number(event.target.value || 0) }],
                  })
                }
              />
              <p className="text-xs text-cyan-800/75 dark:text-cyan-100/70">
                Dejalo en 0 cuando la instalacion vaya incluida con el producto.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Costo interno</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={serviceItem.cost}
                onChange={(event) =>
                  onLineChange({
                    ...line,
                    serviceItems: [{ ...serviceItem, cost: Number(event.target.value || 0) }],
                  })
                }
              />
              <p className="text-xs text-cyan-800/75 dark:text-cyan-100/70">
                Costo operativo del servicio: mano de obra, luz, lija, pegante o comision.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas del servicio</Label>
            <Textarea
              value={serviceItem.notes}
              rows={2}
              placeholder="Ej: instalar y ajustar punta antes de entregar."
              onChange={(event) =>
                onLineChange({
                  ...line,
                  serviceItems: [{ ...serviceItem, notes: event.target.value }],
                })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const defaultValues: SaleFormValues = {
  soldAt: getTodayDateInputValue(),
  items: [createDefaultLineItem()],
  customerPhone: '',
  customerDocument: '',
  customerName: '',
  notes: '',
};

export function SaleFormDialog({
  open,
  onOpenChange,
  products,
  purchases,
  movements,
  customers,
  initialValues,
  mode = initialValues ? 'edit' : 'create',
  hideFinancialSummary = false,
  canEditUnitPrice = true,
  unitPriceHelpText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  purchases: Purchase[];
  movements: InventoryMovement[];
  customers?: Customer[];
  initialValues?: SaleFormValues | null;
  mode?: 'create' | 'edit';
  hideFinancialSummary?: boolean;
  canEditUnitPrice?: boolean;
  unitPriceHelpText?: string;
  onSubmit: (values: SaleFormValues) => Promise<void> | void;
}) {
  const saleFormId = useId();
  const lineFormId = useId();
  const isEditingSale = mode === 'edit';
  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues,
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [draftLine, setDraftLine] = useState<DraftSaleLine>(createDefaultDraftLine());
  const [lineError, setLineError] = useState<string>('');
  const [firstItemGiftSectionEnabled, setFirstItemGiftSectionEnabled] = useState(false);
  const [draftGiftSectionEnabled, setDraftGiftSectionEnabled] = useState(false);
  const isSubmitting = form.formState.isSubmitting;

  const watchedValues = form.watch();
  const values: SaleFormValues = {
    ...defaultValues,
    ...watchedValues,
    items: (watchedValues.items ?? []).map((item) => normalizeSaleLineForForm(item)),
  };
  const hasSaleProduct = values.items.some((item) => Boolean(item.productId));
  const discountSummary = useMemo(() => {
    const lines = values.items
      .map((item, index) => {
        const product = products.find((productItem) => productItem.id === item.productId);
        if (!product) return null;
        const suggestedUnitPrice = item.variantId
          ? Number(
              product.variants?.find((variant) => variant.id === item.variantId)?.salePrice ??
                product.salePrice ??
                0
            )
          : Number(product.salePrice ?? 0);
        const requestedUnitPrice = Number(item.unitPrice ?? 0);
        const unitDiscount = suggestedUnitPrice - requestedUnitPrice;
        if (unitDiscount <= 0) return null;

        return {
          key: `${item.productId}-${item.variantId ?? index}`,
          lineNumber: index + 1,
          productName: product.name,
          quantity: Number(item.quantity ?? 0),
          suggestedUnitPrice,
          requestedUnitPrice,
          lineDiscount: unitDiscount * Number(item.quantity ?? 0),
        };
      })
      .filter(
        (
          item
        ): item is {
          key: string;
          lineNumber: number;
          productName: string;
          quantity: number;
          suggestedUnitPrice: number;
          requestedUnitPrice: number;
          lineDiscount: number;
        } => Boolean(item)
      );

    return {
      lines,
      totalDiscount: lines.reduce((sum, line) => sum + line.lineDiscount, 0),
    };
  }, [products, values.items]);

  const draftDiscountPreview = useMemo(() => {
    if (!draftLine.productId) return null;
    const product = products.find((productItem) => productItem.id === draftLine.productId);
    if (!product) return null;
    const suggestedUnitPrice = draftLine.variantId
      ? Number(
          product.variants?.find((variant) => variant.id === draftLine.variantId)?.salePrice ??
            product.salePrice ??
            0
        )
      : Number(product.salePrice ?? 0);
    const requestedUnitPrice = Number(draftLine.unitPrice ?? 0);
    const quantity = Number(draftLine.quantity ?? 0);
    const unitDiscount = suggestedUnitPrice - requestedUnitPrice;
    if (unitDiscount <= 0 || quantity <= 0) return null;

    return {
      suggestedUnitPrice,
      requestedUnitPrice,
      totalDiscount: unitDiscount * quantity,
    };
  }, [draftLine.productId, draftLine.quantity, draftLine.unitPrice, draftLine.variantId, products]);

  const firstItem = values.items[0] ?? createDefaultLineItem();
  const updateCustomerFields = (nextCustomer: { name: string; phone: string; documentNumber: string }) => {
    form.setValue('customerName', nextCustomer.name, { shouldValidate: true, shouldDirty: true });
    form.setValue('customerPhone', nextCustomer.phone, { shouldValidate: true, shouldDirty: true });
    form.setValue('customerDocument', nextCustomer.documentNumber, { shouldValidate: true, shouldDirty: true });
  };

  const saleSummaries = values.items.map((saleItem) => {
    const product = products.find((item) => item.id === saleItem.productId);
    const selectedVariant = product?.variants?.find((variant) => variant.id === saleItem.variantId) ?? null;
    const stock = product
      ? selectedVariant
        ? getProductVariantStock(product, selectedVariant.id, movements)
        : getStoredProductStock(product)
      : 0;
    const realUnitCost = product
      ? getVariantOrProductRealUnitCost(purchases, product.id, selectedVariant?.id)
      : 0;
    const quantity = Number(saleItem.quantity) || 0;
    const unitPrice = Number(saleItem.unitPrice) || 0;
    const giftItems = saleItem.giftItems.map((giftItem) => {
      const giftProduct = products.find((item) => item.id === giftItem.productId);
      const giftStock = giftProduct ? getStoredProductStock(giftProduct) : 0;
      const giftQuantity = Number(giftItem.quantity) || 0;
      const giftUnitCost = giftProduct ? getVariantOrProductRealUnitCost(purchases, giftProduct.id) : 0;
      return {
        productId: giftItem.productId,
        product: giftProduct,
        stock: giftStock,
        quantity: giftQuantity,
        totalCost: giftQuantity * giftUnitCost,
      };
    });
    const serviceItems = saleItem.serviceItems.map((serviceItem) => {
      const price = Number(serviceItem.price) || 0;
      const cost = Number(serviceItem.cost) || 0;
      const materials = (serviceItem.materials ?? []).map((material) => {
        const materialProduct = products.find((product) => product.id === material.productId);
        const materialQuantity = Number(material.quantity) || 0;
        const materialRevenue = materialQuantity * getSaleServiceMaterialPrice(materialProduct, material.variantId || undefined);
        const materialCost = materialProduct
          ? materialQuantity * getVariantOrProductRealUnitCost(purchases, materialProduct.id, material.variantId || undefined)
          : 0;

        return {
          ...material,
          product: materialProduct,
          quantity: materialQuantity,
          totalRevenue: materialRevenue,
          totalCost: materialCost,
        };
      });
      const materialRevenue = materials.reduce((sum, item) => sum + item.totalRevenue, 0);
      const materialCost = materials.reduce((sum, item) => sum + item.totalCost, 0);
      return {
        ...serviceItem,
        price,
        cost,
        materials,
        materialRevenue,
        materialCost,
        totalRevenue: price + materialRevenue,
        totalCost: cost + materialCost,
        profit: price + materialRevenue - cost - materialCost,
      };
    });

    return {
      product,
      selectedVariant,
      stock,
      quantity,
      unitPrice,
      totalSale: quantity * unitPrice,
      totalCost: quantity * realUnitCost,
      giftItems,
      serviceItems,
      giftTotalCost: giftItems.reduce((sum, item) => sum + item.totalCost, 0),
      serviceTotalRevenue: serviceItems.reduce((sum, item) => sum + item.totalRevenue, 0),
      serviceTotalCost: serviceItems.reduce((sum, item) => sum + item.totalCost, 0),
    };
  });

  const totals = useMemo(() => {
    const totalSale = saleSummaries.reduce((sum, item) => sum + item.totalSale + item.serviceTotalRevenue, 0);
    const totalGiftCost = saleSummaries.reduce((sum, item) => sum + item.giftTotalCost, 0);
    const totalCost =
      saleSummaries.reduce((sum, item) => sum + item.totalCost + item.serviceTotalCost, 0) + totalGiftCost;
    return {
      totalSale,
      totalCost,
      totalGiftCost,
      grossProfit: totalSale - totalCost,
    };
  }, [saleSummaries]);
  const saleUnits = saleSummaries.reduce((sum, item) => sum + item.quantity, 0);
  const selectedLineCount = values.items.filter((item) => Boolean(item.productId)).length;
  const saleProductCost = saleSummaries.reduce((sum, item) => sum + item.totalCost, 0);
  const saleReady = hasSaleProduct && saleUnits > 0;
  const customerLabel = values.customerName.trim() || 'Cliente NN';
  const firstLineSummary = saleSummaries[0] ?? null;
  const firstItemProduct = products.find((product) => product.id === firstItem.productId) ?? null;
  const firstItemHasService = (firstItem.serviceItems ?? []).length > 0;
  const firstItemUsedVariantIds = getUsedVariantIdsForProduct(values.items, firstItem.productId, 0);
  const firstItemVariantOptions = getSelectableSaleVariants(firstItemProduct, movements, {
    usedVariantIds: firstItemUsedVariantIds,
    currentVariantId: firstItem.variantId,
  });
  const firstItemSelectedVariant =
    (firstItemProduct?.variants ?? []).find((variant) => variant.id === firstItem.variantId) ?? null;
  const firstItemDisplayStock = firstItemSelectedVariant
    ? getProductVariantStock(firstItemProduct ?? undefined, firstItemSelectedVariant.id, movements)
    : firstLineSummary?.stock ?? 0;
  const firstItemAllowedGiftCategories = firstItemProduct ? getAllowedSaleGiftCategories(firstItemProduct) : [];
  const firstItemCanHaveGift = firstItemAllowedGiftCategories.length > 0;
  const firstItemHasGiftSelection = hasSelectedGiftItems(firstItem.giftItems, products);
  const draftProduct = products.find((product) => product.id === draftLine.productId) ?? null;
  const draftUsedVariantIds = getUsedVariantIdsForProduct(values.items, draftLine.productId, editingLineIndex);
  const draftVariantOptions = getSelectableSaleVariants(draftProduct, movements, {
    usedVariantIds: draftUsedVariantIds,
    currentVariantId: draftLine.variantId,
  });
  const draftSelectedVariant = (draftProduct?.variants ?? []).find((variant) => variant.id === draftLine.variantId) ?? null;
  const draftDisplayStock = draftSelectedVariant
    ? getProductVariantStock(draftProduct ?? undefined, draftSelectedVariant.id, movements)
    : draftProduct
      ? getStoredProductStock(draftProduct)
      : 0;
  const draftAllowedGiftCategories = draftProduct ? getAllowedSaleGiftCategories(draftProduct) : [];
  const draftCanHaveGift = draftAllowedGiftCategories.length > 0;
  const draftHasGiftSelection = hasSelectedGiftItems(draftLine.giftItems, products);
  const draftQuantity = Math.max(Number(draftLine.quantity) || 0, 0);
  const draftUnitPrice = Math.max(Number(draftLine.unitPrice) || 0, 0);
  const draftLineTotal = draftQuantity * draftUnitPrice;

  const availableGiftOptionsByCategory = useMemo(() => {
    const baseOptions = products.filter((product) => product.status === 'active');
    return {
      guantes: baseOptions.filter((product) => matchesProductCategoryFamily(product, 'guantes')),
      estuches: baseOptions.filter((product) => matchesProductCategoryFamily(product, 'estuches')),
      extensiones: baseOptions.filter((product) => matchesProductCategoryFamily(product, 'extensiones')),
      parachoques: baseOptions.filter(
        (product) =>
          matchesProductCategoryFamily(product, 'parachoques') &&
          product.subcategory.trim().toLowerCase() === 'parachoques'
      ),
    } satisfies Record<SaleGiftCategory, Product[]>;
  }, [products]);

  useEffect(() => {
    if (!open) return;
    const nextValues = initialValues
      ? {
          ...initialValues,
          items:
            initialValues.items.length > 0
              ? initialValues.items.map((item) => ({
                  ...item,
                  giftItems: normalizeGiftItems(item.giftItems ?? [], products, movements, {
                    defaultQuantity: Number(item.quantity) || 1,
                    maxQuantity: Number(item.quantity) || 1,
                  }),
                }))
              : [createDefaultLineItem()],
        }
      : defaultValues;
    form.reset(nextValues);
    setFirstItemGiftSectionEnabled(hasSelectedGiftItems(nextValues.items[0]?.giftItems ?? [], products));
  }, [form, initialValues, movements, open, products]);

  useEffect(() => {
    if (!firstItemCanHaveGift) {
      setFirstItemGiftSectionEnabled(false);
      return;
    }

    if (firstItemHasGiftSelection) {
      setFirstItemGiftSectionEnabled(true);
    }
  }, [firstItemCanHaveGift, firstItemHasGiftSelection]);

  useEffect(() => {
    if (!draftCanHaveGift) {
      setDraftGiftSectionEnabled(false);
      return;
    }

    if (draftHasGiftSelection) {
      setDraftGiftSectionEnabled(true);
    }
  }, [draftCanHaveGift, draftHasGiftSelection]);

  useEffect(() => {
    if (!draftLine.productId) return;

    const product = products.find((item) => item.id === draftLine.productId);
    if (!product) return;

    const nextPrice = String(
      draftSelectedVariant
        ? Number(draftSelectedVariant.salePrice ?? getVariantSalePrice(product, draftSelectedVariant.id))
        : getSaleUnitPriceForVariantSelection(product, draftLine.variantId || undefined)
    );
    setDraftLine((current) => {
      if (current.productId !== draftLine.productId || current.variantId !== draftLine.variantId) {
        return current;
      }
      if (current.unitPrice === nextPrice) {
        return current;
      }

      return {
        ...current,
        unitPrice: nextPrice,
      };
    });
  }, [draftLine.productId, draftLine.variantId, draftSelectedVariant, products]);

  const openNewLineDialog = () => {
    if (!hasSaleProduct) return;

    setEditingLineIndex(null);
    setDraftLine(createDefaultDraftLine());
    setDraftGiftSectionEnabled(false);
    setLineError('');
    setLineDialogOpen(true);
  };

  const openEditLineDialog = (index: number) => {
    setEditingLineIndex(index);
    const nextDraftLine = createDraftLineFromValue(values.items[index]);
    setDraftLine(nextDraftLine);
    setDraftGiftSectionEnabled(hasSelectedGiftItems(nextDraftLine.giftItems, products));
    setLineError('');
    setLineDialogOpen(true);
  };

  const saveDraftLine = () => {
    const draftLineProduct = products.find((product) => product.id === draftLine.productId);
    const normalizedDraftLine = {
      productId: draftLine.productId,
      variantId: draftLine.variantId,
      quantity: Number(draftLine.quantity) || 0,
      unitPrice: Number(draftLine.unitPrice) || 0,
      serviceItems: (draftLine.serviceItems ?? []).map((item) => {
        const normalizedServiceItem = normalizeSaleServiceItemForForm(item, draftLineProduct);
        return {
          ...normalizedServiceItem,
          price: Number(normalizedServiceItem.price) || 0,
          cost: Number(normalizedServiceItem.cost) || 0,
          cueReference: normalizedServiceItem.cueReference.trim(),
          serviceCategory: normalizedServiceItem.serviceCategory.trim() || 'torno',
          notes: normalizedServiceItem.notes.trim(),
          materials: (normalizedServiceItem.materials ?? []).map((material) => {
            const materialProduct = products.find((product) => product.id === material.productId);
            const selectedVariant = materialProduct?.variants?.find((variant) => variant.id === material.variantId);
            return {
              productId: material.productId,
              variantId: material.variantId?.trim() ?? '',
              variantName: selectedVariant?.name ?? material.variantName?.trim() ?? '',
              quantity: Number(material.quantity) || 1,
            };
          }),
        };
      }),
      giftItems: normalizeGiftItems(draftLine.giftItems, products, movements, {
        defaultQuantity: Number(draftLine.quantity) || 1,
        maxQuantity: Number(draftLine.quantity) || 1,
      }),
    };

    if (!normalizedDraftLine.productId) {
      setLineError('Selecciona el producto.');
      return;
    }
    if ((Number(normalizedDraftLine.quantity) || 0) <= 0) {
      setLineError('La cantidad debe ser mayor a cero.');
      return;
    }
    if ((draftLineProduct?.variants?.length ?? 0) > 0 && !normalizedDraftLine.variantId) {
      setLineError(`Selecciona ${draftLineProduct?.variantLabel?.toLowerCase() || 'la variante'} del producto.`);
      return;
    }
    const duplicatedVariantIndex = values.items.findIndex((item, index) => {
      if (editingLineIndex !== null && index === editingLineIndex) return false;
      return (
        buildSaleVariantKey(item.productId, item.variantId) !== '' &&
        buildSaleVariantKey(item.productId, item.variantId) ===
          buildSaleVariantKey(normalizedDraftLine.productId, normalizedDraftLine.variantId)
      );
    });
    if (duplicatedVariantIndex !== -1) {
      setLineError('Esa variante ya fue agregada en otra linea de la venta.');
      return;
    }
    if (normalizedDraftLine.giftItems.length > 0) {
      const invalidGift = normalizedDraftLine.giftItems.find(
        (giftItem) =>
          !giftItem.productId ||
          (Number(giftItem.quantity) || 0) <= 0 ||
          Number(giftItem.quantity) > normalizedDraftLine.quantity
      );
      if (invalidGift) {
        setLineError('Revisa los obsequios de esta linea.');
        return;
      }
    }
    if (
      normalizedDraftLine.serviceItems.some(
        (item) =>
          (Number(item.price) || 0) < 0 ||
          !String(item.cueReference ?? '').trim() ||
          (item.materials ?? []).some((material) => !material.productId || (Number(material.quantity) || 0) <= 0)
      )
    ) {
      setLineError('Completa el servicio asociado antes de guardar la linea.');
      return;
    }

    if (editingLineIndex === null && values.items.length === 1 && !values.items[0]?.productId) {
      update(0, normalizedDraftLine);
    } else if (editingLineIndex === null) {
      append(normalizedDraftLine);
    } else {
      update(editingLineIndex, normalizedDraftLine);
    }

    setLineDialogOpen(false);
    setEditingLineIndex(null);
    setDraftLine(createDefaultDraftLine());
    setDraftGiftSectionEnabled(false);
    setLineError('');
  };

  return (
    <>
      <AdminResponsiveDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isSubmitting) return;
          onOpenChange(nextOpen);
        }}
        title={isEditingSale ? 'Editar venta' : 'Registrar venta'}
        busy={isSubmitting}
        busyTitle={isEditingSale ? 'Actualizando venta...' : 'Registrando venta...'}
        busyDescription={
          isEditingSale
            ? 'Guardando cambios de inventario y venta. El formulario queda bloqueado para evitar duplicados.'
            : 'Guardando la venta y preparando la factura. El formulario queda bloqueado para evitar duplicados.'
        }
        desktopContentClassName="lg:max-w-6xl xl:max-w-[1180px]"
        mobileContentClassName="rounded-none border-0 bg-background dark:bg-slate-950"
        headerClassName="px-4 pt-3 pb-3 sm:px-5 lg:px-6"
        bodyClassName="px-3 py-3 pb-4 sm:px-5 lg:px-6"
        footerClassName="px-3 py-3 sm:px-5 lg:px-6"
        mobileFooterMode="inline"
        footer={
          <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
            <div className="grid gap-2 sm:flex sm:items-center">
              <div className="hidden min-w-[170px] rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60 md:block">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total</p>
                <p className="font-semibold text-foreground">{formatCurrency(totals.totalSale)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl bg-card/90 sm:h-9 sm:w-auto"
                onClick={openNewLineDialog}
                disabled={isSubmitting || !hasSaleProduct}
                title={!hasSaleProduct ? 'Selecciona primero el producto principal.' : undefined}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Agregar producto
              </Button>
            </div>
            <div className="grid grid-cols-[0.82fr_1.18fr] gap-2 sm:flex">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl sm:h-9 sm:w-auto"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button form={saleFormId} type="submit" className="h-11 w-full rounded-xl sm:h-9 sm:w-auto" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    {isEditingSale ? 'Actualizando...' : 'Registrando...'}
                  </>
                ) : isEditingSale ? (
                  'Actualizar venta'
                ) : (
                  'Registrar venta'
                )}
              </Button>
            </div>
          </div>
        }
      >
          <Form {...form}>
            <form
              id={saleFormId}
              onSubmit={form.handleSubmit(async (submittedValues) => {
                await onSubmit(submittedValues);
                form.reset(defaultValues);
              })}
              className="space-y-3.5 sm:space-y-6"
            >
              <fieldset disabled={isSubmitting} className="space-y-4 disabled:pointer-events-none disabled:opacity-70 sm:space-y-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#071a3d_0%,#0d2b78_52%,#102b4e_100%)] text-white shadow-[0_18px_44px_rgba(8,22,47,0.22)] dark:border-slate-800">
                <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center sm:p-5">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                      <ReceiptText className="h-3.5 w-3.5" />
                      {isEditingSale ? 'Edicion de venta' : 'Nueva venta'}
                    </div>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                      {formatCurrency(totals.totalSale)}
                    </p>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-200">
                      {customerLabel} · {formatNumber(saleUnits)} unidades · {formatNumber(selectedLineCount)} lineas
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:min-w-[340px]">
                    <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Estado</p>
                      <p className={cn('mt-1 text-sm font-semibold', saleReady ? 'text-emerald-200' : 'text-amber-200')}>
                        {saleReady ? 'Lista' : 'En proceso'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Items</p>
                      <p className="mt-1 text-sm font-semibold">{formatNumber(saleUnits)} uds</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Lineas</p>
                      <p className="mt-1 text-sm font-semibold">{formatNumber(selectedLineCount)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
                <div className="min-w-0 space-y-4">
              <AdminMobileSection
                value="sale-customer"
                title={
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-primary" />
                    Cliente y fecha
                  </span>
                }
                defaultOpen
                className="rounded-2xl border border-border bg-card/92 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/78 sm:p-5"
                contentClassName="pt-3 sm:pt-4"
              >
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <CustomerAutocomplete
                  customers={customers}
                  name={values.customerName}
                  phone={values.customerPhone}
                  documentNumber={values.customerDocument ?? ''}
                  onChange={updateCustomerFields}
                  nameError={form.formState.errors.customerName?.message}
                  phoneError={form.formState.errors.customerPhone?.message}
                  documentError={form.formState.errors.customerDocument?.message}
                  className="sm:col-span-2"
                />

                <FormField
                  control={form.control}
                  name="soldAt"
                  render={({ field }) => (
                    <FormItem className="lg:max-w-xs">
                      <FormLabel>Fecha de venta</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>
              </AdminMobileSection>

              <AdminMobileSection
                value="sale-items"
                title={
                  <span className="inline-flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    Productos de la venta
                  </span>
                }
                defaultOpen
                className="min-w-0 rounded-2xl border border-border bg-muted/45 p-3 dark:border-slate-800 dark:bg-slate-900/45 sm:p-5"
                contentClassName="space-y-3.5 sm:space-y-5"
              >

                {fields.length <= 1 ? (
                  <div className="rounded-2xl border border-border bg-card/94 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/76 sm:p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary/10 px-2 text-xs font-semibold text-primary">
                        #1
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Producto principal</p>
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'grid gap-5',
                      !firstItemHasService && '2xl:grid-cols-[minmax(0,1.45fr)_320px] 2xl:items-start'
                    )}
                  >
                    <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="items.0.productId"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel>Producto</FormLabel>
                          <FormControl>
                            <SearchableSelect
                              value={field.value}
                              onChange={(value) => {
                                field.onChange(value);
                                const product = products.find((item) => item.id === value);
                                const defaultVariant = getDefaultSaleVariant(product, movements, {
                                  usedVariantIds: getUsedVariantIdsForProduct(form.getValues('items'), value, 0),
                                });
                                if (product) {
                                  form.setValue(
                                    'items.0.unitPrice',
                                    getInitialSaleUnitPrice(product, movements, defaultVariant?.id),
                                    { shouldValidate: true }
                                  );
                                }
                                form.setValue('items.0.variantId', defaultVariant?.id ?? '', {
                                  shouldValidate: true,
                                });
                                form.setValue(
                                  'items.0.serviceItems',
                                  [],
                                  { shouldValidate: true }
                                );
                                const nextGiftItems =
                                  product && getAllowedSaleGiftCategories(product).length > 0
                                    ? normalizeGiftItems(
                                        (form.getValues('items.0.giftItems') ?? []).filter((giftItem) => giftItem.productId !== value),
                                        products,
                                        movements,
                                        {
                                          defaultQuantity: Number(form.getValues('items.0.quantity')) || 1,
                                          maxQuantity: Number(form.getValues('items.0.quantity')) || 1,
                                        }
                                      )
                                    : [];
                                form.setValue(
                                  'items.0.giftItems',
                                  nextGiftItems,
                                  { shouldValidate: true }
                                );
                              }}
                              placeholder="Selecciona producto"
                              searchPlaceholder="Buscar producto..."
                              emptyLabel="No se encontraron productos."
                              recentStorageKey="sales-products"
                              options={products.map((product) => ({
                                value: product.id,
                                label: `${product.name} - ${product.brand}`,
                              }))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {firstLineSummary?.product ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/60 md:px-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                                firstItemDisplayStock <= 0
                                  ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                              )}
                            >
                              <PackageCheck className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                {firstLineSummary.product.name} - {firstLineSummary.product.brand || 'Sin marca'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Stock disponible: <span className="font-semibold text-foreground">{formatNumber(firstItemDisplayStock)} uds</span>
                              </p>
                            </div>
                          </div>
                          {firstItemSelectedVariant ? (
                            <div className="rounded-xl border border-border/80 bg-background/80 px-3 py-2 sm:min-w-[200px]">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {firstItemProduct?.variantLabel || 'Variante'} elegida
                              </p>
                              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
                                {firstItemSelectedVariant.colorHex ? (
                                  <span
                                    className="h-3.5 w-3.5 rounded-full border border-border"
                                    style={{ backgroundColor: firstItemSelectedVariant.colorHex }}
                                  />
                                ) : null}
                                {firstItemSelectedVariant.name}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {firstItemVariantOptions.length > 0 ? (
                      <div className="space-y-2.5 rounded-2xl border border-amber-100 bg-amber-50/70 p-3 sm:p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {firstItemProduct?.variantLabel || 'Variante'} disponible
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {firstItemVariantOptions.map((variant) => (
                              <span
                                key={variant.id}
                                className="inline-flex items-center gap-1.5 rounded-full bg-card/88 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-950/72 dark:text-slate-200"
                              >
                                {variant.colorHex ? (
                                  <span
                                    className="h-3.5 w-3.5 rounded-full border border-slate-300"
                                    style={{ backgroundColor: variant.colorHex }}
                                  />
                                ) : null}
                                {variant.name} ({formatNumber(getProductVariantStock(firstItemProduct ?? undefined, variant.id, movements))})
                              </span>
                            ))}
                          </div>
                        </div>

                        <FormField
                          control={form.control}
                          name="items.0.variantId"
                          render={({ field }) => (
                          <FormItem className="min-w-0 max-w-full sm:max-w-sm">
                              <FormLabel>{firstItemProduct?.variantLabel || 'Variante'}</FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  form.setValue(
                                    'items.0.unitPrice',
                                    getSaleUnitPriceForVariantSelection(firstItemProduct, value),
                                    { shouldValidate: true }
                                  );
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={`Selecciona ${firstItemProduct?.variantLabel?.toLowerCase() || 'una opcion'}`} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {firstItemVariantOptions.map((variant) => (
                                    <SelectItem key={variant.id} value={variant.id}>
                                      {variant.name} ({formatNumber(getProductVariantStock(firstItemProduct ?? undefined, variant.id, movements))})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                      <FormField
                        control={form.control}
                        name="items.0.quantity"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Cantidad</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                max={Math.max(firstItemDisplayStock, 1)}
                                {...field}
                                onChange={(event) => {
                                  field.onChange(event);
                                  const nextQuantity = Math.max(Math.trunc(Number(event.target.value || 0)), 1);
                                  const currentLine = form.getValues('items.0');
                                  form.setValue(
                                    'items.0.giftItems',
                                    normalizeGiftItems(currentLine.giftItems ?? [], products, movements, {
                                      defaultQuantity: nextQuantity,
                                      maxQuantity: nextQuantity,
                                    }),
                                    { shouldValidate: true }
                                  );
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="items.0.unitPrice"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Precio unidad</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} disabled={!canEditUnitPrice} />
                            </FormControl>
                            {unitPriceHelpText ? <p className="text-xs text-muted-foreground">{unitPriceHelpText}</p> : null}
                            {!canEditUnitPrice ? (
                              <p className="text-xs text-muted-foreground">
                                Solo admin o superadmin pueden modificar el precio manualmente.
                              </p>
                            ) : null}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {discountSummary.lines.length > 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-medium text-amber-900 dark:text-amber-100">Resumen de descuento solicitado</p>
                          <p className="font-semibold text-amber-900 dark:text-amber-100">
                            Total descontado: {formatCurrency(discountSummary.totalDiscount)}
                          </p>
                        </div>
                        <div className="mt-3 space-y-2">
                          {discountSummary.lines.map((line) => (
                            <div key={line.key} className="rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-950/40">
                              <p className="font-medium text-slate-900 dark:text-slate-100">
                                Linea {line.lineNumber}: {line.productName}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-300">
                                {formatNumber(line.quantity)} uds · normal {formatCurrency(line.suggestedUnitPrice)} · solicitado {formatCurrency(line.requestedUnitPrice)}
                              </p>
                              <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                                Descuento linea: {formatCurrency(line.lineDiscount)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {supportsInstallationService(firstItemProduct) ? (
                      <SaleServiceSection
                        line={form.getValues('items.0')}
                        cueReferenceSuggestion={getSaleLineCueReferenceSuggestion(values.items, products, firstItem.productId, 0)}
                        serviceProduct={firstItemProduct}
                        products={products}
                        purchases={purchases}
                        movements={movements}
                        hideFinancialSummary={hideFinancialSummary}
                        onLineChange={(nextLine) =>
                          form.setValue('items.0', { ...form.getValues('items.0'), ...nextLine }, { shouldValidate: true })
                        }
                      />
                    ) : null}

                    {firstItemCanHaveGift ? (
                      <SaleGiftSection
                        enabled={firstItemGiftSectionEnabled}
                        onEnabledChange={(enabled) => {
                          setFirstItemGiftSectionEnabled(enabled);
                          if (!enabled) {
                            form.setValue('items.0.giftItems', [], { shouldValidate: true });
                          }
                        }}
                        line={form.getValues('items.0')}
                        onLineChange={(nextLine) =>
                          form.setValue('items.0', { ...form.getValues('items.0'), ...nextLine }, { shouldValidate: true })
                        }
                        products={products}
                        movements={movements}
                        allowedCategories={firstItemAllowedGiftCategories}
                        availableGiftOptionsByCategory={availableGiftOptionsByCategory}
                      />
                    ) : firstItem.productId ? (
                      <div className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        Los obsequios no aplican para este producto.
                      </div>
                    ) : null}

                    </div>

                    {firstItemProduct && !firstItemHasService ? (
                      <aside className="hidden rounded-3xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 2xl:block">
                        <div className="overflow-hidden rounded-2xl border border-border bg-card/88 dark:border-slate-800 dark:bg-slate-950/72">
                          <div className="relative aspect-[4/3] w-full">
                            <Image
                              src={firstItemProduct.image || SITE_LOGO}
                              alt={firstItemProduct.name}
                              fill
                              className="object-cover"
                              style={{ transform: `rotate(${firstItemProduct.imageRotation}deg)` }}
                              unoptimized={(firstItemProduct.image || SITE_LOGO).startsWith('data:')}
                            />
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Vista del producto</p>
                            <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-100">{firstItemProduct.name}</p>
                            <p className="text-sm text-slate-500">{firstItemProduct.brand || 'Sin marca'}</p>
                          </div>

                          <div
                            className={cn(
                              'rounded-2xl border px-4 py-3',
                              firstItemDisplayStock <= 0
                                ? 'border-rose-200 bg-rose-50'
                                : 'border-emerald-200 bg-emerald-50'
                            )}
                          >
                            <p
                              className={cn(
                                'text-xs font-semibold uppercase tracking-wide',
                                firstItemDisplayStock <= 0 ? 'text-rose-700' : 'text-emerald-700'
                              )}
                            >
                              Stock actual
                            </p>
                            <p
                              className={cn(
                                'mt-1 text-2xl font-semibold',
                                firstItemDisplayStock <= 0 ? 'text-rose-800' : 'text-emerald-800'
                              )}
                            >
                              {formatNumber(firstItemDisplayStock)}
                            </p>
                            <p className={cn('mt-1 text-sm', firstItemDisplayStock <= 0 ? 'text-rose-700' : 'text-emerald-700')}>
                              {firstItemDisplayStock <= 0 ? 'Sin disponibilidad' : 'Disponible para venta'}
                            </p>
                          </div>

                          {firstItemSelectedVariant ? (
                            <div className="rounded-2xl bg-card/88 px-3 py-2.5 dark:bg-slate-950/72 sm:px-4 sm:py-3">
                              <p className="text-xs text-slate-500 dark:text-slate-400">{firstItemProduct.variantLabel || 'Variante'}</p>
                              <p className="mt-1 flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                                {firstItemSelectedVariant.colorHex ? (
                                  <span
                                    className="h-4 w-4 rounded-full border border-slate-300"
                                    style={{ backgroundColor: firstItemSelectedVariant.colorHex }}
                                  />
                                ) : null}
                                {firstItemSelectedVariant.name}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </aside>
                    ) : null}
                  </div>

                  {firstLineSummary?.product ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/75 px-3 py-2.5 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                      <span className="truncate">{firstLineSummary.product.name} - {firstLineSummary.product.brand || 'Sin marca'}</span>
                      <span className="font-medium text-slate-900">
                        {firstLineSummary.selectedVariant ? `${firstLineSummary.selectedVariant.name} · ` : ''}
                        Total linea: {formatCurrency(firstLineSummary.totalSale + firstLineSummary.serviceTotalRevenue)}
                      </span>
                    </div>
                  ) : null}
                </div>
                ) : null}

                {fields.length > 1 ? (
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const summary = saleSummaries[index];
                      return (
                        <div key={field.id} className="rounded-2xl border border-border bg-card/88 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/72 sm:p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium text-slate-900 dark:text-slate-100">
                                {summary.product?.name ?? 'Producto'} x {formatNumber(summary.quantity)}
                              </p>
                              <p className="text-sm text-slate-500">
                                {summary.selectedVariant ? `${summary.selectedVariant.name} · ` : ''}
                                Precio unidad: {formatCurrency(summary.unitPrice)}
                              </p>
                              <p className="text-sm text-slate-500">
                                Total linea: {formatCurrency(summary.totalSale + summary.serviceTotalRevenue)}
                              </p>
                              {summary.serviceItems.length > 0 ? (
                                <p className="text-sm text-cyan-700">
                                  Servicio: {summary.serviceItems.map((item) => {
                                    const charge = Number(item.totalRevenue) || 0;
                                    return `${serviceTypeLabels[item.serviceType]} ${charge > 0 ? formatCurrency(charge) : 'incluido'}`;
                                  }).join(', ')}
                                </p>
                              ) : null}
                              {summary.giftItems.length > 0 ? (
                                <p className="text-sm text-violet-700">
                                  Obsequios: {summary.giftItems.map((giftItem) => `${giftItem.product?.name ?? 'Producto'} x ${formatNumber(giftItem.quantity)}`).join(', ')}
                                </p>
                              ) : (
                                <p className="text-sm text-slate-400">Sin obsequio</p>
                              )}
                            </div>

                            <div className="sm:shrink-0">
                              <ResponsiveRowActions
                                actions={[
                                  {
                                    label: 'Editar',
                                    icon: <Pencil className="h-4 w-4" />,
                                    onClick: () => openEditLineDialog(index),
                                  },
                                  {
                                    label: 'Quitar',
                                    icon: <MinusCircle className="h-4 w-4" />,
                                    onClick: () => remove(index),
                                    destructive: true,
                                  },
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <FormField
                  control={form.control}
                  name="items"
                  render={() => <FormMessage />}
                />

                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="hidden w-full rounded-xl bg-card/88 sm:inline-flex"
                    onClick={openNewLineDialog}
                    disabled={isSubmitting || !hasSaleProduct}
                    title={!hasSaleProduct ? 'Selecciona primero el producto principal.' : undefined}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar producto
                  </Button>

                  <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/75 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 dark:border-emerald-900/60 dark:bg-emerald-950/22">
                    <div>
                      <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">Total acumulado de la venta</p>
                      <p className="text-xs text-emerald-800 dark:text-emerald-200/80">
                        {formatNumber(saleSummaries.reduce((sum, item) => sum + item.quantity, 0))} unidades en {
                          formatNumber(selectedLineCount)
                        } lineas
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">{formatCurrency(totals.totalSale)}</p>
                  </div>
                </div>
              </AdminMobileSection>

              <AdminMobileSection
                value="sale-notes"
                title={
                  <span className="inline-flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Notas internas
                  </span>
                }
                className="rounded-2xl border border-border bg-card/92 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/78 sm:p-5"
                contentClassName="pt-3 sm:pt-4"
              >
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                     
                      <FormControl>
                        <Textarea rows={4} placeholder="Ejemplo: venta en mostrador o pedido especial" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </AdminMobileSection>

                </div>

                <aside className="min-w-0 xl:sticky xl:top-0">
              <AdminMobileSection
                value="sale-summary"
                title={
                  <span className="inline-flex items-center gap-2">
                    <ReceiptText className="h-4 w-4 text-primary" />
                    Resumen
                  </span>
                }
                defaultOpen
                className="rounded-2xl border border-border bg-card/94 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/82 sm:p-5"
                contentClassName="pt-3 sm:pt-4"
              >
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 dark:border-primary/25 dark:bg-primary/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Total venta</p>
                    <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-foreground">
                      {formatCurrency(totals.totalSale)}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-background/70 px-3 py-2 dark:bg-slate-950/45">
                        <p className="text-xs text-muted-foreground">Unidades</p>
                        <p className="font-semibold text-foreground">{formatNumber(saleUnits)}</p>
                      </div>
                      <div className="rounded-xl bg-background/70 px-3 py-2 dark:bg-slate-950/45">
                        <p className="text-xs text-muted-foreground">Lineas</p>
                        <p className="font-semibold text-foreground">{formatNumber(selectedLineCount)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/45 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <UserRound className="h-4 w-4" />
                        Cliente
                      </span>
                      <span className="max-w-[150px] truncate font-medium text-foreground">{customerLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/45 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        Fecha
                      </span>
                      <span className="font-medium text-foreground">{values.soldAt || 'Sin fecha'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/45 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <PackageCheck className="h-4 w-4" />
                        Estado
                      </span>
                      <span className={cn('font-semibold', saleReady ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>
                        {saleReady ? 'Lista para registrar' : 'Completa producto y cantidad'}
                      </span>
                    </div>
                  </div>

                  {!hideFinancialSummary && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/55">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Coins className="h-4 w-4 text-primary" />
                        Margen estimado
                      </div>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Costo productos</span>
                          <span className="font-medium text-foreground">{formatCurrency(saleProductCost)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Costo obsequios</span>
                          <span className="font-medium text-foreground">{formatCurrency(totals.totalGiftCost)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-2 dark:border-slate-800">
                          <span className="font-medium text-foreground">Utilidad neta</span>
                          <span className={cn('font-semibold', totals.grossProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>
                            {formatCurrency(totals.grossProfit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </AdminMobileSection>
                </aside>
              </div>
              </fieldset>
            </form>
          </Form>
      </AdminResponsiveDialog>

      <AdminResponsiveDialog
        open={lineDialogOpen}
        onOpenChange={(nextOpen) => {
          if (isSubmitting) return;
          setLineDialogOpen(nextOpen);
        }}
        title={editingLineIndex === null ? 'Agregar producto a la venta' : 'Editar producto de la venta'}
        desktopContentClassName="lg:max-w-5xl"
        mobileContentClassName="rounded-none border-0 bg-background dark:bg-slate-950"
        headerClassName="px-4 pt-3 pb-3 sm:px-5 lg:px-6"
        bodyClassName="px-3 py-3 pb-4 sm:px-5 lg:px-6"
        footerClassName="px-3 py-3 sm:px-5 lg:px-6"
        mobileFooterMode="inline"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl sm:h-9"
              onClick={() => setLineDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button form={lineFormId} type="submit" className="h-11 rounded-xl sm:h-9" disabled={isSubmitting}>
              {editingLineIndex === null ? 'Agregar producto' : 'Guardar cambios'}
            </Button>
          </div>
        }
      >
          <form
            id={lineFormId}
            onSubmit={(event) => {
              event.preventDefault();
              saveDraftLine();
            }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,0.98)_0%,rgba(239,246,255,0.9)_100%)] p-3 shadow-sm dark:border-slate-800 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.94)_0%,rgba(8,47,73,0.52)_100%)] sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ShoppingBag className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {draftProduct?.name ?? 'Selecciona el producto'}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {draftProduct
                        ? `${draftProduct.brand || 'Sin marca'} · Stock ${formatNumber(draftDisplayStock)}`
                        : 'Producto pendiente'}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-right dark:border-slate-800 dark:bg-slate-950/50">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total linea</p>
                  <p className="text-base font-semibold text-foreground">{formatCurrency(draftLineTotal)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-card/92 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/78 sm:p-4">
            <div className="space-y-2">
              <Label>Producto</Label>
                <SearchableSelect
                  value={draftLine.productId}
                  onChange={(value) => {
                  const product = products.find((item) => item.id === value);
                  const defaultVariant = getDefaultSaleVariant(product, movements, {
                    usedVariantIds: getUsedVariantIdsForProduct(values.items, value, editingLineIndex),
                  });
                    setDraftLine((current) => ({
                      ...current,
                      productId: value,
                      variantId: defaultVariant?.id ?? '',
                      quantity: current.quantity || '1',
                      unitPrice: product ? String(getInitialSaleUnitPrice(product, movements, defaultVariant?.id)) : current.unitPrice,
                      serviceItems: [],
                      giftItems:
                        product && getAllowedSaleGiftCategories(product).length > 0
                          ? normalizeGiftItems(
                              (current.giftItems ?? []).filter((giftItem) => giftItem.productId !== value),
                              products,
                              movements,
                              {
                                defaultQuantity: Number(current.quantity) || 1,
                                maxQuantity: Number(current.quantity) || 1,
                              }
                            )
                          : [],
                    }));
                  setLineError('');
                }}
                  placeholder="Selecciona producto"
                  searchPlaceholder="Buscar producto..."
                  emptyLabel="No se encontraron productos."
                  recentStorageKey="sales-products"
                  options={products.map((product) => ({
                    value: product.id,
                    label: `${product.name} - ${product.brand}`,
                  }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {draftVariantOptions.length > 0 ? (
                      <div className="min-w-0 space-y-2 sm:col-span-2">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <Label>{draftProduct?.variantLabel || 'Variante'}</Label>
                          {draftUsedVariantIds.size > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Las variantes ya usadas en otras lineas no se pueden repetir.
                            </p>
                          ) : null}
                        </div>
                  <Select
                    value={draftLine.variantId}
                  onValueChange={(value) => {
                      setDraftLine((current) => ({
                        ...current,
                        variantId: value,
                      }));
                      setLineError('');
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={`Selecciona ${draftProduct?.variantLabel?.toLowerCase() || 'una opcion'}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {draftVariantOptions.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.name} ({formatNumber(getProductVariantStock(draftProduct ?? undefined, variant.id, movements))})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {draftLine.productId ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/60 sm:col-span-2 md:px-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                          draftDisplayStock <= 0
                            ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                        )}
                      >
                        <PackageCheck className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-foreground">
                          {draftProduct?.name ?? 'Producto'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stock disponible: <span className="font-semibold text-foreground">{formatNumber(draftDisplayStock)} uds</span>
                        </p>
                      </div>
                    </div>
                    {draftSelectedVariant ? (
                      <div className="rounded-xl border border-border/80 bg-background/80 px-3 py-2 sm:min-w-[200px]">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {draftProduct?.variantLabel || 'Variante'} elegida
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
                          {draftSelectedVariant.colorHex ? (
                            <span
                              className="h-3.5 w-3.5 rounded-full border border-border"
                              style={{ backgroundColor: draftSelectedVariant.colorHex }}
                            />
                          ) : null}
                          {draftSelectedVariant.name}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="min-w-0 space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  max={Math.max(
                    draftLine.productId
                      ? draftLine.variantId
                        ? getProductVariantStock(draftProduct ?? undefined, draftLine.variantId, movements)
                        : getStoredProductStock(draftProduct ?? undefined)
                      : 1,
                    1
                  )}
                  value={draftLine.quantity}
                  onChange={(event) => {
                    setDraftLine((current) => {
                      const nextQuantity = Math.max(Math.trunc(Number(event.target.value || 0)), 1);
                      return {
                        ...current,
                        quantity: event.target.value,
                        giftItems: normalizeGiftItems(current.giftItems ?? [], products, movements, {
                          defaultQuantity: nextQuantity,
                          maxQuantity: nextQuantity,
                        }),
                      };
                    });
                    setLineError('');
                  }}
                />
              </div>

              <div className="min-w-0 space-y-2">
                <Label>Precio unidad</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftLine.unitPrice}
                  disabled={!canEditUnitPrice}
                  onChange={(event) => {
                    setDraftLine((current) => ({ ...current, unitPrice: event.target.value }));
                    setLineError('');
                  }}
                />
                {unitPriceHelpText ? <p className="text-xs text-muted-foreground">{unitPriceHelpText}</p> : null}
                {!canEditUnitPrice ? (
                  <p className="text-xs text-muted-foreground">
                    El precio manual requiere permiso de admin o superadmin.
                  </p>
                ) : null}
              </div>
            </div>
            </div>

            {draftDiscountPreview ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-medium text-amber-900 dark:text-amber-100">Descuento en esta linea</p>
                  <p className="font-semibold text-amber-900 dark:text-amber-100">
                    Total: {formatCurrency(draftDiscountPreview.totalDiscount)}
                  </p>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  Normal {formatCurrency(draftDiscountPreview.suggestedUnitPrice)} · solicitado {formatCurrency(draftDiscountPreview.requestedUnitPrice)}
                </p>
              </div>
            ) : null}

            {supportsInstallationService(draftProduct) ? (
              <SaleServiceSection
                line={draftLine}
                cueReferenceSuggestion={getSaleLineCueReferenceSuggestion(
                  values.items,
                  products,
                  draftLine.productId,
                  editingLineIndex
                )}
                serviceProduct={draftProduct}
                products={products}
                purchases={purchases}
                movements={movements}
                hideFinancialSummary={hideFinancialSummary}
                onLineChange={(nextLine) => {
                  setDraftLine((current) => ({ ...current, ...nextLine }));
                  setLineError('');
                }}
              />
            ) : null}

            {draftCanHaveGift ? (
              <SaleGiftSection
                enabled={draftGiftSectionEnabled}
                onEnabledChange={(enabled) => {
                  setDraftGiftSectionEnabled(enabled);
                  if (!enabled) {
                    setDraftLine((current) => ({ ...current, giftItems: [] }));
                  }
                  setLineError('');
                }}
                line={draftLine}
                onLineChange={(nextLine) => {
                  setDraftLine((current) => ({ ...current, ...nextLine }));
                  setLineError('');
                }}
                products={products}
                movements={movements}
                allowedCategories={draftAllowedGiftCategories}
                availableGiftOptionsByCategory={availableGiftOptionsByCategory}
              />
            ) : draftLine.productId ? (
              <div className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/60">
                Los obsequios no aplican para este producto.
              </div>
            ) : null}

            {lineError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {lineError}
              </p>
            ) : null}
          </form>
      </AdminResponsiveDialog>
    </>
  );
}
