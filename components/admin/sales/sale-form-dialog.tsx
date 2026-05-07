'use client';

import Image from 'next/image';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Gift, MinusCircle, Pencil, PlusCircle } from 'lucide-react';
import { AdminMobileSection } from '@/components/admin/admin-mobile-section';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatNumber, getProductStock, getVariantOrProductRealUnitCost } from '@/lib/admin/calculations';
import { getTodayDateInputValue } from '@/lib/admin/date-utils';
import { matchesProductCategoryFamily } from '@/lib/admin/category-rules';
import {
  formatSaleGiftCategoryList,
  getAllowedSaleGiftCategories,
  getSaleGiftCategoryKey,
  saleGiftCategories,
  type SaleGiftCategory,
} from '@/lib/admin/sale-gift-rules';
import type { InventoryMovement, Product, Purchase } from '@/lib/admin/types';
import { createDefaultInstallationServiceItem, supportsInstallationService } from '@/lib/admin/sale-service-helpers';
import { getProductVariantStock, getVariantSalePrice } from '@/lib/admin/variant-helpers';
import { cn } from '@/lib/utils';
import { SITE_LOGO } from '@/lib/branding';
import { ResponsiveRowActions } from '@/components/admin/shared/responsive-row-actions';

const saleGiftItemSchema = z.object({
  productId: z.string().default(''),
  quantity: z.coerce.number().min(0, 'Ingresa una cantidad valida').default(0),
});

const saleServiceItemSchema = z.object({
  serviceType: z.enum(['tip-installation', 'tip-ferrule-installation', 'extension-installation']).default('tip-installation'),
  serviceCategory: z.string().default('torno'),
  price: z.coerce.number().min(0, 'Ingresa un precio valido').default(0),
  cost: z.coerce.number().min(0, 'Ingresa un costo valido').default(0),
  cueReference: z.string().default(''),
  notes: z.string().default(''),
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
    customerName: z.string().min(2, 'Ingresa el nombre del cliente'),
    notes: z.string().default(''),
  })
  .superRefine((values, context) => {
    if (values.customerName.trim().toLowerCase() === 'cliente mostrador') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerName'],
        message: 'Ingresa el nombre real del cliente.',
      });
    }

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

      item.giftItems.forEach((giftItem, giftIndex) => {
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

      item.serviceItems.forEach((serviceItem, serviceIndex) => {
        if ((Number(serviceItem.price) || 0) <= 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'serviceItems', serviceIndex, 'price'],
            message: 'Ingresa el precio del servicio',
          });
        }
        if ((Number(serviceItem.cost) || 0) < 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'serviceItems', serviceIndex, 'cost'],
            message: 'Ingresa un costo valido para el servicio',
          });
        }
        if (!serviceItem.cueReference.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'serviceItems', serviceIndex, 'cueReference'],
            message: 'Describe el taco o la referencia del servicio',
          });
        }
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
}: {
  line: { serviceItems: SaleLineFormValue['serviceItems'] };
  onLineChange: (nextLine: { serviceItems: SaleLineFormValue['serviceItems'] }) => void;
}) {
  const serviceItem = line.serviceItems[0];
  const enabled = Boolean(serviceItem);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">
            <Gift className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Servicio asociado</p>
            <p className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
              Registra aqui la instalacion para medir por separado el ingreso y la utilidad del torno.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-border bg-card/88 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
          <Checkbox
            checked={enabled}
            onCheckedChange={(checked) => {
              const nextEnabled = checked === true;
              onLineChange({
                ...line,
                serviceItems: nextEnabled ? [serviceItem ?? createDefaultInstallationServiceItem()] : [],
              });
            }}
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Incluir instalacion</span>
        </label>
      </div>

      {enabled && serviceItem ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2 md:col-span-3">
            <Label>Referencia del taco</Label>
            <Input
              value={serviceItem.cueReference}
              placeholder="Ej: Taco Cuetec de Juan"
              onChange={(event) =>
                onLineChange({
                  ...line,
                  serviceItems: [{ ...serviceItem, cueReference: event.target.value }],
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Precio servicio</Label>
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
          </div>

          <div className="space-y-2">
            <Label>Costo servicio</Label>
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
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Input
              value={serviceItem.serviceCategory ?? 'torno'}
              onChange={(event) =>
                onLineChange({
                  ...line,
                  serviceItems: [{ ...serviceItem, serviceCategory: event.target.value }],
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
  customerName: 'Cliente mostrador',
  notes: '',
};

export function SaleFormDialog({
  open,
  onOpenChange,
  products,
  purchases,
  movements,
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

  const values = form.watch();
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
  const normalizedCustomerPhone = values.customerPhone?.trim() ?? '';

  const saleSummaries = values.items.map((saleItem) => {
    const product = products.find((item) => item.id === saleItem.productId);
    const selectedVariant = product?.variants?.find((variant) => variant.id === saleItem.variantId) ?? null;
    const stock = product
      ? selectedVariant
        ? getProductVariantStock(product, selectedVariant.id, movements)
        : getProductStock(movements, product.id)
      : 0;
    const realUnitCost = product
      ? getVariantOrProductRealUnitCost(purchases, product.id, selectedVariant?.id)
      : 0;
    const quantity = Number(saleItem.quantity) || 0;
    const unitPrice = Number(saleItem.unitPrice) || 0;
    const giftItems = saleItem.giftItems.map((giftItem) => {
      const giftProduct = products.find((item) => item.id === giftItem.productId);
      const giftStock = giftProduct ? getProductStock(movements, giftProduct.id) : 0;
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
      return {
        ...serviceItem,
        price,
        cost,
        profit: price - cost,
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
      serviceTotalRevenue: serviceItems.reduce((sum, item) => sum + item.price, 0),
      serviceTotalCost: serviceItems.reduce((sum, item) => sum + item.cost, 0),
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
  const firstLineSummary = saleSummaries[0] ?? null;
  const firstItemProduct = products.find((product) => product.id === firstItem.productId) ?? null;
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
    : draftLine.productId
      ? getProductStock(movements, draftLine.productId)
      : 0;
  const draftAllowedGiftCategories = draftProduct ? getAllowedSaleGiftCategories(draftProduct) : [];
  const draftCanHaveGift = draftAllowedGiftCategories.length > 0;
  const draftHasGiftSelection = hasSelectedGiftItems(draftLine.giftItems, products);

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
                  giftItems: normalizeGiftItems(item.giftItems, products, movements, {
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
    const normalizedDraftLine = {
      productId: draftLine.productId,
      variantId: draftLine.variantId,
      quantity: Number(draftLine.quantity) || 0,
      unitPrice: Number(draftLine.unitPrice) || 0,
      serviceItems: (draftLine.serviceItems ?? []).map((item) => ({
        ...item,
        price: Number(item.price) || 0,
        cost: Number(item.cost) || 0,
        cueReference: item.cueReference?.trim() ?? '',
        serviceCategory: item.serviceCategory?.trim() ?? 'torno',
        notes: item.notes?.trim() ?? '',
      })),
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
    const draftLineProduct = products.find((product) => product.id === normalizedDraftLine.productId);
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
    if (normalizedDraftLine.serviceItems.some((item) => (Number(item.price) || 0) <= 0 || !item.cueReference.trim())) {
      setLineError('Completa el servicio asociado antes de guardar la linea.');
      return;
    }

    if (editingLineIndex === null) {
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
        onOpenChange={onOpenChange}
        title={isEditingSale ? 'Editar venta' : 'Registrar venta'}
        description={
          hideFinancialSummary
            ? 'Cada venta descuenta stock y mantiene actualizado el inventario.'
            : 'Cada venta descuenta stock y deja trazabilidad para los reportes del negocio.'
        }
        desktopContentClassName="lg:max-w-4xl"
        footer={
          <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={openNewLineDialog}
              disabled={isSubmitting}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Agregar producto
            </Button>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button form={saleFormId} type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : isEditingSale ? 'Actualizar venta' : 'Registrar venta'}
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
              <AdminMobileSection
                value="sale-customer"
                title="Cliente y fecha"
                defaultOpen
                className="rounded-3xl border border-border bg-card/88 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/72 sm:p-6"
              >
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Nombre del cliente</FormLabel>
                      <FormControl>
                        <Input placeholder="Cliente mostrador" {...field} />
                      </FormControl>
                      {normalizedCustomerPhone.length >= 7 ? (
                        <p className="hidden text-xs text-slate-500 sm:block">
                          Si vas a vender a mostrador, reemplaza `Cliente mostrador` por el nombre real antes de guardar.
                        </p>
                      ) : (
                        <p className="hidden text-xs text-slate-500 sm:block">
                          Ingresa nombre y telefono del cliente para registrar mejor la venta.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerPhone"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Telefono del cliente</FormLabel>
                      <FormControl>
                        <Input placeholder="Ingresa numero de telefono Ej: 3002565865" inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="soldAt"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2 lg:max-w-xs">
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
                title="Productos de la venta"
                description="El primer producto se elige aqui. Usa `Agregar producto` solo cuando la venta tenga mas lineas."
                defaultOpen
                className="min-w-0 rounded-3xl border border-border bg-muted/60 p-3 dark:border-slate-800 dark:bg-slate-900/55 sm:p-5 lg:p-6"
                contentClassName="space-y-3.5 sm:space-y-5"
              >

                {fields.length <= 1 ? (
                  <div className="rounded-2xl border border-border bg-card/88 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/72 sm:p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        #1
                      </span>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Producto principal</p>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_320px] lg:items-start">
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
                                  supportsInstallationService(product) ? [createDefaultInstallationServiceItem()] : [],
                                  { shouldValidate: true }
                                );
                                const nextGiftItems =
                                  product && getAllowedSaleGiftCategories(product).length > 0
                                    ? normalizeGiftItems(
                                        form.getValues('items.0.giftItems').filter((giftItem) => giftItem.productId !== value),
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
                      <div className="sticky bottom-24 z-10 space-y-3 rounded-2xl border border-border bg-card/88 px-3.5 py-3 shadow-sm dark:bg-slate-900/82 md:static md:px-4 md:shadow-none">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                              Stock disponible
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-foreground">
                              {formatNumber(firstItemDisplayStock)} unidades
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {firstLineSummary.product.name} - {firstLineSummary.product.brand || 'Sin marca'}
                            </p>
                          </div>
                          {firstItemSelectedVariant ? (
                            <div className="rounded-2xl border border-border/80 bg-muted/60 px-3 py-2.5 sm:min-w-[220px]">
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
                        <p className="text-sm text-muted-foreground">
                          {firstItemDisplayStock > 0 ? 'Inventario disponible para esta seleccion.' : 'Sin unidades disponibles para esta seleccion.'}
                        </p>
                      </div>
                    ) : null}

                    {firstItemVariantOptions.length > 0 ? (
                      <div className="space-y-2.5 rounded-2xl border border-amber-100 bg-amber-50/70 p-3 sm:p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {firstItemProduct?.variantLabel || 'Variante'} disponible
                            </p>
                            <p className="hidden text-sm text-slate-500 sm:block">
                              Selecciona la opcion que le queda al cliente y revisa cuantas unidades hay.
                            </p>
                            {firstItemUsedVariantIds.size > 0 ? (
                              <p className="hidden text-xs text-slate-500 sm:block">
                                Las variantes ya usadas en otras lineas no aparecen aqui.
                              </p>
                            ) : null}
                            {firstItemVariantOptions.length > 1 ? (
                              <p className="hidden text-xs text-amber-700 sm:block">
                                El precio se define cuando eliges la variante.
                              </p>
                            ) : null}
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
                                    normalizeGiftItems(currentLine.giftItems, products, movements, {
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
                                Solo `admin` o `superadmin` pueden modificar el precio manualmente.
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

                    {firstItemProduct ? (
                      <aside className="hidden rounded-3xl border border-border bg-muted/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 lg:block">
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
                                  Servicio: {summary.serviceItems.map((item) => `${item.serviceCategory || 'torno'} ${formatCurrency(item.price)}`).join(', ')}
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
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-card/88 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                    Si la venta tiene mas de un producto, usa `Agregar producto` para sumarlo a la lista.
                  </div>
                )}
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
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar producto
                  </Button>

                  <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/75 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 dark:border-emerald-900/60 dark:bg-emerald-950/22">
                    <div>
                      <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">Total acumulado de la venta</p>
                      <p className="text-xs text-emerald-800 dark:text-emerald-200/80">
                        {formatNumber(saleSummaries.reduce((sum, item) => sum + item.quantity, 0))} unidades en {
                          formatNumber(fields.length)
                        } lineas
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">{formatCurrency(totals.totalSale)}</p>
                  </div>
                </div>
              </AdminMobileSection>

              <AdminMobileSection
                value="sale-notes"
                title="Notas"
                className="rounded-3xl border border-border bg-card/88 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/72 sm:p-6"
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

              <AdminMobileSection
                value="sale-summary"
                title="Resumen de la venta"
                defaultOpen
                className="rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-3.5 dark:border-cyan-900/60 dark:bg-cyan-950/18 sm:p-6"
              >
                <div className={`mt-4 grid gap-3 ${hideFinancialSummary ? 'sm:grid-cols-1 lg:grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
                  <div className="rounded-2xl border border-border/70 bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/68 sm:p-4">
                    <p className="text-xs text-muted-foreground">Unidades en venta</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {formatNumber(saleSummaries.reduce((sum, item) => sum + item.quantity, 0))} uds
                    </p>
                  </div>
                  {!hideFinancialSummary && (
                    <>
                      <div className="rounded-2xl border border-border/70 bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/68 sm:p-4">
                        <p className="text-xs text-muted-foreground">Costo total productos</p>
                        <p className="mt-1 font-semibold text-foreground">
                          {formatCurrency(saleSummaries.reduce((sum, item) => sum + item.totalCost, 0))}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/68 sm:p-4">
                        <p className="text-xs text-muted-foreground">Ingreso total</p>
                        <p className="mt-1 font-semibold text-foreground">{formatCurrency(totals.totalSale)}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/68 sm:p-4">
                        <p className="text-xs text-muted-foreground">Costo total obsequios</p>
                        <p className="mt-1 font-semibold text-foreground">{formatCurrency(totals.totalGiftCost)}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/75 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/22 sm:p-4">
                        <p className="text-xs text-emerald-700 dark:text-emerald-100/75">Utilidad neta</p>
                        <p className="mt-1 font-semibold text-emerald-900 dark:text-emerald-100">{formatCurrency(totals.grossProfit)}</p>
                      </div>
                    </>
                  )}
                </div>
              </AdminMobileSection>
            </form>
          </Form>
      </AdminResponsiveDialog>

      <AdminResponsiveDialog
        open={lineDialogOpen}
        onOpenChange={setLineDialogOpen}
        title={editingLineIndex === null ? 'Agregar producto a la venta' : 'Editar producto de la venta'}
        description="Configura esta linea y al guardarla quedara en la lista de productos solicitados."
        desktopContentClassName="lg:max-w-4xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setLineDialogOpen(false)}>
              Cancelar
            </Button>
            <Button form={lineFormId} type="submit">
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
            className="space-y-3.5"
          >
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
                      serviceItems: supportsInstallationService(product) ? [createDefaultInstallationServiceItem()] : [],
                      giftItems:
                        product && getAllowedSaleGiftCategories(product).length > 0
                          ? normalizeGiftItems(
                              current.giftItems.filter((giftItem) => giftItem.productId !== value),
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
                <div className="sticky bottom-24 z-10 space-y-3 rounded-2xl border border-border bg-card/88 px-3.5 py-3 shadow-sm dark:bg-slate-900/82 sm:col-span-2 md:static md:px-4 md:shadow-none">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                        Stock disponible
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">
                        {formatNumber(draftDisplayStock)} unidades
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {draftDisplayStock > 0 ? 'Inventario listo para esta linea.' : 'Sin unidades disponibles para esta seleccion.'}
                      </p>
                    </div>
                    {draftSelectedVariant ? (
                      <div className="rounded-2xl border border-border/80 bg-muted/60 px-3 py-2.5 sm:min-w-[220px]">
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
                        : getProductStock(movements, draftLine.productId)
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
                        giftItems: normalizeGiftItems(current.giftItems, products, movements, {
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
                    El precio manual requiere permiso de `admin` o `superadmin`.
                  </p>
                ) : null}
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
