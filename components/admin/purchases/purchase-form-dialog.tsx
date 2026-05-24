'use client';

import { useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MinusCircle, Pencil, PlusCircle } from 'lucide-react';
import {
  calculatePurchaseTotals,
  formatCurrency,
  formatNumber,
} from '@/lib/admin/calculations';
import { shouldNormalizePackPurchaseToBundle } from '@/lib/admin/category-rules';
import type { Product, Supplier } from '@/lib/admin/types';
import { AdminMobileSection } from '@/components/admin/admin-mobile-section';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { Button } from '@/components/ui/button';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getTodayDateInputValue } from '@/lib/admin/date-utils';

const purchaseLineSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  variantId: z.string().default(''),
  presentationQuantity: z.coerce.number().positive('Cantidad invalida'),
  purchaseUnitValue: z.coerce.number().min(0),
  purchaseUnitValueUsd: z.coerce.number().min(0),
  suggestedSalePrice: z.coerce.number().min(0),
});

const purchaseSchema = z.object({
  purchaseType: z.enum(['local', 'international']).default('local'),
  supplierId: z.string().optional(),
  supplier: z.string().min(2, 'Ingresa el proveedor'),
  purchasedAt: z.string().min(1, 'Selecciona la fecha'),
  shippingValueTotal: z.coerce.number().min(0),
  internationalVendorName: z.string().optional(),
  productsValueUsd: z.coerce.number().min(0),
  shippingValueUsd: z.coerce.number().min(0),
  platformFeePercent: z.coerce.number().min(0),
  usdToCopRate: z.coerce.number().min(0),
  customsTaxCop: z.coerce.number().min(0),
  items: z.array(purchaseLineSchema).min(1, 'Agrega al menos un producto'),
}).superRefine((value, context) => {
  if (value.purchaseType !== 'international') return;

  if ((value.usdToCopRate ?? 0) <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['usdToCopRate'],
      message: 'Ingresa la TRM/tasa de cambio usada en la compra.',
    });
  }

  if ((value.productsValueUsd ?? 0) + (value.shippingValueUsd ?? 0) <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['productsValueUsd'],
      message: 'Ingresa al menos un valor en USD para productos o envio.',
    });
  }
});

export type PurchaseFormValues = z.infer<typeof purchaseSchema>;
type PurchaseLineFormValue = PurchaseFormValues['items'][number];
type DraftPurchaseLine = {
  productId: string;
  variantId: string;
  presentationQuantity: string;
  purchaseUnitValue: string;
  purchaseUnitValueUsd: string;
  suggestedSalePrice: string;
};

const defaultLine: PurchaseFormValues['items'][number] = {
  productId: '',
  variantId: '',
  presentationQuantity: 1,
  purchaseUnitValue: 0,
  purchaseUnitValueUsd: 0,
  suggestedSalePrice: 0,
};

const defaultValues: PurchaseFormValues = {
  purchaseType: 'local',
  supplierId: '',
  supplier: '',
  purchasedAt: getTodayDateInputValue(),
  shippingValueTotal: 0,
  internationalVendorName: '',
  productsValueUsd: 0,
  shippingValueUsd: 0,
  platformFeePercent: 2.99,
  usdToCopRate: 0,
  customsTaxCop: 0,
  items: [defaultLine],
};

function createDefaultPurchaseLine(): DraftPurchaseLine {
  return {
    productId: '',
    variantId: '',
    presentationQuantity: '',
    purchaseUnitValue: '',
    purchaseUnitValueUsd: '',
    suggestedSalePrice: '',
  };
}

function createDraftPurchaseLineFromValue(line?: PurchaseLineFormValue): DraftPurchaseLine {
  if (!line) return createDefaultPurchaseLine();
  return {
    productId: line.productId ?? '',
    variantId: line.variantId ?? '',
    presentationQuantity: String(line.presentationQuantity ?? ''),
    purchaseUnitValue: String(line.purchaseUnitValue ?? ''),
    purchaseUnitValueUsd: String(line.purchaseUnitValueUsd ?? ''),
    suggestedSalePrice: String(line.suggestedSalePrice ?? ''),
  };
}

function isPackOf12Product(product?: Product) {
  if (!product) return false;
  return shouldNormalizePackPurchaseToBundle(product);
}

function isSamePurchaseLine(
  left: Pick<PurchaseLineFormValue, 'productId' | 'variantId'>,
  right: Pick<PurchaseLineFormValue, 'productId' | 'variantId'>
) {
  return left.productId === right.productId && (left.variantId || '') === (right.variantId || '');
}

function convertUsdToCop(usdValue: number, usdToCopRate: number) {
  return Number((usdValue * usdToCopRate).toFixed(2));
}

export function PurchaseFormDialog({
  open,
  onOpenChange,
  products,
  suppliers,
  initialValues,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  suppliers: Supplier[];
  initialValues?: PurchaseFormValues;
  onSubmit: (values: PurchaseFormValues) => Promise<void> | void;
}) {
  const purchaseFormId = useId();
  const lineFormId = useId();
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: initialValues ?? defaultValues,
  });
  const { fields, remove, replace } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const [pack12NormalizedByField, setPack12NormalizedByField] = useState<Record<string, boolean>>({});
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [draftLine, setDraftLine] = useState<DraftPurchaseLine>(createDefaultPurchaseLine());
  const [lockedDraftProductId, setLockedDraftProductId] = useState<string | null>(null);
  const [lineError, setLineError] = useState('');

  useEffect(() => {
    const nextValues = initialValues
      ? {
          ...defaultValues,
          ...initialValues,
          items: initialValues.items.length > 0 ? initialValues.items : [defaultLine],
        }
      : defaultValues;
    form.reset(nextValues);
    setPack12NormalizedByField({});
    setLineDialogOpen(false);
    setEditingLineIndex(null);
    setDraftLine(createDefaultPurchaseLine());
    setLockedDraftProductId(null);
    setLineError('');
  }, [form, initialValues, open]);

  const watchedSupplierId = useWatch({
    control: form.control,
    name: 'supplierId',
  });
  const watchedPurchaseType = useWatch({
    control: form.control,
    name: 'purchaseType',
  });
  const watchedShippingValueTotal = useWatch({
    control: form.control,
    name: 'shippingValueTotal',
  });
  const watchedInternationalVendorName = useWatch({
    control: form.control,
    name: 'internationalVendorName',
  });
  const watchedProductsValueUsd = useWatch({
    control: form.control,
    name: 'productsValueUsd',
  });
  const watchedShippingValueUsd = useWatch({
    control: form.control,
    name: 'shippingValueUsd',
  });
  const watchedPlatformFeePercent = useWatch({
    control: form.control,
    name: 'platformFeePercent',
  });
  const watchedUsdToCopRate = useWatch({
    control: form.control,
    name: 'usdToCopRate',
  });
  const watchedCustomsTaxCop = useWatch({
    control: form.control,
    name: 'customsTaxCop',
  });
  const watchedItems = useWatch({
    control: form.control,
    name: 'items',
  }) ?? defaultValues.items;
  const isSubmitting = form.formState.isSubmitting;
  const values = {
    purchaseType: watchedPurchaseType,
    supplierId: watchedSupplierId,
    shippingValueTotal: watchedShippingValueTotal,
    internationalVendorName: watchedInternationalVendorName,
    productsValueUsd: watchedProductsValueUsd,
    shippingValueUsd: watchedShippingValueUsd,
    platformFeePercent: watchedPlatformFeePercent,
    usdToCopRate: watchedUsdToCopRate,
    customsTaxCop: watchedCustomsTaxCop,
    items: watchedItems,
  };
  const selectedSupplier = suppliers.find((supplier) => supplier.id === values.supplierId);

  useEffect(() => {
    if (!selectedSupplier) return;
    form.setValue('supplier', selectedSupplier.name, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [form, selectedSupplier]);

  const lineProductsValueUsdTotal = values.items.reduce(
    (sum, item) => sum + ((Number(item.purchaseUnitValueUsd) || 0) * (Number(item.presentationQuantity) || 0)),
    0
  );
  const internationalSubtotalUsd = lineProductsValueUsdTotal + (Number(values.shippingValueUsd) || 0);
  const internationalPlatformFeeUsd =
    Number(((internationalSubtotalUsd * (Number(values.platformFeePercent) || 0)) / 100).toFixed(6));
  const internationalChargesUsd = (Number(values.shippingValueUsd) || 0) + internationalPlatformFeeUsd;
  const internationalChargesCop = Number(
    (internationalChargesUsd * (Number(values.usdToCopRate) || 0)).toFixed(2)
  );
  const internationalShippingTotalCop = Number(
    (internationalChargesCop + (Number(values.customsTaxCop) || 0)).toFixed(2)
  );

  useEffect(() => {
    if (values.purchaseType !== 'international') return;
    if ((Number(values.shippingValueTotal) || 0) === internationalShippingTotalCop) return;
    form.setValue('shippingValueTotal', internationalShippingTotalCop, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [form, internationalShippingTotalCop, values.purchaseType, values.shippingValueTotal]);

  useEffect(() => {
    if (values.purchaseType !== 'international') return;
    if ((Number(values.productsValueUsd) || 0) === lineProductsValueUsdTotal) return;
    form.setValue('productsValueUsd', Number(lineProductsValueUsdTotal.toFixed(6)), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [form, lineProductsValueUsdTotal, values.productsValueUsd, values.purchaseType]);

  useEffect(() => {
    if (values.purchaseType !== 'international') return;
    const normalizedRate = Number(values.usdToCopRate) || 0;
    const formItems = form.getValues('items');
    let hasChanges = false;
    const nextItems = formItems.map((item) => {
      const usdUnitValue = Number(item.purchaseUnitValueUsd) || 0;
      const convertedCopValue = convertUsdToCop(usdUnitValue, normalizedRate);
      if ((Number(item.purchaseUnitValue) || 0) === convertedCopValue) {
        return item;
      }
      hasChanges = true;
      return {
        ...item,
        purchaseUnitValue: convertedCopValue,
      };
    });
    if (hasChanges) {
      replace(nextItems);
    }
  }, [form, replace, values.purchaseType, values.usdToCopRate, values.items]);

  const totalPurchaseValue = values.items.reduce(
    (sum, item) => sum + ((Number(item.purchaseUnitValue) || 0) * (Number(item.presentationQuantity) || 0)),
    0
  );
  const totalPurchasedUnits = values.items.reduce(
    (sum, item) => sum + (Number(item.presentationQuantity) || 0),
    0
  );

  const previewItems = useMemo(
    () =>
      values.items.map((item, index) => {
        const quantityPurchased = Number(item.presentationQuantity) || 0;
        const purchaseValueTotal = (Number(item.purchaseUnitValue) || 0) * (Number(item.presentationQuantity) || 0);
        const shippingShareBase =
          totalPurchasedUnits > 0
            ? Number((((Number(values.shippingValueTotal) || 0) * quantityPurchased) / totalPurchasedUnits).toFixed(2))
            : Number((((Number(values.shippingValueTotal) || 0) / Math.max(values.items.length, 1))).toFixed(2));
        const previousShipping = values.items
          .slice(0, index)
          .reduce((sum, previousItem) => {
            const previousUnits = Number(previousItem.presentationQuantity) || 0;
            const previousBase =
              totalPurchasedUnits > 0
                ? Number((((Number(values.shippingValueTotal) || 0) * previousUnits) / totalPurchasedUnits).toFixed(2))
                : Number((((Number(values.shippingValueTotal) || 0) / Math.max(values.items.length, 1))).toFixed(2));
            return sum + previousBase;
          }, 0);
        const shippingShare =
          index === values.items.length - 1
            ? Number((((Number(values.shippingValueTotal) || 0) - previousShipping)).toFixed(2))
            : shippingShareBase;
        const totals = calculatePurchaseTotals(
          purchaseValueTotal,
          shippingShare,
          quantityPurchased
        );
        return {
          index,
          purchaseValueTotal,
          quantityPurchased,
          shippingShare,
          totals,
        };
      }),
    [totalPurchasedUnits, values.items, values.shippingValueTotal]
  );
  const shippingPerUnit = totalPurchasedUnits > 0 ? (Number(values.shippingValueTotal) || 0) / totalPurchasedUnits : 0;
  const firstItem = values.items[0] ?? createDefaultPurchaseLine();
  const firstItemProduct = products.find((product) => product.id === firstItem.productId);
  const firstItemVariantOptions = firstItemProduct?.variants ?? [];
  const firstPreview = previewItems[0] ?? null;
  const firstItemIsPack12 = isPackOf12Product(firstItemProduct);
  const draftProduct = products.find((product) => product.id === draftLine.productId);
  const draftVariantOptions = draftProduct?.variants ?? [];
  const isDraftPack12 = isPackOf12Product(draftProduct);
  const draftQuantity = Number(draftLine.presentationQuantity) || 0;
  const normalizedUsdToCopRate = Number(values.usdToCopRate) || 0;
  const draftPurchaseUnitValueCop =
    values.purchaseType === 'international'
      ? convertUsdToCop(Number(draftLine.purchaseUnitValueUsd) || 0, normalizedUsdToCopRate)
      : Number(draftLine.purchaseUnitValue) || 0;
  const draftPurchaseValueTotal = draftPurchaseUnitValueCop * draftQuantity;
  const getAvailableVariantOptions = (productId: string, excludeIndex?: number) => {
    const product = products.find((candidate) => candidate.id === productId);
    const productVariants = product?.variants ?? [];
    if (productVariants.length === 0) return [];

    const usedVariantIds = new Set(
      values.items
        .filter((item, index) => index !== excludeIndex && item.productId === productId && Boolean(item.variantId))
        .map((item) => item.variantId)
    );

    return productVariants.filter((variant) => !usedVariantIds.has(variant.id));
  };
  const getDuplicateLineIndex = (
    line: Pick<PurchaseLineFormValue, 'productId' | 'variantId'>,
    excludeIndex?: number | null
  ) =>
    values.items.findIndex((item, index) => index !== (excludeIndex ?? null) && isSamePurchaseLine(item, line));
  const getPurchaseVariantSuggestedSalePrice = (product?: Product, variantId?: string) => {
    if (!product) return 0;
    const selectedVariant = variantId ? product.variants?.find((variant) => variant.id === variantId) : undefined;
    if (selectedVariant && typeof selectedVariant.salePrice === 'number' && Number.isFinite(selectedVariant.salePrice)) {
      return Number(selectedVariant.salePrice);
    }
    return Number(product.salePrice ?? 0);
  };
  const firstAvailableSiblingVariants = firstItemProduct ? getAvailableVariantOptions(firstItemProduct.id) : [];
  const draftAvailableVariantOptions = draftProduct
    ? getAvailableVariantOptions(draftProduct.id, editingLineIndex ?? undefined)
    : [];
  const currentEditingItem = editingLineIndex !== null ? values.items[editingLineIndex] : null;
  const draftSelectableVariantOptions =
    draftProduct && currentEditingItem?.productId === draftProduct.id && currentEditingItem.variantId
      ? draftVariantOptions.filter(
          (variant) => variant.id === currentEditingItem.variantId || draftAvailableVariantOptions.some((item) => item.id === variant.id)
        )
      : draftAvailableVariantOptions;
  useEffect(() => {
    if (!firstItemProduct) return;

    const currentVariantId = values.items[0]?.variantId ?? '';
    const hasVariants = (firstItemProduct.variants?.length ?? 0) > 0;
    const resolvedVariantId =
      hasVariants && currentVariantId
        ? currentVariantId
        : getAvailableVariantOptions(firstItemProduct.id, 0)[0]?.id ?? '';
    const nextSuggestedSalePrice = getPurchaseVariantSuggestedSalePrice(firstItemProduct, resolvedVariantId);
    const currentSuggestedSalePrice = Number(values.items[0]?.suggestedSalePrice ?? 0);

    if (hasVariants && resolvedVariantId && currentVariantId !== resolvedVariantId) {
      form.setValue('items.0.variantId', resolvedVariantId, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }

    if (currentSuggestedSalePrice !== nextSuggestedSalePrice) {
      form.setValue('items.0.suggestedSalePrice', nextSuggestedSalePrice, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [firstItemProduct, form, values.items]);

  const buildDraftLineForProduct = (productId: string, excludeIndex?: number) => {
    const product = products.find((candidate) => candidate.id === productId);
    const firstAvailableVariant = product ? getAvailableVariantOptions(product.id, excludeIndex)[0] : undefined;
    return {
      productId,
      variantId: firstAvailableVariant?.id ?? '',
      presentationQuantity: '',
      purchaseUnitValue: '',
      purchaseUnitValueUsd: '',
      suggestedSalePrice: String(getPurchaseVariantSuggestedSalePrice(product, firstAvailableVariant?.id)),
    };
  };

  const isLockedVariantFlow = Boolean(lockedDraftProductId) && editingLineIndex === null;

  useEffect(() => {
    if (!draftProduct) return;

    const currentVariantId = draftLine.variantId;
    const hasVariants = (draftProduct.variants?.length ?? 0) > 0;
    const variantPool = draftSelectableVariantOptions.length > 0 ? draftSelectableVariantOptions : draftVariantOptions;
    const resolvedVariantId =
      hasVariants && currentVariantId
        ? currentVariantId
        : variantPool[0]?.id ?? '';
    const nextSuggestedSalePrice = getPurchaseVariantSuggestedSalePrice(draftProduct, resolvedVariantId);
    const currentSuggestedSalePrice = Number(draftLine.suggestedSalePrice ?? 0);

    if ((hasVariants && currentVariantId !== resolvedVariantId) || currentSuggestedSalePrice !== nextSuggestedSalePrice) {
      setDraftLine((current) => {
        const nextVariantId = hasVariants ? resolvedVariantId : '';
        const nextSuggestedPrice = String(nextSuggestedSalePrice || '');

        if (current.variantId === nextVariantId && current.suggestedSalePrice === nextSuggestedPrice) {
          return current;
        }

        return {
          ...current,
          variantId: nextVariantId,
          suggestedSalePrice: nextSuggestedPrice,
        };
      });
    }
  }, [draftLine.suggestedSalePrice, draftLine.variantId, draftProduct, draftSelectableVariantOptions, draftVariantOptions]);

  const openNewLineDialog = (
    preferredProductId?: string,
    lockProduct = false,
    priceSeed?: { purchaseUnitValue?: number; purchaseUnitValueUsd?: number; suggestedSalePrice?: number }
  ) => {
    if (isSubmitting) return;
    const preferredProduct = preferredProductId
      ? products.find((product) => product.id === preferredProductId)
      : undefined;
    setEditingLineIndex(null);
    setDraftLine(
      preferredProduct
        ? {
            ...buildDraftLineForProduct(preferredProduct.id),
            purchaseUnitValue:
              priceSeed?.purchaseUnitValue !== undefined ? String(priceSeed.purchaseUnitValue) : '',
            purchaseUnitValueUsd:
              priceSeed?.purchaseUnitValueUsd !== undefined ? String(priceSeed.purchaseUnitValueUsd) : '',
            suggestedSalePrice:
              priceSeed?.suggestedSalePrice !== undefined
                ? String(priceSeed.suggestedSalePrice)
                : buildDraftLineForProduct(preferredProduct.id).suggestedSalePrice,
          }
        : createDefaultPurchaseLine()
    );
    setLockedDraftProductId(lockProduct && preferredProduct ? preferredProduct.id : null);
    setLineError('');
    setLineDialogOpen(true);
  };

  const openEditLineDialog = (index: number) => {
    if (isSubmitting) return;
    setEditingLineIndex(index);
    setDraftLine(createDraftPurchaseLineFromValue(values.items[index]));
    setLockedDraftProductId(null);
    setLineError('');
    setLineDialogOpen(true);
  };

  const saveDraftLine = (continueWithSameProduct = false) => {
    if (!draftLine.productId) {
      setLineError('Selecciona un producto.');
      return;
    }
    if ((Number(draftLine.presentationQuantity) || 0) <= 0) {
      setLineError('La cantidad debe ser mayor a cero.');
      return;
    }
    const normalizedDraftPurchaseUnitValue =
      values.purchaseType === 'international'
        ? convertUsdToCop(Number(draftLine.purchaseUnitValueUsd) || 0, Number(values.usdToCopRate) || 0)
        : Number(draftLine.purchaseUnitValue) || 0;
    const normalizedDraftPurchaseUnitValueUsd = Number(draftLine.purchaseUnitValueUsd) || 0;
    if (normalizedDraftPurchaseUnitValue <= 0) {
      setLineError(
        values.purchaseType === 'international'
          ? 'Debes ingresar un valor unitario en USD mayor a cero.'
          : 'Debes ingresar un valor unitario de compra mayor a cero.'
      );
      return;
    }
    if ((Number(draftLine.suggestedSalePrice) || 0) <= 0) {
      setLineError('Debes ingresar un precio sugerido mayor a cero.');
      return;
    }

    const normalizedDraftLine = {
      productId: draftLine.productId,
      variantId: draftLine.variantId,
      presentationQuantity: Number(draftLine.presentationQuantity) || 0,
      purchaseUnitValue: normalizedDraftPurchaseUnitValue,
      purchaseUnitValueUsd: values.purchaseType === 'international' ? normalizedDraftPurchaseUnitValueUsd : 0,
      suggestedSalePrice: Number(draftLine.suggestedSalePrice) || 0,
    };
    const selectedProduct = products.find((product) => product.id === draftLine.productId);
    if ((selectedProduct?.variants?.length ?? 0) > 0 && !draftLine.variantId) {
      setLineError(`Selecciona ${selectedProduct?.variantLabel?.toLowerCase() || 'la variante'} del producto.`);
      return;
    }
    const duplicateLineIndex = getDuplicateLineIndex(normalizedDraftLine, editingLineIndex);
    if (duplicateLineIndex !== -1) {
      const selectedVariant = selectedProduct?.variants?.find((variant) => variant.id === normalizedDraftLine.variantId);
      setLineError(
        selectedVariant
          ? `La variante "${selectedVariant.name}" ya fue agregada en esta compra. Selecciona otra diferente.`
          : 'Ese producto ya fue agregado en esta compra. Edita la linea existente o selecciona otro.'
      );
      return;
    }

    const nextItems =
      editingLineIndex === null
        ? [...values.items, normalizedDraftLine]
        : values.items.map((item, index) => (index === editingLineIndex ? normalizedDraftLine : item));
    replace(nextItems);

    if (continueWithSameProduct && editingLineIndex === null) {
      const nextAvailableVariants = getAvailableVariantOptions(draftLine.productId).filter(
        (variant) => variant.id !== normalizedDraftLine.variantId
      );
        if (nextAvailableVariants.length > 0) {
          const nextSuggestedSalePrice = getPurchaseVariantSuggestedSalePrice(draftProduct, nextAvailableVariants[0]?.id);
          setDraftLine({
            productId: draftLine.productId,
            variantId: nextAvailableVariants[0]?.id ?? '',
            presentationQuantity: '',
            purchaseUnitValue: String(normalizedDraftLine.purchaseUnitValue),
            purchaseUnitValueUsd: String(normalizedDraftLine.purchaseUnitValueUsd ?? ''),
            suggestedSalePrice: String(nextSuggestedSalePrice || ''),
          });
          setLockedDraftProductId(draftLine.productId);
          setLineError('');
          return;
      }
    }

    setLineDialogOpen(false);
    setEditingLineIndex(null);
    setDraftLine(createDefaultPurchaseLine());
    setLockedDraftProductId(null);
    setLineError('');
  };

  const moveFocusToNextField = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLButtonElement && target.type === 'submit') return;

    event.preventDefault();

    const formElement = event.currentTarget;
    const focusableElements = Array.from(
      formElement.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), button:not([disabled]), [role="combobox"]:not([aria-disabled="true"])'
      )
    ).filter((element) => {
      if (element.getAttribute('type') === 'submit') return false;
      return element.offsetParent !== null;
    });

    const currentIndex = focusableElements.indexOf(target);
    if (currentIndex === -1) return;

    const nextElement = focusableElements[currentIndex + 1];
    nextElement?.focus();
  };

  const resetPack12Normalization = (fieldId: string) => {
    setPack12NormalizedByField((current) => ({
      ...current,
      [fieldId]: false,
    }));
  };

  const syncProductPurchaseValueInForm = (
    productId: string,
    valuesToSync: { purchaseUnitValue: number; purchaseUnitValueUsd?: number }
  ) => {
    const nextItems = form.getValues('items').map((item) =>
      item.productId === productId
        ? {
            ...item,
            purchaseUnitValue: valuesToSync.purchaseUnitValue,
            purchaseUnitValueUsd: valuesToSync.purchaseUnitValueUsd ?? item.purchaseUnitValueUsd,
          }
        : item
    );
    replace(nextItems);
  };

  const normalizePack12Line = (index: number, fieldId: string) => {
    if (pack12NormalizedByField[fieldId]) return;

    const item = form.getValues(`items.${index}`);
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!isPackOf12Product(product)) return;

    const quantityEntered = Number(item.presentationQuantity) || 0;
    const unitValueEntered =
      values.purchaseType === 'international'
        ? Number(item.purchaseUnitValueUsd) || 0
        : Number(item.purchaseUnitValue) || 0;

    if (quantityEntered < 12 || unitValueEntered <= 0) return;

    form.setValue(`items.${index}.presentationQuantity`, Number((quantityEntered / 12).toFixed(2)), {
      shouldValidate: true,
      shouldDirty: true,
    });
    const normalizedUnitValue = Number((unitValueEntered * 12).toFixed(2));
    if (values.purchaseType === 'international') {
      form.setValue(`items.${index}.purchaseUnitValueUsd`, normalizedUnitValue, {
        shouldValidate: true,
        shouldDirty: true,
      });
      form.setValue(
        `items.${index}.purchaseUnitValue`,
        convertUsdToCop(normalizedUnitValue, Number(values.usdToCopRate) || 0),
        {
          shouldValidate: true,
          shouldDirty: true,
        }
      );
    } else {
      form.setValue(`items.${index}.purchaseUnitValue`, normalizedUnitValue, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    setPack12NormalizedByField((current) => ({
      ...current,
      [fieldId]: true,
    }));
  };

  const firstLineCanSeedVariants =
    (values.purchaseType === 'international'
      ? (Number(firstItem.purchaseUnitValueUsd) || 0) > 0
      : (Number(firstItem.purchaseUnitValue) || 0) > 0) &&
    (Number(firstItem.suggestedSalePrice) || 0) > 0;

  return (
    <>
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title={initialValues ? 'Editar compra' : 'Registrar compra'}
      busy={isSubmitting}
      busyTitle={initialValues ? 'Actualizando compra...' : 'Registrando compra...'}
      busyDescription="Espera la confirmacion para evitar duplicados o cierres accidentales."
      description="Registra una compra con uno o varios productos del mismo proveedor."
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form={purchaseFormId} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : initialValues ? 'Guardar cambios' : 'Registrar compra'}
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={purchaseFormId}
            onSubmit={form.handleSubmit(async (submittedValues) => {
              const isInternationalPurchase = submittedValues.purchaseType === 'international';
              const normalizedRate = Number(submittedValues.usdToCopRate) || 0;
              const normalizedValues: PurchaseFormValues = isInternationalPurchase
                ? {
                    ...submittedValues,
                    shippingValueTotal: internationalShippingTotalCop,
                    items: submittedValues.items.map((item) => ({
                      ...item,
                      purchaseUnitValueUsd: Number(item.purchaseUnitValueUsd) || 0,
                      purchaseUnitValue: convertUsdToCop(Number(item.purchaseUnitValueUsd) || 0, normalizedRate),
                    })),
                  }
                : {
                    ...submittedValues,
                    internationalVendorName: '',
                    productsValueUsd: 0,
                    shippingValueUsd: 0,
                    platformFeePercent: 2.99,
                    usdToCopRate: 0,
                    customsTaxCop: 0,
                    items: submittedValues.items.map((item) => ({
                      ...item,
                      purchaseUnitValueUsd: 0,
                    })),
                  };
              await onSubmit(normalizedValues);
              form.reset(defaultValues);
            })}
            onKeyDown={moveFocusToNextField}
            className="space-y-3.5 sm:space-y-6"
          >
            <AdminMobileSection
              value="purchase-general"
              title="Datos generales de la compra"
              description="Selecciona o escribe el proveedor, define la fecha y luego registra el envio total del pedido."
              defaultOpen
              className="rounded-3xl border border-border bg-muted/60 p-3 dark:border-slate-800 dark:bg-slate-900/55 sm:p-6"
            >
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Proveedor registrado</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            value={field.value ?? ''}
                            onChange={(value) => {
                              field.onChange(value);
                              const selectedSupplier = suppliers.find((supplier) => supplier.id === value);
                              if (selectedSupplier) {
                                form.setValue('supplier', selectedSupplier.name, { shouldValidate: true });
                              }
                            }}
                            placeholder="Selecciona proveedor"
                            searchPlaceholder="Buscar proveedor..."
                            emptyLabel="No se encontraron proveedores."
                            options={suppliers
                              .filter((supplier) => supplier.status === 'active')
                              .map((supplier) => ({
                                value: supplier.id,
                                label: supplier.name,
                              }))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="purchasedAt"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel>Fecha de compra</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="purchaseType"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel>Tipo de compra</FormLabel>
                          <FormControl>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecciona tipo de compra" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="local">Nacional / Local</SelectItem>
                                <SelectItem value="international">Internacional (USD + tasa cambio)</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="rounded-2xl border border-amber-200/80 bg-amber-50/75 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/22 sm:p-5">
                    <FormField
                      control={form.control}
                      name="shippingValueTotal"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="text-amber-950 dark:text-amber-100">
                            Valor total de envio
                          </FormLabel>
                          <FormControl>
                            <Input
                              className="min-w-0 h-12 border-amber-300 bg-background/92 text-lg font-semibold dark:bg-slate-950/72"
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={values.purchaseType === 'international'}
                              {...field}
                            />
                          </FormControl>
                          {values.purchaseType === 'international' ? (
                            <p className="text-xs text-amber-800 dark:text-amber-200">
                              Este valor se calcula automaticamente desde USD, comision, tasa y DIAN.
                            </p>
                          ) : null}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {values.purchaseType === 'international' ? (
                  <div className="mt-4 space-y-4 rounded-2xl border border-cyan-200/80 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20 sm:p-5">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-cyan-950 dark:text-cyan-100">Liquidacion internacional de envio</p>
                      <p className="text-xs text-cyan-800 dark:text-cyan-200/90">
                        Funciona para Alibaba o cualquier proveedor del exterior.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="internationalVendorName"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Proveedor/plataforma exterior (opcional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ej: Alibaba, 1688, proveedor directo..."
                                {...field}
                                value={field.value ?? ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="usdToCopRate"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>TRM / tasa USD a COP</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="productsValueUsd"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Valor de productos (USD, auto)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} disabled />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Se calcula automaticamente con las lineas en USD.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="shippingValueUsd"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Envio internacional (USD)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="platformFeePercent"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Comision plataforma (%)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="customsTaxCop"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Impuestos DIAN/Aduana (COP)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="1" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-4">
                      <div className="rounded-xl border border-cyan-200/70 bg-white/85 p-3 dark:border-cyan-900/60 dark:bg-slate-950/60">
                        <p className="text-xs text-muted-foreground">Base compra USD</p>
                        <p className="mt-1 font-semibold text-foreground">{formatNumber(internationalSubtotalUsd)} USD</p>
                      </div>
                      <div className="rounded-xl border border-cyan-200/70 bg-white/85 p-3 dark:border-cyan-900/60 dark:bg-slate-950/60">
                        <p className="text-xs text-muted-foreground">Comision en USD</p>
                        <p className="mt-1 font-semibold text-foreground">{formatNumber(internationalPlatformFeeUsd)} USD</p>
                      </div>
                      <div className="rounded-xl border border-cyan-200/70 bg-white/85 p-3 dark:border-cyan-900/60 dark:bg-slate-950/60">
                        <p className="text-xs text-muted-foreground">Cargos convertidos (COP)</p>
                        <p className="mt-1 font-semibold text-foreground">{formatCurrency(internationalChargesCop)}</p>
                      </div>
                      <div className="rounded-xl border border-cyan-200/70 bg-cyan-100/70 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/40">
                        <p className="text-xs text-cyan-900 dark:text-cyan-200">Envio total aplicado (COP)</p>
                        <p className="mt-1 text-base font-semibold text-cyan-950 dark:text-cyan-100">
                          {formatCurrency(internationalShippingTotalCop)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
            </AdminMobileSection>

            <AdminMobileSection
              value="purchase-items"
              title="Productos de la compra"
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
                    {firstItemProduct ? (
                      <span className="rounded-full bg-cyan-50/85 px-3 py-1 text-xs font-medium text-cyan-800 dark:bg-cyan-950/25 dark:text-cyan-200">
                        Compra activa
                      </span>
                    ) : null}
                  </div>

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
                                resetPack12Normalization(fields[0]?.id ?? 'primary-line');
                                const product = products.find((item) => item.id === value);
                                const firstVariantId = product ? getAvailableVariantOptions(product.id, 0)[0]?.id ?? '' : '';
                                form.setValue('items.0.variantId', firstVariantId, {
                                  shouldValidate: true,
                                });
                                if (product) {
                                  form.setValue('items.0.suggestedSalePrice', getPurchaseVariantSuggestedSalePrice(product, firstVariantId), {
                                    shouldValidate: true,
                                  });
                                }
                              }}
                              placeholder="Selecciona producto"
                              searchPlaceholder="Buscar producto..."
                              emptyLabel="No se encontraron productos."
                              recentStorageKey="purchase-products"
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

                    {firstItemVariantOptions.length > 0 ? (
                      <FormField
                        control={form.control}
                        name="items.0.variantId"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>{firstItemProduct?.variantLabel || 'Variante'}</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                form.setValue(
                                  'items.0.suggestedSalePrice',
                                  getPurchaseVariantSuggestedSalePrice(firstItemProduct, value),
                                  {
                                    shouldValidate: true,
                                  }
                                );
                              }}
                            >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Selecciona una variante" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {firstItemVariantOptions.map((variant) => (
                                  <SelectItem key={variant.id} value={variant.id}>
                                    {variant.name} ({formatNumber(variant.stock)})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:items-end">
                      <FormField
                        control={form.control}
                        name="items.0.presentationQuantity"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>{firstItemIsPack12 ? 'Cantidad en unidades' : 'Cantidad comprada'}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                {...field}
                                onChange={(event) => {
                                  field.onChange(event);
                                  resetPack12Normalization(fields[0]?.id ?? 'primary-line');
                                }}
                                onBlur={(event) => {
                                  field.onBlur();
                                  normalizePack12Line(0, fields[0]?.id ?? 'primary-line');
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {values.purchaseType === 'international' ? (
                        <FormField
                          control={form.control}
                          name="items.0.purchaseUnitValueUsd"
                          render={({ field }) => (
                            <FormItem className="min-w-0">
                              <FormLabel>
                                {firstItemIsPack12 ? 'Valor unitario por pieza (USD)' : 'Valor unitario de compra (USD)'}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.000001"
                                  {...field}
                                  onChange={(event) => {
                                    field.onChange(event);
                                    resetPack12Normalization(fields[0]?.id ?? 'primary-line');
                                    if (firstItem.productId) {
                                      const unitValueUsd = Number(event.target.value) || 0;
                                      syncProductPurchaseValueInForm(firstItem.productId, {
                                        purchaseUnitValueUsd: unitValueUsd,
                                        purchaseUnitValue: convertUsdToCop(unitValueUsd, Number(values.usdToCopRate) || 0),
                                      });
                                    }
                                  }}
                                  onBlur={() => {
                                    field.onBlur();
                                    normalizePack12Line(0, fields[0]?.id ?? 'primary-line');
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <FormField
                          control={form.control}
                          name="items.0.purchaseUnitValue"
                          render={({ field }) => (
                            <FormItem className="min-w-0">
                              <FormLabel>{firstItemIsPack12 ? 'Valor unitario por pieza' : 'Valor unitario de compra'}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  {...field}
                                  onChange={(event) => {
                                    field.onChange(event);
                                    resetPack12Normalization(fields[0]?.id ?? 'primary-line');
                                    if (firstItem.productId) {
                                      syncProductPurchaseValueInForm(firstItem.productId, {
                                        purchaseUnitValue: Number(event.target.value) || 0,
                                      });
                                    }
                                  }}
                                  onBlur={() => {
                                    field.onBlur();
                                    normalizePack12Line(0, fields[0]?.id ?? 'primary-line');
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="items.0.suggestedSalePrice"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Precio sugerido de venta</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...field}
                                onChange={(event) => field.onChange(event)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                      <div className="rounded-2xl border border-border/70 bg-background/86 dark:border-slate-800 dark:bg-slate-950/60 p-2.5 sm:p-4">
                        <p className="text-xs text-muted-foreground">
                          {firstItemIsPack12 ? 'Cantidad convertida a paquetes' : 'Cantidad comprada'}
                        </p>
                        <p className="mt-1 font-semibold text-foreground">
                          {formatNumber(firstPreview?.quantityPurchased ?? 0)} articulos
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background/86 dark:border-slate-800 dark:bg-slate-950/60 p-2.5 sm:p-4">
                        <p className="text-xs text-muted-foreground">Valor total compra</p>
                        <p className="mt-1 font-semibold text-foreground">
                          {formatCurrency(firstPreview?.purchaseValueTotal ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background/86 dark:border-slate-800 dark:bg-slate-950/60 p-2.5 sm:p-4">
                        <p className="text-xs text-muted-foreground">Envio asignado</p>
                        <p className="mt-1 font-semibold text-foreground">
                          {formatCurrency(firstPreview?.shippingShare ?? 0)}
                        </p>
                      </div>
                    </div>

                    {firstItemProduct ? (
                      <div className="mt-4 space-y-2 rounded-2xl bg-background/86 px-3 py-2.5 text-sm text-slate-600 dark:bg-slate-950/60 dark:text-slate-300 sm:space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate">{firstItemProduct.name} - {firstItemProduct.brand || 'Sin marca'}</span>
                          <span className="font-medium text-foreground">Total linea: {formatCurrency(firstPreview?.purchaseValueTotal ?? 0)}</span>
                        </div>
                        {firstItemVariantOptions.length > 0 ? (
                          <div className="flex flex-col gap-2 border-t border-border pt-3 dark:border-slate-800 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                            <p className="text-xs text-muted-foreground">
                              {firstAvailableSiblingVariants.length > 0
                                ? `Quedan ${formatNumber(firstAvailableSiblingVariants.length)} variantes disponibles para este producto.`
                                : 'Todas las variantes de este producto ya fueron agregadas.'}
                            </p>
                            {firstAvailableSiblingVariants.length > 0 ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full rounded-xl bg-card/88 sm:w-auto"
                                disabled={!firstLineCanSeedVariants || isSubmitting}
                                onClick={() =>
                                  openNewLineDialog(firstItemProduct.id, true, {
                                    purchaseUnitValue: Number(firstItem.purchaseUnitValue) || 0,
                                    purchaseUnitValueUsd: Number(firstItem.purchaseUnitValueUsd) || 0,
                                  })
                                }
                              >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Agregar otra variante
                              </Button>
                            ) : null}
                            {!firstLineCanSeedVariants ? (
                              <p className="w-full text-xs text-amber-700">
                                Define primero el valor unitario y el precio sugerido para habilitar las otras variantes.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {fields.length > 1 ? (
                <div className="space-y-3">
                  {fields.map((field, index) => {
                    const preview = previewItems[index];
                    const selectedProduct = products.find((item) => item.id === values.items[index]?.productId);
                    const selectedVariant = selectedProduct?.variants?.find(
                      (variant) => variant.id === values.items[index]?.variantId
                    );
                    const isPack12 = isPackOf12Product(selectedProduct);
                    const availableSiblingVariants = selectedProduct ? getAvailableVariantOptions(selectedProduct.id, index) : [];
                    const canSeedSiblingVariants =
                      (values.purchaseType === 'international'
                        ? (Number(values.items[index]?.purchaseUnitValueUsd) || 0) > 0
                        : (Number(values.items[index]?.purchaseUnitValue) || 0) > 0) &&
                      (Number(values.items[index]?.suggestedSalePrice) || 0) > 0;
                    return (
                      <div key={field.id} className="rounded-2xl border border-border bg-card/88 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/72 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {selectedProduct?.name ?? 'Producto'} x {formatNumber(preview?.quantityPurchased ?? 0)}
                            </p>
                            {selectedVariant ? (
                              <p className="text-sm text-cyan-700">{selectedVariant.name}</p>
                            ) : null}
                            <p className="text-sm text-slate-500">
                              Valor unitario: {formatCurrency(values.items[index]?.purchaseUnitValue ?? 0)}
                              {values.purchaseType === 'international'
                                ? ` (${formatNumber(values.items[index]?.purchaseUnitValueUsd ?? 0)} USD)`
                                : ''}
                            </p>
                            <p className="text-sm text-slate-500">
                              Precio sugerido: {formatCurrency(values.items[index]?.suggestedSalePrice ?? 0)}
                            </p>
                            <p className="text-sm text-slate-500">
                              Total linea: {formatCurrency(preview?.purchaseValueTotal ?? 0)}
                            </p>
                            <p className="text-sm text-slate-400">
                              {isPack12 ? 'Conversion por paquete aplicada' : 'Sin conversion automatica'}
                            </p>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
                            {selectedProduct && availableSiblingVariants.length > 0 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="w-full rounded-xl sm:w-auto"
                                disabled={!canSeedSiblingVariants || isSubmitting}
                                onClick={() =>
                                  openNewLineDialog(selectedProduct.id, true, {
                                    purchaseUnitValue: Number(values.items[index]?.purchaseUnitValue) || 0,
                                    purchaseUnitValueUsd: Number(values.items[index]?.purchaseUnitValueUsd) || 0,
                                  })
                                }
                              >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Otra variante
                              </Button>
                            ) : null}
                            <Button type="button" variant="ghost" size="sm" className="w-full rounded-xl sm:w-auto" onClick={() => openEditLineDialog(index)} disabled={isSubmitting}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="w-full rounded-xl sm:w-auto" onClick={() => remove(index)} disabled={isSubmitting}>
                              <MinusCircle className="mr-2 h-4 w-4" />
                              Quitar
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-card/88 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                  Si la compra tiene mas de un producto, usa `Agregar producto` para sumarlo a la lista.
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
                  className="w-full rounded-xl bg-card/88 sm:hidden"
                  onClick={() => openNewLineDialog()}
                  disabled={isSubmitting}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Agregar producto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl bg-card/88 max-sm:hidden"
                  onClick={() => openNewLineDialog()}
                  disabled={isSubmitting}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Agregar producto
                </Button>

                <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/75 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/22 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">Total acumulado de la compra</p>
                    <p className="text-xs text-emerald-800 dark:text-emerald-200/80">
                      {formatNumber(totalPurchasedUnits)} unidades en {formatNumber(fields.length)} lineas
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">{formatCurrency(totalPurchaseValue)}</p>
                </div>
              </div>
            </AdminMobileSection>
          </form>
        </Form>
    </AdminResponsiveDialog>

    <AdminResponsiveDialog
      open={lineDialogOpen}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        setLineDialogOpen(nextOpen);
      }}
      title={editingLineIndex === null ? 'Agregar producto a la compra' : 'Editar producto de la compra'}
      description={
        isLockedVariantFlow
          ? 'Agrega otra variante del mismo producto usando los mismos valores de compra.'
          : `Selecciona el producto y define cantidad, valor de compra ${values.purchaseType === 'international' ? 'en USD' : 'en COP'} y precio sugerido.`
      }
      desktopContentClassName="max-w-xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLineDialogOpen(false);
              setLockedDraftProductId(null);
            }}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          {editingLineIndex === null && lockedDraftProductId && draftSelectableVariantOptions.length > 1 ? (
            <Button type="button" variant="outline" onClick={() => saveDraftLine(true)} disabled={isSubmitting}>
              Agregar y seguir
            </Button>
          ) : null}
          <Button form={lineFormId} type="submit" disabled={isSubmitting}>
            {editingLineIndex === null ? 'Agregar producto' : 'Guardar cambios'}
          </Button>
        </div>
      }
    >
        <form
          id={lineFormId}
          onSubmit={(event) => {
            event.preventDefault();
            saveDraftLine(false);
          }}
          className="space-y-4"
        >
          {isLockedVariantFlow && draftProduct ? (
            <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/80 px-4 py-3 dark:border-cyan-900/60 dark:bg-cyan-950/22">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-800 dark:text-cyan-200">Producto fijo</p>
              <p className="mt-1 text-sm font-semibold text-cyan-950 dark:text-cyan-100">
                {draftProduct.name} {draftProduct.brand ? `- ${draftProduct.brand}` : ''}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Producto</Label>
              <SearchableSelect
                value={draftLine.productId}
                onChange={(value) => {
                  const product = products.find((item) => item.id === value);
                  const nextDraftLine = product
                    ? buildDraftLineForProduct(product.id, editingLineIndex ?? undefined)
                    : createDefaultPurchaseLine();
                  setDraftLine(nextDraftLine);
                  setLineError('');
                }}
                placeholder="Selecciona producto"
                searchPlaceholder="Buscar producto..."
                emptyLabel="No se encontraron productos."
                recentStorageKey="purchase-products"
                disabled={Boolean(lockedDraftProductId)}
                options={products.map((product) => ({
                  value: product.id,
                  label: `${product.name} - ${product.brand}`,
                }))}
              />
            </div>
          )}

          {draftVariantOptions.length > 0 ? (
            <div className="space-y-2">
              <Label>{draftProduct?.variantLabel || 'Variante'}</Label>
              <Select
                value={draftLine.variantId}
                onValueChange={(value) => {
                  setDraftLine((current) => ({
                    ...current,
                    variantId: value,
                    suggestedSalePrice: String(getPurchaseVariantSuggestedSalePrice(draftProduct, value)),
                  }));
                  setLineError('');
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una variante" />
                </SelectTrigger>
                <SelectContent>
                  {draftSelectableVariantOptions.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {variant.name} ({formatNumber(variant.stock)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {draftSelectableVariantOptions.length > 0
                  ? 'Solo se muestran variantes que aun no han sido agregadas a esta compra.'
                  : 'Todas las variantes de este producto ya fueron agregadas a la compra.'}
              </p>
            </div>
          ) : null}

          <div className={isLockedVariantFlow ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
            <div className="space-y-2">
              <Label>{isDraftPack12 ? 'Cantidad en unidades' : 'Cantidad comprada'}</Label>
              <Input
                type="number"
                min="1"
                value={draftLine.presentationQuantity}
                onChange={(event) => {
                  setDraftLine((current) => ({
                    ...current,
                    presentationQuantity: event.target.value,
                  }));
                  setLineError('');
                }}
                onBlur={() => {
                  const product = products.find((item) => item.id === draftLine.productId);
                  if (!isPackOf12Product(product)) return;
                  const quantityEntered = Number(draftLine.presentationQuantity) || 0;
                  const unitValueEntered =
                    values.purchaseType === 'international'
                      ? Number(draftLine.purchaseUnitValueUsd) || 0
                      : Number(draftLine.purchaseUnitValue) || 0;
                  if (quantityEntered < 12 || unitValueEntered <= 0) return;
                  setDraftLine((current) => ({
                    ...current,
                    presentationQuantity: String(Number((quantityEntered / 12).toFixed(2))),
                    purchaseUnitValue:
                      values.purchaseType === 'international'
                        ? String(convertUsdToCop(Number((unitValueEntered * 12).toFixed(2)), Number(values.usdToCopRate) || 0))
                        : String(Number((unitValueEntered * 12).toFixed(2))),
                    purchaseUnitValueUsd:
                      values.purchaseType === 'international'
                        ? String(Number((unitValueEntered * 12).toFixed(2)))
                        : current.purchaseUnitValueUsd,
                  }));
                }}
              />
            </div>

            {!isLockedVariantFlow ? (
              <div className="min-w-0 space-y-2">
                <Label>
                  {isDraftPack12
                    ? values.purchaseType === 'international'
                      ? 'Valor unitario por pieza (USD)'
                      : 'Valor unitario por pieza'
                    : values.purchaseType === 'international'
                      ? 'Valor unitario de compra (USD)'
                      : 'Valor unitario de compra'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step={values.purchaseType === 'international' ? '0.000001' : '0.01'}
                  value={values.purchaseType === 'international' ? draftLine.purchaseUnitValueUsd : draftLine.purchaseUnitValue}
                  onChange={(event) => {
                    setDraftLine((current) => ({
                      ...current,
                      purchaseUnitValue:
                        values.purchaseType === 'international'
                          ? String(convertUsdToCop(Number(event.target.value) || 0, Number(values.usdToCopRate) || 0))
                          : event.target.value,
                      purchaseUnitValueUsd:
                        values.purchaseType === 'international' ? event.target.value : current.purchaseUnitValueUsd,
                    }));
                    setLineError('');
                  }}
                  onBlur={() => {
                    const product = products.find((item) => item.id === draftLine.productId);
                    if (!isPackOf12Product(product)) return;
                    const quantityEntered = Number(draftLine.presentationQuantity) || 0;
                    const unitValueEntered =
                      values.purchaseType === 'international'
                        ? Number(draftLine.purchaseUnitValueUsd) || 0
                        : Number(draftLine.purchaseUnitValue) || 0;
                    if (quantityEntered < 12 || unitValueEntered <= 0) return;
                    const normalizedUnitValue = Number((unitValueEntered * 12).toFixed(2));
                    setDraftLine((current) => ({
                      ...current,
                      presentationQuantity: String(Number((quantityEntered / 12).toFixed(2))),
                      purchaseUnitValue:
                        values.purchaseType === 'international'
                          ? String(convertUsdToCop(normalizedUnitValue, Number(values.usdToCopRate) || 0))
                          : String(normalizedUnitValue),
                      purchaseUnitValueUsd:
                        values.purchaseType === 'international'
                          ? String(normalizedUnitValue)
                          : current.purchaseUnitValueUsd,
                    }));
                  }}
                />
                {values.purchaseType === 'international' ? (
                  <p className="text-xs text-muted-foreground">
                    Convertido a COP: {formatCurrency(draftPurchaseUnitValueCop)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {!isLockedVariantFlow ? (
            <div className="min-w-0 space-y-2">
              <Label>Precio sugerido de venta</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draftLine.suggestedSalePrice}
                onChange={(event) => {
                  setDraftLine((current) => ({
                    ...current,
                    suggestedSalePrice: event.target.value,
                  }));
                  setLineError('');
                }}
              />
            </div>
          ) : null}

          <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-2xl border border-border/70 bg-background/86 p-3 dark:border-slate-800 dark:bg-slate-950/60 sm:p-4">
              <p className="text-xs text-muted-foreground">{isDraftPack12 ? 'Cantidad convertida' : 'Cantidad comprada'}</p>
              <p className="mt-1 font-semibold text-foreground">{formatNumber(draftQuantity)} articulos</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/86 p-3 dark:border-slate-800 dark:bg-slate-950/60 sm:p-4">
              <p className="text-xs text-muted-foreground">Valor total compra</p>
              <p className="mt-1 font-semibold text-foreground">{formatCurrency(draftPurchaseValueTotal)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/86 p-3 dark:border-slate-800 dark:bg-slate-950/60 sm:p-4">
              <p className="text-xs text-muted-foreground">Envio estimado</p>
              <p className="mt-1 font-semibold text-foreground">
                {formatCurrency((Number(values.shippingValueTotal) || 0) * (draftQuantity > 0 && totalPurchasedUnits > 0 ? draftQuantity / (editingLineIndex === null ? totalPurchasedUnits + draftQuantity : Math.max(totalPurchasedUnits - (Number(values.items[editingLineIndex]?.presentationQuantity) || 0) + draftQuantity, draftQuantity)) : 0))}
              </p>
            </div>
          </div>

          {lineError ? (
            <p className="rounded-xl border border-red-200/80 bg-red-50/80 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">
              {lineError}
            </p>
          ) : null}
          {isLockedVariantFlow ? (
            <p className="rounded-xl border border-cyan-200/80 bg-cyan-50/80 px-3 py-2 text-sm text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/22 dark:text-cyan-200">
              Esta variante usa automaticamente el mismo valor unitario y el mismo precio sugerido del producto base.
            </p>
          ) : null}
        </form>
    </AdminResponsiveDialog>
    </>
  );
}
