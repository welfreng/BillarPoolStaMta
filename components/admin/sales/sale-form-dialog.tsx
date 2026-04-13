'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown, Gift, MinusCircle, Pencil, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatNumber, getProductStock, getVariantOrProductRealUnitCost } from '@/lib/admin/calculations';
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

function SearchableSelect({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
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
        side="bottom"
        sideOffset={8}
        avoidCollisions={false}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList
            ref={listRef}
            onWheelCapture={(event) => {
              const element = listRef.current;
              if (!element) return;
              element.scrollTop += event.deltaY;
              event.preventDefault();
              event.stopPropagation();
            }}
            onWheel={(event) => {
              const element = listRef.current;
              if (!element) return;
              element.scrollTop += event.deltaY;
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
                  <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
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

        if (giftItem.quantity !== 1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'giftItems', giftIndex, 'quantity'],
            message: 'Cada obsequio debe llevar cantidad 1',
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
  movements: InventoryMovement[]
) {
  if (!product) return [];

  return (product.variants ?? []).filter(
    (variant) => variant.status !== 'inactive' && getProductVariantStock(product, variant.id, movements) > 0
  );
}

function getSuggestedSaleVariant(
  product: Product | null | undefined,
  movements: InventoryMovement[]
) {
  const variants = getSelectableSaleVariants(product, movements);
  return variants.length === 1 ? variants[0] : null;
}

function normalizeGiftItems(
  items: SaleLineFormValue['giftItems'],
  products: Product[],
  _movements: InventoryMovement[]
) {
  const seenCategories = new Set<string>();

  const normalizedItems = items.reduce<SaleLineFormValue['giftItems']>((accumulator, item) => {
    const productId = item.productId?.trim();
    if (!productId) return accumulator;

    const product = products.find((current) => current.id === productId);
    if (!product) return accumulator;
    const categoryKey = getSaleGiftCategoryKey(product);
    if (!categoryKey) return accumulator;
    if (seenCategories.has(categoryKey)) return accumulator;

    seenCategories.add(categoryKey);
    accumulator.push({ productId, quantity: 1 });
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

function setGiftSelectionByCategory<T extends { giftItems: SaleLineFormValue['giftItems'] }>(
  line: T,
  products: Product[],
  movements: InventoryMovement[],
  category: SaleGiftCategory,
  productId: string,
  enabled: boolean
): T {
  const nextItems = normalizeGiftItems(
    line.giftItems.filter((item) => {
      const product = products.find((current) => current.id === item.productId);
      return product ? getSaleGiftCategoryKey(product) !== category : true;
    }),
    products,
    movements
  );

  if (enabled && productId) {
    nextItems.push({ productId, quantity: 1 });
  }

  return {
    ...line,
    giftItems: nextItems,
  };
}

function getGiftSelectionHelpText(categories: SaleGiftCategory[]) {
  if (categories.length === 0) return 'Este producto no maneja obsequios.';
  return `Puedes incluir ${formatSaleGiftCategoryList(categories)}. Cada opcion se descuenta solo si la marcas.`;
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
  line: { giftItems: SaleLineFormValue['giftItems'] };
  onLineChange: (nextLine: { giftItems: SaleLineFormValue['giftItems'] }) => void;
  products: Product[];
  movements: InventoryMovement[];
  allowedCategories: SaleGiftCategory[];
  availableGiftOptionsByCategory: Record<SaleGiftCategory, Product[]>;
}) {
  if (allowedCategories.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
            <Gift className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Obsequio</p>
            <p className="text-sm text-slate-500">{getGiftSelectionHelpText(allowedCategories)}</p>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
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
          <span className="text-sm font-medium text-slate-700">Incluir obsequio</span>
        </label>
      </div>

      {enabled ? (
        <div className="grid gap-3 md:grid-cols-2">
          {allowedCategories.map((category) => {
            const selectedProductId = getGiftProductIdByCategory(line.giftItems, products, category);
            const options = availableGiftOptionsByCategory[category];

            return (
              <div key={category} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
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
                  <span className="text-sm font-medium text-slate-900">{giftCategoryCopy[category].toggle}</span>
                </div>

                <div className="mt-3">
                  <Select
                    value={selectedProductId}
                    onValueChange={(value) =>
                      onLineChange(setGiftSelectionByCategory(line, products, movements, category, value, true))
                    }
                    disabled={!selectedProductId || options.length === 0}
                  >
                    <SelectTrigger className="h-10 w-full max-w-full bg-white">
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
              </div>
            );
          })}
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
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700">
            <Gift className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Servicio asociado</p>
            <p className="text-sm text-slate-500">
              Registra aqui la instalacion para medir por separado el ingreso y la utilidad del torno.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
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
          <span className="text-sm font-medium text-slate-700">Incluir instalacion</span>
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
  soldAt: new Date().toISOString().slice(0, 10),
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
  onSubmit: (values: SaleFormValues) => Promise<void> | void;
}) {
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

  const values = form.watch();
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
  const firstItemVariantOptions = getSelectableSaleVariants(firstItemProduct, movements);
  const firstItemSelectedVariant =
    firstItemVariantOptions.find((variant) => variant.id === firstItem.variantId) ?? null;
  const firstItemDisplayStock = firstItemSelectedVariant
    ? getProductVariantStock(firstItemProduct ?? undefined, firstItemSelectedVariant.id, movements)
    : firstLineSummary?.stock ?? 0;
  const firstItemAllowedGiftCategories = firstItemProduct ? getAllowedSaleGiftCategories(firstItemProduct) : [];
  const firstItemCanHaveGift = firstItemAllowedGiftCategories.length > 0;
  const firstItemHasGiftSelection = hasSelectedGiftItems(firstItem.giftItems, products);
  const draftProduct = products.find((product) => product.id === draftLine.productId) ?? null;
  const draftVariantOptions = getSelectableSaleVariants(draftProduct, movements);
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
                  giftItems: normalizeGiftItems(item.giftItems, products, movements),
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
      giftItems: normalizeGiftItems(draftLine.giftItems, products, movements),
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
    if (normalizedDraftLine.giftItems.length > 0) {
      const invalidGift = normalizedDraftLine.giftItems.find(
        (giftItem) => !giftItem.productId || Number(giftItem.quantity) !== 1
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[96vw] overflow-y-auto px-4 pb-36 sm:w-[calc(100vw-2rem)] sm:px-5 lg:max-w-4xl lg:px-6">
          <DialogHeader>
            <DialogTitle>{isEditingSale ? 'Editar venta' : 'Registrar venta'}</DialogTitle>
            <DialogDescription>
              {hideFinancialSummary
                ? 'Cada venta descuenta stock y mantiene actualizado el inventario.'
                : 'Cada venta descuenta stock y deja trazabilidad para los reportes del negocio.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(async (submittedValues) => {
                await onSubmit(submittedValues);
                form.reset(defaultValues);
              })}
              className="space-y-6"
            >
              <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:items-start sm:p-6">
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
                        <p className="text-xs text-slate-500">
                          Si vas a vender a mostrador, reemplaza `Cliente mostrador` por el nombre real antes de guardar.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">
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

              <section className="min-w-0 space-y-5 rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 lg:p-6">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Productos de la venta</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    El primer producto se elige aqui. Usa `Agregar producto` solo cuando la venta tenga mas lineas.
                  </p>
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
                                const suggestedVariant = getSuggestedSaleVariant(product, movements);
                                if (product) {
                                  form.setValue(
                                    'items.0.unitPrice',
                                    suggestedVariant
                                      ? Number(suggestedVariant.salePrice ?? getVariantSalePrice(product))
                                      : (product.variants?.length ?? 0) > 0
                                        ? 0
                                        : getVariantSalePrice(product),
                                    { shouldValidate: true }
                                  );
                                }
                                form.setValue('items.0.variantId', suggestedVariant?.id ?? '', {
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
                                        movements
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
                      <div className="sticky bottom-24 z-10 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 shadow-sm md:static md:shadow-none">
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Stock disponible</p>
                        <p className="mt-1 text-lg font-semibold text-cyan-950">
                          {formatNumber(firstItemDisplayStock)} unidades
                        </p>
                        <p className="mt-1 text-sm text-cyan-900">
                          {firstLineSummary.product.name} - {firstLineSummary.product.brand || 'Sin marca'}
                        </p>
                        {firstItemSelectedVariant ? (
                          <p className="mt-1 text-xs font-medium text-cyan-800">
                            {firstItemProduct?.variantLabel || 'Variante'}: {firstItemSelectedVariant.name}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {firstItemVariantOptions.length > 0 ? (
                      <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {firstItemProduct?.variantLabel || 'Variante'} disponible
                            </p>
                            <p className="text-sm text-slate-500">
                              Selecciona la opcion que le queda al cliente y revisa cuantas unidades hay.
                            </p>
                            {firstItemVariantOptions.length > 1 ? (
                              <p className="text-xs text-amber-700">
                                El precio se define cuando eliges la variante.
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {firstItemVariantOptions.map((variant) => (
                              <span
                                key={variant.id}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
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
                            <FormItem className="max-w-sm">
                              <FormLabel>{firstItemProduct?.variantLabel || 'Variante'}</FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  const variant = firstItemVariantOptions.find((item) => item.id === value);
                                  if (variant?.salePrice !== undefined) {
                                    form.setValue('items.0.unitPrice', Number(variant.salePrice), {
                                      shouldValidate: true,
                                    });
                                  }
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

                    <div className="grid gap-4 sm:grid-cols-[minmax(124px,0.72fr)_minmax(160px,0.92fr)] sm:items-end">
                      <FormField
                        control={form.control}
                        name="items.0.quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cantidad</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                max={Math.max(firstItemDisplayStock, 1)}
                                {...field}
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
                          <FormItem>
                            <FormLabel>Precio unidad</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

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
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Los obsequios no aplican para este producto.
                      </div>
                    ) : null}

                    </div>

                    {firstItemProduct ? (
                      <aside className="hidden rounded-3xl border border-slate-200 bg-slate-50/70 p-4 lg:block">
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vista del producto</p>
                            <p className="mt-1 text-lg font-semibold text-slate-950">{firstItemProduct.name}</p>
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
                            <div className="rounded-2xl bg-white px-4 py-3">
                              <p className="text-xs text-slate-500">{firstItemProduct.variantLabel || 'Variante'}</p>
                              <p className="mt-1 flex items-center gap-2 font-medium text-slate-900">
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
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
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
                        <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium text-slate-900">
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
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
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
                    className="hidden w-full rounded-xl bg-white sm:inline-flex"
                    onClick={openNewLineDialog}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Agregar producto
                  </Button>

                  <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-emerald-950">Total acumulado de la compra</p>
                      <p className="text-xs text-emerald-800">
                        {formatNumber(saleSummaries.reduce((sum, item) => sum + item.quantity, 0))} unidades en {
                          formatNumber(fields.length)
                        } lineas
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-emerald-950">{formatCurrency(totals.totalSale)}</p>
                  </div>
                </div>
              </section>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea rows={4} placeholder="Ejemplo: venta en mostrador o pedido especial" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-5 sm:p-6">
                <p className="text-sm font-medium text-cyan-950">Resumen de la venta</p>
                <div className={`mt-4 grid gap-3 ${hideFinancialSummary ? 'sm:grid-cols-1 lg:grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs text-slate-500">Unidades en venta</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatNumber(saleSummaries.reduce((sum, item) => sum + item.quantity, 0))} uds
                    </p>
                  </div>
                  {!hideFinancialSummary && (
                    <>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Costo total productos</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {formatCurrency(saleSummaries.reduce((sum, item) => sum + item.totalCost, 0))}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Ingreso total</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.totalSale)}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Costo total obsequios</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.totalGiftCost)}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs text-slate-500">Utilidad neta</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.grossProfit)}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="fixed inset-x-3 bottom-2 z-20 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-xl backdrop-blur supports-[padding:max(0px)]:pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:inset-x-6 lg:hidden">
                <div className="grid grid-cols-3 gap-2">
                  <Button type="button" variant="outline" className="h-11 rounded-xl px-2" onClick={openNewLineDialog}>
                    <PlusCircle className="mr-1 h-4 w-4" />
                    <span className="text-xs">Agregar</span>
                  </Button>
                  <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="h-11 rounded-xl">
                    {isEditingSale ? 'Actualizar venta' : 'Registrar venta'}
                  </Button>
                </div>
              </div>

              <DialogFooter className="hidden gap-3 border-t border-slate-200 pt-4 sm:flex sm:pt-5">
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="w-full sm:w-auto">
                  {isEditingSale ? 'Actualizar venta' : 'Registrar venta'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[96vw] overflow-y-auto px-4 pb-32 sm:w-[calc(100vw-2rem)] sm:px-5 lg:max-w-4xl lg:px-6">
          <DialogHeader>
            <DialogTitle>{editingLineIndex === null ? 'Agregar producto a la venta' : 'Editar producto de la venta'}</DialogTitle>
            <DialogDescription>
              Configura esta linea y al guardarla quedara en la lista de productos solicitados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Producto</Label>
              <SearchableSelect
                value={draftLine.productId}
                onChange={(value) => {
                  const product = products.find((item) => item.id === value);
                  const suggestedVariant = getSuggestedSaleVariant(product, movements);
                    setDraftLine((current) => ({
                      ...current,
                      productId: value,
                      variantId: suggestedVariant?.id ?? '',
                      quantity: current.quantity || '1',
                      unitPrice:
                        product?.salePrice !== undefined
                          ? String(
                              suggestedVariant
                                ? Number(suggestedVariant.salePrice ?? getVariantSalePrice(product))
                                : (product.variants?.length ?? 0) > 0
                                  ? 0
                                  : getVariantSalePrice(product)
                            )
                          : current.unitPrice,
                      serviceItems: supportsInstallationService(product) ? [createDefaultInstallationServiceItem()] : [],
                      giftItems:
                        product && getAllowedSaleGiftCategories(product).length > 0
                          ? normalizeGiftItems(
                              current.giftItems.filter((giftItem) => giftItem.productId !== value),
                              products,
                              movements
                            )
                          : [],
                    }));
                  setLineError('');
                }}
                placeholder="Selecciona producto"
                searchPlaceholder="Buscar producto..."
                emptyLabel="No se encontraron productos."
                options={products.map((product) => ({
                  value: product.id,
                  label: `${product.name} - ${product.brand}`,
                }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {draftVariantOptions.length > 0 ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>{draftProduct?.variantLabel || 'Variante'}</Label>
                  <Select
                    value={draftLine.variantId}
                  onValueChange={(value) => {
                      const variant = draftVariantOptions.find((item) => item.id === value);
                      setDraftLine((current) => ({
                        ...current,
                        variantId: value,
                        unitPrice:
                          variant?.salePrice !== undefined
                            ? String(variant.salePrice)
                            : current.unitPrice,
                      }));
                      setLineError('');
                    }}
                  >
                    <SelectTrigger>
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
                <div className="sticky bottom-24 z-10 sm:col-span-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 shadow-sm md:static md:shadow-none">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Stock disponible</p>
                  <p className="mt-1 text-lg font-semibold text-cyan-950">
                    {formatNumber(
                      draftLine.variantId
                        ? getProductVariantStock(draftProduct ?? undefined, draftLine.variantId, movements)
                        : getProductStock(movements, draftLine.productId)
                    )} unidades
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
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
                    setDraftLine((current) => ({ ...current, quantity: event.target.value }));
                    setLineError('');
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Precio unidad</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftLine.unitPrice}
                  onChange={(event) => {
                    setDraftLine((current) => ({ ...current, unitPrice: event.target.value }));
                    setLineError('');
                  }}
                />
              </div>
            </div>

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
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Los obsequios no aplican para este producto.
              </div>
            ) : null}

            {lineError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {lineError}
              </p>
            ) : null}
          </div>

          <div className="fixed inset-x-3 bottom-2 z-20 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-xl backdrop-blur supports-[padding:max(0px)]:pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:hidden">
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setLineDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" className="h-11 rounded-xl" onClick={saveDraftLine}>
                {editingLineIndex === null ? 'Agregar producto' : 'Guardar cambios'}
              </Button>
            </div>
          </div>

          <DialogFooter className="hidden gap-3 sm:flex">
            <Button type="button" variant="outline" onClick={() => setLineDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveDraftLine}>
              {editingLineIndex === null ? 'Agregar producto' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
