'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown, MinusCircle, Pencil, PlusCircle } from 'lucide-react';
import {
  calculatePurchaseTotals,
  formatCurrency,
  formatNumber,
} from '@/lib/admin/calculations';
import type { Product, Supplier } from '@/lib/admin/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const purchaseLineSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  variantId: z.string().default(''),
  presentationQuantity: z.coerce.number().positive('Cantidad invalida'),
  purchaseUnitValue: z.coerce.number().min(0),
  suggestedSalePrice: z.coerce.number().min(0),
});

const purchaseSchema = z.object({
  supplierId: z.string().optional(),
  supplier: z.string().min(2, 'Ingresa el proveedor'),
  purchasedAt: z.string().min(1, 'Selecciona la fecha'),
  shippingValueTotal: z.coerce.number().min(0),
  items: z.array(purchaseLineSchema).min(1, 'Agrega al menos un producto'),
});

export type PurchaseFormValues = z.infer<typeof purchaseSchema>;
type PurchaseLineFormValue = PurchaseFormValues['items'][number];
type DraftPurchaseLine = {
  productId: string;
  variantId: string;
  presentationQuantity: string;
  purchaseUnitValue: string;
  suggestedSalePrice: string;
};

const defaultLine: PurchaseFormValues['items'][number] = {
  productId: '',
  variantId: '',
  presentationQuantity: 1,
  purchaseUnitValue: 0,
  suggestedSalePrice: 0,
};

const defaultValues: PurchaseFormValues = {
  supplierId: '',
  supplier: '',
  purchasedAt: new Date().toISOString().slice(0, 10),
  shippingValueTotal: 0,
  items: [defaultLine],
};

function createDefaultPurchaseLine(): DraftPurchaseLine {
  return {
    productId: '',
    variantId: '',
    presentationQuantity: '',
    purchaseUnitValue: '',
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
    suggestedSalePrice: String(line.suggestedSalePrice ?? ''),
  };
}

function isRoyalPremiumChalk(product?: Product) {
  if (!product) return false;
  return product.category === 'tizas' && /royal\s*premium/i.test(`${product.name} ${product.brand}`);
}

function isZ1Chalk(product?: Product) {
  if (!product) return false;
  return product.category === 'tizas' && /\bz1\b/i.test(`${product.name} ${product.brand}`);
}

function isPackOf12Product(product?: Product) {
  if (!product) return false;
  if (isRoyalPremiumChalk(product) || isZ1Chalk(product)) return false;
  return /x\s*12/i.test(product.subcategory) || /x\s*12/i.test(product.name);
}

function isSamePurchaseLine(
  left: Pick<PurchaseLineFormValue, 'productId' | 'variantId'>,
  right: Pick<PurchaseLineFormValue, 'productId' | 'variantId'>
) {
  return left.productId === right.productId && (left.variantId || '') === (right.variantId || '');
}

function SearchableSelect({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const handleWheel = (deltaY: number) => {
    const element = listRef.current;
    if (!element) return;
    element.scrollTop += deltaY;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full min-w-0 justify-between overflow-hidden px-3 font-normal"
        >
          <span className="truncate text-left">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
        align="start"
        onWheelCapture={(event) => {
          handleWheel(event.deltaY);
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList
            ref={listRef}
            onWheel={(event) => {
              handleWheel(event.deltaY);
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
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
  const watchedShippingValueTotal = useWatch({
    control: form.control,
    name: 'shippingValueTotal',
  });
  const watchedItems = useWatch({
    control: form.control,
    name: 'items',
  }) ?? defaultValues.items;
  const values = {
    supplierId: watchedSupplierId,
    shippingValueTotal: watchedShippingValueTotal,
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
  const draftPurchaseValueTotal = (Number(draftLine.purchaseUnitValue) || 0) * draftQuantity;
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
  const buildDraftLineForProduct = (productId: string, excludeIndex?: number) => {
    const product = products.find((candidate) => candidate.id === productId);
    const firstAvailableVariant = product ? getAvailableVariantOptions(product.id, excludeIndex)[0] : undefined;
    return {
      productId,
      variantId: firstAvailableVariant?.id ?? '',
      presentationQuantity: '',
      purchaseUnitValue: '',
      suggestedSalePrice: String(firstAvailableVariant?.salePrice ?? product?.salePrice ?? ''),
    };
  };

  const isLockedVariantFlow = Boolean(lockedDraftProductId) && editingLineIndex === null;

  const openNewLineDialog = (
    preferredProductId?: string,
    lockProduct = false,
    priceSeed?: { purchaseUnitValue?: number; suggestedSalePrice?: number }
  ) => {
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
    if ((Number(draftLine.purchaseUnitValue) || 0) <= 0) {
      setLineError('Debes ingresar un valor unitario de compra mayor a cero.');
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
      purchaseUnitValue: Number(draftLine.purchaseUnitValue) || 0,
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
    replace(
      nextItems.map((item) =>
        item.productId === normalizedDraftLine.productId
          ? {
              ...item,
              purchaseUnitValue: normalizedDraftLine.purchaseUnitValue,
              suggestedSalePrice: normalizedDraftLine.suggestedSalePrice,
            }
          : item
      )
    );

    if (continueWithSameProduct && editingLineIndex === null) {
      const nextAvailableVariants = getAvailableVariantOptions(draftLine.productId).filter(
        (variant) => variant.id !== normalizedDraftLine.variantId
      );
        if (nextAvailableVariants.length > 0) {
          setDraftLine({
            productId: draftLine.productId,
            variantId: nextAvailableVariants[0]?.id ?? '',
            presentationQuantity: '',
            purchaseUnitValue: String(normalizedDraftLine.purchaseUnitValue),
            suggestedSalePrice: String(normalizedDraftLine.suggestedSalePrice),
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

  const syncProductPricesInForm = (productId: string, purchaseUnitValue: number, suggestedSalePrice: number) => {
    const nextItems = form.getValues('items').map((item) =>
      item.productId === productId
        ? {
            ...item,
            purchaseUnitValue,
            suggestedSalePrice,
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
    const unitValueEntered = Number(item.purchaseUnitValue) || 0;

    if (quantityEntered < 12 || unitValueEntered <= 0) return;

    form.setValue(`items.${index}.presentationQuantity`, Number((quantityEntered / 12).toFixed(2)), {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue(`items.${index}.purchaseUnitValue`, Number((unitValueEntered * 12).toFixed(2)), {
      shouldValidate: true,
      shouldDirty: true,
    });
    setPack12NormalizedByField((current) => ({
      ...current,
      [fieldId]: true,
    }));
  };

  const firstLineCanSeedVariants =
    (Number(firstItem.purchaseUnitValue) || 0) > 0 && (Number(firstItem.suggestedSalePrice) || 0) > 0;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[96vw] overflow-y-auto px-4 sm:w-[calc(100vw-2rem)] sm:px-5 lg:max-w-4xl lg:px-6">
        <DialogHeader>
          <DialogTitle>{initialValues ? 'Editar compra' : 'Registrar compra'}</DialogTitle>
          <DialogDescription>
            Registra una compra con uno o varios productos del mismo proveedor.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (submittedValues) => {
              await onSubmit(submittedValues);
              form.reset(defaultValues);
            })}
            onKeyDown={moveFocusToNextField}
            className="space-y-6"
          >
            <section className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6">
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-900">Datos generales de la compra</p>
                  <p className="text-sm text-slate-500">Selecciona o escribe el proveedor, define la fecha y luego registra el envio total del pedido.</p>
                </div>

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
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
                    <FormField
                      control={form.control}
                      name="shippingValueTotal"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel className="text-amber-950">Valor total de envio</FormLabel>
                          <FormControl>
                            <Input
                              className="min-w-0 h-12 border-amber-300 bg-white text-lg font-semibold"
                              type="number"
                              min="0"
                              step="0.01"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
            </section>

            <section className="min-w-0 space-y-5 rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 lg:p-6">
              <div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">Productos de la compra</p>
                </div>
              </div>

              {fields.length <= 1 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-700">
                        #1
                      </span>
                      <p className="text-sm font-medium text-slate-900">Producto principal</p>
                    </div>
                    {firstItemProduct ? (
                      <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">
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
                                form.setValue('items.0.variantId', '', {
                                  shouldValidate: true,
                                });
                                if (product) {
                                  form.setValue('items.0.suggestedSalePrice', product.salePrice, {
                                    shouldValidate: true,
                                  });
                                }
                              }}
                              placeholder="Selecciona producto"
                              searchPlaceholder="Buscar producto..."
                              emptyLabel="No se encontraron productos."
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
                                const variant = firstItemVariantOptions.find((item) => item.id === value);
                                if (variant?.salePrice !== undefined) {
                                  form.setValue('items.0.suggestedSalePrice', Number(variant.salePrice), {
                                    shouldValidate: true,
                                  });
                                }
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

                    <div className="grid gap-4 sm:grid-cols-[minmax(124px,0.72fr)_minmax(160px,0.92fr)] lg:grid-cols-3 sm:items-end">
                      <FormField
                        control={form.control}
                        name="items.0.presentationQuantity"
                        render={({ field }) => (
                          <FormItem>
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

                      <FormField
                        control={form.control}
                        name="items.0.purchaseUnitValue"
                        render={({ field }) => (
                          <FormItem>
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
                                    syncProductPricesInForm(
                                      firstItem.productId,
                                      Number(event.target.value) || 0,
                                      Number(form.getValues('items.0.suggestedSalePrice')) || 0
                                    );
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

                      <FormField
                        control={form.control}
                        name="items.0.suggestedSalePrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Precio sugerido de venta</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...field}
                                onChange={(event) => {
                                  field.onChange(event);
                                  if (firstItem.productId) {
                                    syncProductPricesInForm(
                                      firstItem.productId,
                                      Number(form.getValues('items.0.purchaseUnitValue')) || 0,
                                      Number(event.target.value) || 0
                                    );
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-500">
                          {firstItemIsPack12 ? 'Cantidad convertida a paquetes' : 'Cantidad comprada'}
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatNumber(firstPreview?.quantityPurchased ?? 0)} articulos
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-500">Valor total compra</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(firstPreview?.purchaseValueTotal ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs text-slate-500">Envio asignado</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(firstPreview?.shippingShare ?? 0)}
                        </p>
                      </div>
                    </div>

                    {firstItemProduct ? (
                      <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate">{firstItemProduct.name} - {firstItemProduct.brand || 'Sin marca'}</span>
                          <span className="font-medium text-slate-900">Total linea: {formatCurrency(firstPreview?.purchaseValueTotal ?? 0)}</span>
                        </div>
                        {firstItemVariantOptions.length > 0 ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                            <p className="text-xs text-slate-500">
                              {firstAvailableSiblingVariants.length > 0
                                ? `Quedan ${formatNumber(firstAvailableSiblingVariants.length)} variantes disponibles para este producto.`
                                : 'Todas las variantes de este producto ya fueron agregadas.'}
                            </p>
                            {firstAvailableSiblingVariants.length > 0 ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl bg-white"
                                disabled={!firstLineCanSeedVariants}
                                onClick={() =>
                                  openNewLineDialog(firstItemProduct.id, true, {
                                    purchaseUnitValue: Number(firstItem.purchaseUnitValue) || 0,
                                    suggestedSalePrice: Number(firstItem.suggestedSalePrice) || 0,
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
                      (Number(values.items[index]?.purchaseUnitValue) || 0) > 0 &&
                      (Number(values.items[index]?.suggestedSalePrice) || 0) > 0;
                    return (
                      <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium text-slate-900">
                              {selectedProduct?.name ?? 'Producto'} x {formatNumber(preview?.quantityPurchased ?? 0)}
                            </p>
                            {selectedVariant ? (
                              <p className="text-sm text-cyan-700">{selectedVariant.name}</p>
                            ) : null}
                            <p className="text-sm text-slate-500">
                              Valor unitario: {formatCurrency(values.items[index]?.purchaseUnitValue ?? 0)}
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

                          <div className="flex gap-2 sm:shrink-0">
                            {selectedProduct && availableSiblingVariants.length > 0 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="rounded-xl"
                                disabled={!canSeedSiblingVariants}
                                onClick={() =>
                                  openNewLineDialog(selectedProduct.id, true, {
                                    purchaseUnitValue: Number(values.items[index]?.purchaseUnitValue) || 0,
                                    suggestedSalePrice: Number(values.items[index]?.suggestedSalePrice) || 0,
                                  })
                                }
                              >
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Otra variante
                              </Button>
                            ) : null}
                            <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => openEditLineDialog(index)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => remove(index)}>
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
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
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
                  className="w-full rounded-xl bg-white"
                  onClick={() => openNewLineDialog()}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Agregar producto
                </Button>

                <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-950">Total acumulado de la compra</p>
                    <p className="text-xs text-emerald-800">
                      {formatNumber(totalPurchasedUnits)} unidades en {formatNumber(fields.length)} lineas
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-emerald-950">{formatCurrency(totalPurchaseValue)}</p>
                </div>
              </div>
            </section>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">{initialValues ? 'Guardar cambios' : 'Registrar compra'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-xl px-4 sm:w-[calc(100vw-2rem)] sm:px-5">
          <DialogHeader>
            <DialogTitle>{editingLineIndex === null ? 'Agregar producto a la compra' : 'Editar producto de la compra'}</DialogTitle>
            <DialogDescription>
              {isLockedVariantFlow
                ? 'Agrega otra variante del mismo producto usando los mismos valores de compra.'
                : 'Selecciona el producto y define cantidad, valor de compra y precio sugerido.'}
            </DialogDescription>
          </DialogHeader>

        <div className="space-y-4">
          {isLockedVariantFlow && draftProduct ? (
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-800">Producto fijo</p>
              <p className="mt-1 text-sm font-semibold text-cyan-950">
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
                  const variant = draftVariantOptions.find((item) => item.id === value);
                  setDraftLine((current) => ({
                    ...current,
                    variantId: value,
                    suggestedSalePrice:
                      variant?.salePrice !== undefined ? String(variant.salePrice) : current.suggestedSalePrice,
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
              <p className="text-xs text-slate-500">
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
                  const unitValueEntered = Number(draftLine.purchaseUnitValue) || 0;
                  if (quantityEntered < 12 || unitValueEntered <= 0) return;
                  setDraftLine((current) => ({
                    ...current,
                    presentationQuantity: String(Number((quantityEntered / 12).toFixed(2))),
                    purchaseUnitValue: String(Number((unitValueEntered * 12).toFixed(2))),
                  }));
                }}
              />
            </div>

            {!isLockedVariantFlow ? (
              <div className="space-y-2">
                <Label>{isDraftPack12 ? 'Valor unitario por pieza' : 'Valor unitario de compra'}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draftLine.purchaseUnitValue}
                    onChange={(event) => {
                      setDraftLine((current) => ({
                        ...current,
                        purchaseUnitValue: event.target.value,
                      }));
                      setLineError('');
                    }}
                    onBlur={() => {
                      const product = products.find((item) => item.id === draftLine.productId);
                      if (!isPackOf12Product(product)) return;
                      const quantityEntered = Number(draftLine.presentationQuantity) || 0;
                      const unitValueEntered = Number(draftLine.purchaseUnitValue) || 0;
                      if (quantityEntered < 12 || unitValueEntered <= 0) return;
                      setDraftLine((current) => ({
                        ...current,
                        presentationQuantity: String(Number((quantityEntered / 12).toFixed(2))),
                        purchaseUnitValue: String(Number((unitValueEntered * 12).toFixed(2))),
                      }));
                    }}
                  />
              </div>
            ) : null}
          </div>

          {!isLockedVariantFlow ? (
            <div className="space-y-2">
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

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">{isDraftPack12 ? 'Cantidad convertida' : 'Cantidad comprada'}</p>
              <p className="mt-1 font-semibold text-slate-900">{formatNumber(draftQuantity)} articulos</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Valor total compra</p>
              <p className="mt-1 font-semibold text-slate-900">{formatCurrency(draftPurchaseValueTotal)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Envio estimado</p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency((Number(values.shippingValueTotal) || 0) * (draftQuantity > 0 && totalPurchasedUnits > 0 ? draftQuantity / (editingLineIndex === null ? totalPurchasedUnits + draftQuantity : Math.max(totalPurchasedUnits - (Number(values.items[editingLineIndex]?.presentationQuantity) || 0) + draftQuantity, draftQuantity)) : 0))}
              </p>
            </div>
          </div>

          {lineError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {lineError}
            </p>
          ) : null}
          {isLockedVariantFlow ? (
            <p className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
              Esta variante usa automaticamente el mismo valor unitario y el mismo precio sugerido del producto base.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLineDialogOpen(false);
              setLockedDraftProductId(null);
            }}
          >
            Cancelar
          </Button>
          {editingLineIndex === null && lockedDraftProductId && draftSelectableVariantOptions.length > 1 ? (
            <Button type="button" variant="outline" onClick={() => saveDraftLine(true)}>
              Agregar y seguir
            </Button>
          ) : null}
          <Button type="button" onClick={() => saveDraftLine(false)}>
            {editingLineIndex === null ? 'Agregar producto' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
