'use client';

import Image from 'next/image';
import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Boxes, CheckCircle2, Package2, Plus, Trash2 } from 'lucide-react';
import { availableBrands, getProductVariantTemplate } from '@/lib/admin/catalogs';
import { isPackOf12Presentation, matchesCategoryFamily } from '@/lib/admin/category-rules';
import type { Product } from '@/lib/admin/types';
import {
  buildVariantAttributeValues,
  buildVariantDisplayName,
  normalizeVariantAttributeDefinitions,
} from '@/lib/admin/variant-helpers';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { optimizeImageFile } from '@/lib/image-upload';
import { SITE_LOGO } from '@/lib/branding';
import { AdminMobileSection } from '@/components/admin/admin-mobile-section';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { VariantCompactEditor } from '@/components/admin/products/variant-compact-editor';
import { useAdminData } from '@/components/admin/admin-data-context';
import { toCategoryOptions } from '@/lib/admin/category-utils';
import { CategoryFormDialog, type CategoryFormValues } from '@/components/admin/categories/category-form-dialog';
import {
  SubcategoryFormDialog,
  type SubcategoryFormValues,
} from '@/components/admin/categories/subcategory-form-dialog';

function slugifyVariantKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferColorHex(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return '';

  const colorMap: Record<string, string> = {
    negro: '#111827',
    black: '#111827',
    blanco: '#f8fafc',
    white: '#f8fafc',
    rojo: '#dc2626',
    roja: '#dc2626',
    red: '#dc2626',
    azul: '#2563eb',
    'azul cielo': '#38bdf8',
    'azul claro': '#38bdf8',
    'azul oscuro': '#1d4ed8',
    'azul turqui': '#06b6d4',
    'azul turquí': '#06b6d4',
    blue: '#2563eb',
    verde: '#16a34a',
    green: '#16a34a',
    amarillo: '#facc15',
    yellow: '#facc15',
    naranja: '#f97316',
    orange: '#f97316',
    morada: '#9333ea',
    morado: '#9333ea',
    purple: '#9333ea',
    salmon: '#fb7185',
    rosado: '#ec4899',
    rosa: '#ec4899',
    transparente: '#e2e8f0',
    transparent: '#e2e8f0',
    gris: '#94a3b8',
    gray: '#94a3b8',
    vinotinto: '#881337',
  };

  return colorMap[normalized] ?? '';
}

function shouldDisableVariantsForSelection(category: string, subcategory: string) {
  const normalizedSubcategory = subcategory.trim().toLowerCase();

  if (!category.trim() || !normalizedSubcategory) return false;

  if (getProductVariantTemplate({ name: '', brand: '', category, subcategory })) {
    return false;
  }

  if (matchesCategoryFamily(category, 'guantes') && normalizedSubcategory === 'paquete x 12') {
    return true;
  }

  return isPackOf12Presentation({ name: '', subcategory }) || normalizedSubcategory.startsWith('paquete x ');
}

function rankSubcategoryForVariants(category: string, subcategory: string) {
  if (shouldDisableVariantsForSelection(category, subcategory)) return 2;
  if (getProductVariantTemplate({ name: '', brand: '', category, subcategory })) return 0;
  return 1;
}

function buildCartesianVariantRows(
  attributes: Array<{ key: string; options: string[] }>,
  salePrice: number,
  existingVariants: Array<{
    id?: string;
    name?: string;
    stock?: number;
    attributeValues?: string[];
    colorHex?: string;
    sku?: string;
    status?: 'active' | 'inactive';
  }> = []
): Array<{
  id: string;
  name: string;
  sku: string;
  salePrice: number;
  stock: number;
  status: 'active' | 'inactive';
  attributeValues: string[];
  colorHex: string;
}> {
  if (attributes.length === 0) return [];

  const existingBySignature = new Map(
    existingVariants.map((variant) => [
      (variant.attributeValues ?? []).map((value) => value.trim().toLowerCase()).join('||'),
      variant,
    ])
  );

  const combinations = attributes.reduce<string[][]>(
    (accumulator, attribute) => {
      if (attribute.options.length === 0) return accumulator;
      if (accumulator.length === 0) {
        return attribute.options.map((option) => [option]);
      }

      return accumulator.flatMap((combination) =>
        attribute.options.map((option) => [...combination, option])
      );
    },
    []
  );

  return combinations.map((attributeValues) => {
    const signature = attributeValues.map((value) => value.trim().toLowerCase()).join('||');
    const existingVariant = existingBySignature.get(signature);
    const colorIndex = attributes.findIndex((attribute) => attribute.key === 'color');
    const colorValue = colorIndex >= 0 ? attributeValues[colorIndex] ?? '' : '';

    return {
      id: existingVariant?.id ?? '',
      name: existingVariant?.name ?? '',
      salePrice,
      stock: Number(existingVariant?.stock ?? 0),
      attributeValues,
      colorHex: colorValue ? inferColorHex(colorValue) : existingVariant?.colorHex ?? '',
      sku: existingVariant?.sku ?? '',
      status: existingVariant?.status === 'inactive' ? 'inactive' : 'active',
    };
  });
}

function collectAttributeOptions(
  attributes: Array<{ key: string; options: string[] }>,
  variants: Array<{ attributeValues?: string[] }>,
  overrides: Record<string, string[]> = {}
) {
  return attributes.map((attribute, index) => {
    const valuesFromVariants = variants
      .map((variant) => variant.attributeValues?.[index]?.trim() ?? '')
      .filter(Boolean);

    return {
      key: attribute.key,
      options: Array.from(new Set([...(overrides[attribute.key] ?? []), ...attribute.options, ...valuesFromVariants])),
    };
  });
}

const productSchema = z
  .object({
    name: z.string().min(3, 'Ingresa el nombre del producto'),
    description: z.string().min(10, 'Agrega una descripcion mas completa'),
    category: z.string().min(1, 'Selecciona una categoria'),
    subcategory: z.string(),
    brand: z.string().min(1, 'Ingresa o selecciona una marca'),
    salePrice: z.coerce.number().min(0),
    saleMode: z.enum(['simple', 'varianted']).default('simple'),
    variantLabel: z.string().default(''),
    historyVariantName: z.string().default(''),
    variantAttributes: z.array(
      z.object({
        id: z.string().default(''),
        key: z.string().default(''),
        label: z.string().min(1, 'Ingresa el nombre del atributo'),
      })
    ).default([]),
    variants: z.array(
      z.object({
        id: z.string().default(''),
        name: z.string().default(''),
        sku: z.string().default(''),
        salePrice: z.coerce.number().min(0).default(0),
        stock: z.coerce.number().min(0, 'Ingresa un stock valido').default(0),
        status: z.enum(['active', 'inactive']).default('active'),
        attributeValues: z.array(z.string().default('')).default([]),
        colorHex: z.string().default(''),
      })
    ).default([]),
    featured: z.boolean().default(false),
    image: z.string().min(1, 'Carga una imagen del producto'),
    imageRotation: z.coerce.number(),
    status: z.enum(['active', 'draft', 'archived']),
  })
  .superRefine((values, ctx) => {
    if (values.saleMode === 'varianted' && values.variantAttributes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Define al menos un atributo para las variantes.',
        path: ['variantAttributes'],
      });
    }

    if (values.saleMode === 'varianted' && values.variants.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Agrega al menos una variante para esta familia.',
        path: ['variants'],
      });
    }

    values.variants.forEach((variant, index) => {
      if (
        values.saleMode === 'varianted' &&
        values.variantAttributes.some((attribute, attributeIndex) => {
          const value = variant.attributeValues[attributeIndex]?.trim();
          return attribute.label.trim() && !value;
        })
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Completa todos los atributos de la variante.',
          path: ['variants', index, 'attributeValues'],
        });
      }
    });

    if (values.saleMode === 'varianted') {
      const seenSignatures = new Set<string>();
      values.variants.forEach((variant, index) => {
        const signature = values.variantAttributes
          .map((_, attributeIndex) => variant.attributeValues[attributeIndex]?.trim() ?? '')
          .filter(Boolean)
          .map((value) => value.toLowerCase())
          .join('||');

        const isComplete = values.variantAttributes.every((_, attributeIndex) =>
          Boolean(variant.attributeValues[attributeIndex]?.trim())
        );
        if (!isComplete || !signature) return;

        if (seenSignatures.has(signature)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'No repitas la misma combinacion de variante.',
            path: ['variants', index, 'attributeValues'],
          });
          return;
        }

        seenSignatures.add(signature);
      });
    }
  });

export type ProductFormValues = z.infer<typeof productSchema>;

interface ProductHistorySummary {
  purchasesCount: number;
  movementsCount: number;
  salesCount: number;
  servicesCount: number;
  hasActivity: boolean;
}

const defaultValues: ProductFormValues = {
  name: '',
  description: '',
  category: '',
  subcategory: '',
  brand: availableBrands[0],
  salePrice: 0,
  saleMode: 'simple',
  variantLabel: '',
  historyVariantName: '',
  variantAttributes: [],
  variants: [],
  featured: false,
  image: SITE_LOGO,
  imageRotation: 0,
  status: 'active',
};

export function ProductFormDialog({
  open,
  onOpenChange,
  initialProduct,
  historySummary,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProduct?: Product;
  historySummary?: ProductHistorySummary;
  onSubmit: (values: ProductFormValues) => Promise<void> | void;
}) {
  const productFormId = useId();
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues,
  });
  const { toast } = useToast();
  const { categories, createCategory, createSubcategory } = useAdminData();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [customSingleAxisValue, setCustomSingleAxisValue] = useState('');
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [openSubcategoryDialog, setOpenSubcategoryDialog] = useState(false);
  const [templateHydratedForProductId, setTemplateHydratedForProductId] = useState<string | null>(null);
  const { fields: variantFields, append: appendVariant, remove: removeVariant, replace: replaceVariants } = useFieldArray({
    control: form.control,
    name: 'variants',
  });
  const {
    fields: attributeFields,
    append: appendAttribute,
    remove: removeAttribute,
    replace: replaceAttributes,
  } = useFieldArray({
    control: form.control,
    name: 'variantAttributes',
  });

  useEffect(() => {
    if (!initialProduct) {
      form.reset(defaultValues);
      setTemplateHydratedForProductId(null);
      return;
    }

    form.reset({
      name: initialProduct.name,
      description: initialProduct.description,
      category: initialProduct.category,
      subcategory: initialProduct.subcategory,
      brand: initialProduct.brand,
      salePrice: initialProduct.salePrice,
      saleMode: initialProduct.saleMode ?? ((initialProduct.variants?.length ?? 0) > 0 ? 'varianted' : 'simple'),
      variantLabel: initialProduct.variantLabel ?? '',
      historyVariantName: '',
      variantAttributes:
        initialProduct.variantAttributes?.map((attribute) => ({
          id: attribute.id,
          key: attribute.key,
          label: attribute.label,
        })) ?? [],
      variants: (initialProduct.variants ?? []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku ?? '',
        salePrice: variant.salePrice ?? initialProduct.salePrice,
        stock: variant.stock,
        status: variant.status === 'inactive' ? 'inactive' : 'active',
        attributeValues: buildVariantAttributeValues(
          initialProduct.variantAttributes ?? [],
          variant.attributes ?? {}
        ),
        colorHex: variant.colorHex ?? '',
      })),
      featured: initialProduct.featured,
      image: initialProduct.image,
      imageRotation: initialProduct.imageRotation,
      status: initialProduct.status,
    });
    setTemplateHydratedForProductId(null);
  }, [form, initialProduct]);

  const selectedCategoryId = form.watch('category');
  const selectedName = form.watch('name');
  const selectedBrand = form.watch('brand');
  const selectedSubcategory = form.watch('subcategory');
  const saleMode = form.watch('saleMode');
  const selectedSalePrice = form.watch('salePrice');
  const selectedImage = form.watch('image');
  const selectedRotation = form.watch('imageRotation');
  const selectedVariantAttributes = form.watch('variantAttributes');
  const selectedHistoryVariantName = form.watch('historyVariantName');
  const watchedVariants = form.watch('variants');
  const categoryOptions = useMemo(
    () =>
      toCategoryOptions(categories, {
        selectedCategoryId,
        selectedSubcategoryLabel: selectedSubcategory,
      }),
    [categories, selectedCategoryId, selectedSubcategory]
  );
  const selectedCategory = useMemo(
    () => categoryOptions.find((category) => category.id === selectedCategoryId),
    [categoryOptions, selectedCategoryId]
  );
  const selectedSubcategoryOptions = useMemo(() => {
    const options = selectedCategory?.subcategories ?? [];
    return [...options].sort((left, right) => {
      const rankDiff =
        rankSubcategoryForVariants(selectedCategoryId, left) -
        rankSubcategoryForVariants(selectedCategoryId, right);
      if (rankDiff !== 0) return rankDiff;
      return left.localeCompare(right, 'es', { sensitivity: 'base' });
    });
  }, [selectedCategory, selectedCategoryId]);
  useEffect(() => {
    if (initialProduct) return;
    const currentCategory = form.getValues('category');
    if (currentCategory || categoryOptions.length === 0) return;
    const firstCategory = categoryOptions[0];
    form.setValue('category', firstCategory.id, { shouldValidate: true });
    form.setValue('subcategory', firstCategory.subcategories[0] ?? '', { shouldValidate: true });
  }, [categoryOptions, form, initialProduct]);
  const variantsDisabledForSelection = shouldDisableVariantsForSelection(
    selectedCategoryId,
    selectedSubcategory
  );
  const variantTemplate = useMemo(
    () =>
      getProductVariantTemplate({
        name: selectedName,
        brand: selectedBrand,
        category: selectedCategoryId,
        subcategory: selectedSubcategory,
      }),
    [selectedBrand, selectedCategoryId, selectedName, selectedSubcategory]
  );
  const variantGuidance = useMemo(() => {
    if (variantsDisabledForSelection) {
      return {
        tone: 'simple' as const,
        label: 'Producto simple',
        description: 'Esta presentacion se maneja como empaque y no necesita variantes.',
      };
    }

    if (variantTemplate) {
      return {
        tone: 'varianted' as const,
        label: 'Usa editor de variantes',
        description: variantTemplate.helper,
      };
    }

    return {
      tone: 'neutral' as const,
      label: 'Configurable',
      description: 'Puedes manejarlo como producto simple o con variantes, segun lo necesites.',
    };
  }, [variantTemplate, variantsDisabledForSelection]);
  const isVariantTemplateApplied = useMemo(() => {
    if (!variantTemplate || saleMode !== 'varianted') return false;

    const currentDefinitions = normalizeVariantAttributeDefinitions(selectedVariantAttributes);
    if (currentDefinitions.length !== variantTemplate.attributes.length) return false;

    return variantTemplate.attributes.every((attribute, index) => {
      const currentAttribute = currentDefinitions[index];
      return currentAttribute?.key === attribute.key && currentAttribute?.label === attribute.label;
    });
  }, [saleMode, selectedVariantAttributes, variantTemplate]);
  const normalizedAttributeDefinitions = useMemo(
    () => normalizeVariantAttributeDefinitions(selectedVariantAttributes),
    [selectedVariantAttributes]
  );
  const variantSummary = useMemo(
    () => normalizedAttributeDefinitions.map((attribute) => attribute.label).join(' / '),
    [normalizedAttributeDefinitions]
  );
  const hasColorAttribute = useMemo(
    () => normalizedAttributeDefinitions.some((attribute) => attribute.key === 'color' || attribute.label.toLowerCase() === 'color'),
    [normalizedAttributeDefinitions]
  );
  const usesSingleAxisTemplate = false;
  const usesAutoCombinationTemplate =
    saleMode === 'varianted' && variantTemplate?.mode === 'auto-combinations';
  const compactEditorConfig =
    saleMode === 'varianted' && variantTemplate?.editor?.kind === 'compact-table'
      ? variantTemplate.editor
      : null;
  const usesCompactVariantEditor = Boolean(compactEditorConfig);
  const usesCompactManualRows = compactEditorConfig?.creationMode === 'manual-rows';
  const singleAxisTemplate = variantTemplate?.mode === 'single-axis-list' ? variantTemplate.attributes[0] ?? null : null;
  const templateAllowsAttributeEditing = !variantTemplate || variantTemplate.allowAttributeEditing === true;
  const suggestedManualAttributes = useMemo(
    () =>
      Array.from(
        new Set([
          ...(variantTemplate?.attributes ?? []).map((attribute) => attribute.label),
          'Color',
          'Tamano',
          'Medida',
          'Presentacion',
        ])
      ),
    [variantTemplate]
  );
  const canReconfigureVirolaHistory =
    Boolean(initialProduct && historySummary?.hasActivity) &&
    matchesCategoryFamily(initialProduct?.category ?? '', 'virolas') &&
    variantTemplate?.id === 'virolas-color';
  const structureLocked = Boolean(initialProduct && historySummary?.hasActivity && !canReconfigureVirolaHistory);
  const existingSingleAxisValues: string[] = [];
  const normalizedExistingSingleAxisValues = new Set<string>();
  const availableSingleAxisOptions: string[] = [];
  const fixedCompactAttributeKeys = useMemo(
    () => new Set(compactEditorConfig?.fixedAttributes ?? []),
    [compactEditorConfig]
  );
  const searchableCompactAttributeKeys = useMemo(
    () => new Set(compactEditorConfig?.searchableAttributes ?? []),
    [compactEditorConfig]
  );
  const customCompactAttributeKeys = useMemo(
    () => new Set(compactEditorConfig?.allowCustomValuesFor ?? []),
    [compactEditorConfig]
  );
  const templateCompactAttributeOptions = useMemo(
    () =>
      Object.fromEntries(
        (variantTemplate?.attributes ?? []).map((attribute) => [attribute.key, attribute.options])
      ) as Record<string, string[]>,
    [variantTemplate]
  );
  const [customCompactOptions, setCustomCompactOptions] = useState<Record<string, string[]>>({});
  const compactSelectedAttributeValues = useMemo(
    () =>
      Object.fromEntries(
        normalizedAttributeDefinitions.map((attribute, attributeIndex) => [
          attribute.key,
          Array.from(
            new Set(
              watchedVariants
                .map((variant) => variant.attributeValues?.[attributeIndex]?.trim() ?? '')
                .filter(Boolean)
            )
          ),
        ])
      ) as Record<string, string[]>,
    [form, normalizedAttributeDefinitions, watchedVariants]
  );
  const compactAttributeControls = useMemo(
    () =>
      normalizedAttributeDefinitions.map((attribute) => ({
        key: attribute.key,
        label: attribute.label,
        options: Array.from(
          new Set([
            ...(templateCompactAttributeOptions[attribute.key] ?? []),
            ...(customCompactOptions[attribute.key] ?? []),
            ...(compactSelectedAttributeValues[attribute.key] ?? []),
          ])
        ),
        selectedValues: compactSelectedAttributeValues[attribute.key] ?? [],
        fixed: fixedCompactAttributeKeys.has(attribute.key),
        searchable: searchableCompactAttributeKeys.has(attribute.key),
        allowCustom: customCompactAttributeKeys.has(attribute.key),
      })),
    [
      compactSelectedAttributeValues,
      customCompactAttributeKeys,
      customCompactOptions,
      fixedCompactAttributeKeys,
      normalizedAttributeDefinitions,
      searchableCompactAttributeKeys,
      templateCompactAttributeOptions,
    ]
  );
  const handleQuickCategoryCreate = async (values: CategoryFormValues) => {
    const created = await createCategory({ label: values.label });
    form.setValue('category', created.id, { shouldValidate: true, shouldDirty: true });
    form.setValue('subcategory', '', { shouldValidate: true, shouldDirty: true });
    setOpenCategoryDialog(false);
    toast({
      title: 'Categoria creada',
      description: 'Ya puedes usarla en este producto.',
    });
  };
  const handleQuickSubcategoryCreate = async (values: SubcategoryFormValues) => {
    if (!selectedCategoryId) {
      throw new Error('Selecciona primero una categoria.');
    }

    const updatedCategory = await createSubcategory(selectedCategoryId, { label: values.label });
    const createdSubcategory = updatedCategory.subcategories[updatedCategory.subcategories.length - 1];
    form.setValue('subcategory', createdSubcategory?.label ?? values.label, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setOpenSubcategoryDialog(false);
    toast({
      title: 'Subcategoria creada',
      description: 'Ya puedes usarla en este producto.',
    });
  };
  useEffect(() => {
    if (!usesCompactVariantEditor) return;

    const nextCustomOptions = normalizedAttributeDefinitions.reduce<Record<string, string[]>>((accumulator, attribute, attributeIndex) => {
      const templateOptions = templateCompactAttributeOptions[attribute.key] ?? [];
      const extraValues = watchedVariants
        .map((variant) => variant.attributeValues?.[attributeIndex]?.trim() ?? '')
        .filter(
          (value) =>
            value &&
            !templateOptions.some((item) => item.toLowerCase() === value.toLowerCase())
        );
      accumulator[attribute.key] = Array.from(new Set(extraValues));
      return accumulator;
    }, {});

    setCustomCompactOptions((current) => {
      const merged = { ...current };
      Object.entries(nextCustomOptions).forEach(([key, values]) => {
        merged[key] = Array.from(new Set([...(current[key] ?? []), ...values]));
      });
      return merged;
    });
  }, [form, normalizedAttributeDefinitions, templateCompactAttributeOptions, usesCompactVariantEditor, watchedVariants]);

  useEffect(() => {
    if (!variantsDisabledForSelection || structureLocked) return;

    if (form.getValues('saleMode') !== 'simple') {
      form.setValue('saleMode', 'simple', { shouldDirty: true, shouldValidate: true });
    }

    if (form.getValues('variantAttributes').length > 0) {
      replaceAttributes([]);
    }

    if (form.getValues('variants').length > 0) {
      replaceVariants([]);
    }

    if (form.getValues('variantLabel')) {
      form.setValue('variantLabel', '', { shouldDirty: true, shouldValidate: false });
    }

    if (form.getValues('historyVariantName')) {
      form.setValue('historyVariantName', '', { shouldDirty: true, shouldValidate: false });
    }
  }, [form, replaceAttributes, replaceVariants, structureLocked, variantsDisabledForSelection]);

  useEffect(() => {
    if (!canReconfigureVirolaHistory) return;
    const currentVariants = form.getValues('variants');
    if (currentVariants.length === 0) return;
    if (selectedHistoryVariantName?.trim()) return;

    const preferredVariant =
      currentVariants.find((variant) => variant.attributeValues.some((value) => value.trim().toLowerCase() === 'transparente')) ??
      currentVariants.find((variant) => variant.attributeValues.some((value) => value.trim().toLowerCase() === 'blanca')) ??
      currentVariants[0];

    form.setValue(
      'historyVariantName',
      preferredVariant?.name?.trim() ||
        preferredVariant?.attributeValues.find(Boolean)?.trim() ||
        '',
      { shouldValidate: false, shouldDirty: false }
    );
  }, [canReconfigureVirolaHistory, form, selectedHistoryVariantName, variantFields]);

  useEffect(() => {
    const nextLabel = saleMode === 'varianted' ? variantSummary : '';
    if (form.getValues('variantLabel') !== nextLabel) {
      form.setValue('variantLabel', nextLabel, { shouldValidate: false, shouldDirty: false });
    }
  }, [form, saleMode, variantSummary]);

  useEffect(() => {
    if ((!usesSingleAxisTemplate && !usesAutoCombinationTemplate) || structureLocked) {
      return;
    }

    const nextPrice = Number(selectedSalePrice ?? 0);
    const currentVariants = form.getValues('variants');
    if (currentVariants.length === 0) return;

    const shouldSync = currentVariants.some((variant) => Number(variant.salePrice ?? 0) !== nextPrice);
    if (!shouldSync) return;

    replaceVariants(
      currentVariants.map((variant) => ({
        ...variant,
        salePrice: nextPrice,
      }))
    );
  }, [
    form,
    replaceVariants,
    selectedSalePrice,
    structureLocked,
    usesAutoCombinationTemplate,
    usesSingleAxisTemplate,
  ]);

  const applyVariantTemplate = () => {
    if (!variantTemplate) return;

    const nextAttributes = variantTemplate.attributes.map((attribute, index) => ({
      id: `attr-${index + 1}`,
      key: attribute.key || slugifyVariantKey(attribute.label),
      label: attribute.label,
    }));

    form.setValue('saleMode', 'varianted', { shouldValidate: true });
    replaceAttributes(nextAttributes);
    form.setValue(
      'variantLabel',
      nextAttributes.map((attribute) => attribute.label).join(' / '),
      { shouldValidate: true }
    );

    if (usesCompactManualRows) {
      replaceVariants(
        form.getValues('variants').map((variant) => ({
          ...variant,
          attributeValues: nextAttributes.map((_, index) => variant.attributeValues?.[index] ?? ''),
        }))
      );
      return;
    }

    if (variantTemplate.mode === 'auto-combinations') {
      replaceVariants(
        buildCartesianVariantRows(
          collectAttributeOptions(
            variantTemplate.attributes.map((attribute) => ({
              key: attribute.key,
              options: attribute.options,
            })),
            form.getValues('variants')
          ),
          Number(form.getValues('salePrice') ?? 0),
          form.getValues('variants')
        )
      );
      return;
    }

    replaceVariants(
      form.getValues('variants').map((variant) => ({
        ...variant,
        attributeValues: nextAttributes.map((_, index) => variant.attributeValues?.[index] ?? ''),
      }))
    );
  };

  useEffect(() => {
    if (!initialProduct || !variantTemplate || saleMode !== 'varianted') return;
    if (templateHydratedForProductId === initialProduct.id) return;
    if (normalizedAttributeDefinitions.length > 0) return;

    const nextAttributes = variantTemplate.attributes.map((attribute, index) => ({
      id: `attr-${index + 1}`,
      key: attribute.key || slugifyVariantKey(attribute.label),
      label: attribute.label,
    }));

    replaceAttributes(nextAttributes);

    const currentVariants = form.getValues('variants');
    if (currentVariants.length > 0) {
      replaceVariants(
        currentVariants.map((variant) => {
          const fallbackFirstValue =
            variant.attributeValues?.find((value) => value?.trim()) ??
            variant.name?.trim() ??
            '';

          return {
            ...variant,
            attributeValues: nextAttributes.map((attribute, index) => {
              if (variant.attributeValues?.[index]?.trim()) {
                return variant.attributeValues[index] ?? '';
              }

              if (index === 0 && nextAttributes.length === 1) {
                return fallbackFirstValue;
              }

              return '';
            }),
            colorHex:
              nextAttributes.length === 1 && nextAttributes[0]?.key === 'color'
                ? inferColorHex(fallbackFirstValue)
                : variant.colorHex,
          };
        })
      );
    }

    setTemplateHydratedForProductId(initialProduct.id);
  }, [
    form,
    initialProduct,
    normalizedAttributeDefinitions.length,
    replaceAttributes,
    replaceVariants,
    saleMode,
    templateHydratedForProductId,
    variantTemplate,
  ]);
  const appendSingleAxisVariant = (rawValue: string) => {
    const value = rawValue.trim();
    if (!value || normalizedExistingSingleAxisValues.has(value.toLowerCase())) return;

    appendVariant({
      id: '',
      name: '',
      sku: '',
      salePrice: Number(form.getValues('salePrice') ?? 0),
      stock: 0,
      status: 'active',
      attributeValues: [value],
      colorHex: singleAxisTemplate?.key === 'color' ? inferColorHex(value) : '',
    });
  };
  const rebuildCompactAutoCombinationVariants = (
    overrides: Record<string, string[]> = {}
  ) => {
    if (
      !variantTemplate ||
      (variantTemplate.mode !== 'auto-combinations' && variantTemplate.mode !== 'single-axis-list')
    ) {
      return;
    }

    const currentVariants = form.getValues('variants');
    const nextAttributes = collectAttributeOptions(
      variantTemplate.attributes.map((attribute) => ({
        key: attribute.key,
        options: attribute.options,
      })),
      currentVariants,
      overrides
    );

    replaceVariants(
      buildCartesianVariantRows(
        nextAttributes,
        Number(form.getValues('salePrice') ?? 0),
        currentVariants
      )
    );
  };
  const addCompactAttributeValue = (attributeKey: string, rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;

    const currentOptions = compactAttributeControls.find((attribute) => attribute.key === attributeKey)?.options ?? [];
    if (currentOptions.some((option) => option.toLowerCase() === value.toLowerCase())) {
      return;
    }

    if (usesCompactManualRows) {
      setCustomCompactOptions((current) => ({
        ...current,
        [attributeKey]: Array.from(new Set([...(current[attributeKey] ?? []), value])),
      }));
      return;
    }

    rebuildCompactAutoCombinationVariants({
      [attributeKey]: [...(compactSelectedAttributeValues[attributeKey] ?? []), value],
    });
    setCustomCompactOptions((current) => ({
      ...current,
      [attributeKey]: Array.from(new Set([...(current[attributeKey] ?? []), value])),
    }));
  };
  const addManualVariantAttribute = () => {
    appendAttribute({
      id: '',
      key: '',
      label: '',
    });

    replaceVariants(
      form.getValues('variants').map((variant) => ({
        ...variant,
        attributeValues: [...(variant.attributeValues ?? []), ''],
      }))
    );
  };
  const appendSuggestedManualAttribute = (label: string) => {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) return;

    const alreadyExists = form
      .getValues('variantAttributes')
      .some((attribute) => attribute.label.trim().toLowerCase() === normalizedLabel.toLowerCase());
    if (alreadyExists) return;

    appendAttribute({
      id: '',
      key: slugifyVariantKey(normalizedLabel),
      label: normalizedLabel,
    });

    replaceVariants(
      form.getValues('variants').map((variant) => ({
        ...variant,
        attributeValues: [...(variant.attributeValues ?? []), ''],
      }))
    );
  };
  const updateManualVariantAttribute = (attributeIndex: number, label: string) => {
    const nextLabel = label;
    form.setValue(`variantAttributes.${attributeIndex}.label`, nextLabel, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(`variantAttributes.${attributeIndex}.key`, slugifyVariantKey(nextLabel), {
      shouldDirty: true,
      shouldValidate: false,
    });
  };
  const removeManualVariantAttribute = (attributeIndex: number) => {
    removeAttribute(attributeIndex);

    replaceVariants(
      form.getValues('variants').map((variant) => ({
        ...variant,
        attributeValues: (variant.attributeValues ?? []).filter((_, index) => index !== attributeIndex),
      }))
    );
  };
  const hasIncompleteManualAttributes =
    saleMode === 'varianted' &&
    templateAllowsAttributeEditing &&
    form.getValues('variantAttributes').some((attribute) => !attribute.label.trim());
  const canAddManualVariants =
    saleMode === 'varianted' &&
    templateAllowsAttributeEditing &&
    normalizedAttributeDefinitions.length > 0 &&
    !hasIncompleteManualAttributes;
  const toggleCompactAttributeValue = (attributeKey: string, value: string) => {
    const currentSelectedValues = compactSelectedAttributeValues[attributeKey] ?? [];
    const nextSelectedValues = currentSelectedValues.some((item) => item.toLowerCase() === value.toLowerCase())
      ? currentSelectedValues.filter((item) => item.toLowerCase() !== value.toLowerCase())
      : [...currentSelectedValues, value];

    rebuildCompactAutoCombinationVariants({ [attributeKey]: nextSelectedValues });
  };
  const setCompactRowAttribute = (rowIndex: number, attributeKey: string, value: string) => {
    const attributeIndex = normalizedAttributeDefinitions.findIndex((attribute) => attribute.key === attributeKey);
    if (attributeIndex < 0) return;

    const currentVariants = form.getValues('variants');
    const currentVariant = currentVariants[rowIndex];
    if (!currentVariant) return;

    const nextAttributeValues = [...(currentVariant.attributeValues ?? normalizedAttributeDefinitions.map(() => ''))];
    nextAttributeValues[attributeIndex] = value;

    const isComplete = normalizedAttributeDefinitions.every((_, index) => Boolean(nextAttributeValues[index]?.trim()));
    if (isComplete) {
      const signature = nextAttributeValues.map((item) => item.trim().toLowerCase()).join('||');
      const hasDuplicate = currentVariants.some((variant, index) => {
        if (index === rowIndex) return false;
        const otherValues = normalizedAttributeDefinitions.map(
          (_, attributeValueIndex) => variant.attributeValues?.[attributeValueIndex]?.trim() ?? ''
        );
        const otherComplete = otherValues.every(Boolean);
        return otherComplete && otherValues.map((item) => item.toLowerCase()).join('||') === signature;
      });

      if (hasDuplicate) {
        toast({
          title: 'Variante repetida',
          description: 'Esa combinacion de atributos ya existe en este producto.',
          variant: 'destructive',
        });
        return;
      }
    }

    form.setValue(`variants.${rowIndex}.attributeValues`, nextAttributeValues, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (attributeKey === 'color') {
      form.setValue(`variants.${rowIndex}.colorHex`, inferColorHex(value), {
        shouldDirty: true,
        shouldValidate: false,
      });
    }
  };
  const getCompactRowAttributeOptions = (
    rowIndex: number,
    attributeKey: string,
    fallbackOptions: string[]
  ) => {
    if (!usesCompactManualRows) return fallbackOptions;

    const attributeIndex = normalizedAttributeDefinitions.findIndex((attribute) => attribute.key === attributeKey);
    if (attributeIndex < 0) return fallbackOptions;

    const currentVariants = form.getValues('variants');
    const currentRow = currentVariants[rowIndex];
    if (!currentRow) return fallbackOptions;

    return fallbackOptions.filter((option) => {
      const nextValues = normalizedAttributeDefinitions.map((_, comparisonIndex) =>
        comparisonIndex === attributeIndex
          ? option.trim().toLowerCase()
          : (currentRow.attributeValues?.[comparisonIndex] ?? '').trim().toLowerCase()
      );
      const nextValuesAreComplete = nextValues.every(Boolean);
      const isDuplicateWithinContext =
        nextValuesAreComplete &&
        currentVariants.some((variant, index) => {
          if (index === rowIndex) return false;

          const otherValues = normalizedAttributeDefinitions.map(
            (_, comparisonIndex) => variant.attributeValues?.[comparisonIndex]?.trim().toLowerCase() ?? ''
          );
          return otherValues.every(Boolean) && otherValues.join('||') === nextValues.join('||');
        });

      const currentValue = (currentRow.attributeValues?.[attributeIndex] ?? '').trim().toLowerCase();
      return !isDuplicateWithinContext || currentValue === option.trim().toLowerCase();
    });
  };
  const buildSuggestedCompactAttributeValues = () => {
    if (!usesCompactManualRows || compactAttributeControls.length === 0) return normalizedAttributeDefinitions.map(() => '');

    const currentVariants = form.getValues('variants');
    const existingSignatures = new Set(
      currentVariants
        .map((variant) =>
          normalizedAttributeDefinitions
            .map((_, index) => variant.attributeValues?.[index]?.trim().toLowerCase() ?? '')
            .join('||')
        )
    );

    const search = (
      attributeIndex: number,
      currentValues: string[]
    ): string[] | null => {
      if (attributeIndex >= normalizedAttributeDefinitions.length) {
        const signature = currentValues.map((value) => value.trim().toLowerCase()).join('||');
        return existingSignatures.has(signature) ? null : currentValues;
      }

      const attribute = normalizedAttributeDefinitions[attributeIndex];
      const baseOptions =
        compactAttributeControls.find((control) => control.key === attribute.key)?.options ?? [];

      for (const option of baseOptions) {
        const nextValues = [...currentValues];
        nextValues[attributeIndex] = option;
        const found = search(attributeIndex + 1, nextValues);
        if (found) return found;
      }

      return null;
    };

    return search(0, normalizedAttributeDefinitions.map(() => '')) ?? normalizedAttributeDefinitions.map(() => '');
  };
  const addCompactManualVariantRow = () => {
    const suggestedAttributeValues = buildSuggestedCompactAttributeValues();
    const hasSuggestedValues = suggestedAttributeValues.some((value) => value.trim());
    if (!hasSuggestedValues && normalizedAttributeDefinitions.length > 0 && form.getValues('variants').length > 0) {
      toast({
        title: 'Sin combinaciones disponibles',
        description: 'Ya cargaste todas las combinaciones sugeridas para estos atributos.',
      });
      return;
    }

    appendVariant({
      id: '',
      name: '',
      sku: '',
      salePrice: Number(form.getValues('salePrice') ?? 0),
      stock: 0,
      status: 'active',
      attributeValues: suggestedAttributeValues,
      colorHex: (() => {
        const colorIndex = normalizedAttributeDefinitions.findIndex((attribute) => attribute.key === 'color');
        return colorIndex >= 0 ? inferColorHex(suggestedAttributeValues[colorIndex] ?? '') : '';
      })(),
    });
  };
  const removeCompactManualVariantRow = (rowIndex: number) => {
    removeVariant(rowIndex);
  };
  const setCompactRowStock = (rowIndex: number, value: number) => {
    form.setValue(`variants.${rowIndex}.stock`, Math.max(Number(value || 0), 0), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  const setCompactRowSku = (rowIndex: number, value: string) => {
    form.setValue(`variants.${rowIndex}.sku`, value, {
      shouldDirty: true,
      shouldValidate: false,
    });
  };
  const setCompactRowStatus = (rowIndex: number, value: 'active' | 'inactive') => {
    form.setValue(`variants.${rowIndex}.status`, value, {
      shouldDirty: true,
      shouldValidate: false,
    });
  };
  const setCompactRowSalePrice = (rowIndex: number, value: number) => {
    form.setValue(`variants.${rowIndex}.salePrice`, Math.max(Number(value || 0), 0), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  const loadImageFile = (file: File) =>
    new Promise<{ dataUrl: string; width: number; height: number }>((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('No se pudo procesar la imagen seleccionada.'));
          return;
        }

        const image = new window.Image();
        image.onload = () => {
          resolve({
            dataUrl: result,
            width: image.width,
            height: image.height,
          });
        };
        image.onerror = () => reject(new Error('La imagen no es valida o esta dañada.'));
        image.src = result;
      };

      reader.readAsDataURL(file);
    });
  const handleImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
    onChange: (value: string) => void
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imageData = await optimizeImageFile(file, {
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.78,
        minQuality: 0.58,
        fit: 'cover',
        maxBytes: 240 * 1024,
      });
      form.clearErrors('image');
      onChange(imageData.dataUrl);
      form.setValue('imageRotation', 0, { shouldValidate: true });
      toast({
        title: 'Imagen ajustada automaticamente',
        description: `La foto se preparo en ${imageData.width} x ${imageData.height} px para cuidar espacio en la base de datos.`,
      });
    } catch (error) {
      form.setError('image', {
        type: 'manual',
        message: error instanceof Error ? error.message : 'No se pudo cargar la imagen.',
      });
      event.target.value = '';
    }
  };

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (form.formState.isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title={initialProduct ? 'Editar producto' : 'Nuevo producto'}
      busy={form.formState.isSubmitting}
      busyTitle={initialProduct ? 'Guardando producto...' : 'Creando producto...'}
      busyDescription="Espera la confirmacion antes de continuar."
      description={
        structureLocked
          ? 'Este producto ya tiene historial. Puedes ajustar datos comerciales y visuales, pero la estructura de variantes queda protegida para no afectar compras ni inventario.'
          : 'Registra la informacion esencial del producto y carga su imagen desde tu equipo.'
      }
      desktopContentClassName="lg:max-w-[58rem] xl:max-w-[62rem]"
      mobileContentClassName="rounded-none border-0 bg-background dark:bg-slate-950"
      headerClassName="px-4 pt-3 pb-3 sm:px-5 lg:px-5"
      bodyClassName="px-3 py-3 pb-4 sm:px-5 lg:px-5"
      footerClassName="px-3 py-3 sm:px-5 lg:px-5"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl sm:h-9"
            onClick={() => onOpenChange(false)}
            disabled={form.formState.isSubmitting}
          >
            Cancelar
          </Button>
          <Button form={productFormId} type="submit" className="h-11 rounded-xl sm:h-9" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Guardando...' : initialProduct ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={productFormId}
            onSubmit={form.handleSubmit(
              async (values) => {
                const selectedCategoryRecord = categoryOptions.find((category) => category.id === values.category);
                if (selectedCategoryRecord && selectedCategoryRecord.subcategories.length > 0 && !values.subcategory) {
                  form.setError('subcategory', {
                    type: 'manual',
                    message: 'Selecciona una subcategoria',
                  });
                  return;
                }

                const colorAttributeIndex = values.variantAttributes.findIndex(
                  (attribute) => attribute.key === 'color' || attribute.label.trim().toLowerCase() === 'color'
                );
                const nextValues: ProductFormValues = {
                  ...values,
                  variantLabel:
                    values.saleMode === 'varianted'
                      ? values.variantAttributes.map((attribute) => attribute.label.trim()).filter(Boolean).join(' / ')
                      : '',
                  variantAttributes: values.saleMode === 'varianted' ? values.variantAttributes : [],
                  variants:
                    values.saleMode === 'varianted'
                      ? values.variants.map((variant) => {
                          const inferredHex =
                            colorAttributeIndex >= 0
                              ? inferColorHex(variant.attributeValues[colorAttributeIndex] ?? '')
                              : '';
                          const persistedVariant =
                            initialProduct?.variants?.find((existingVariant) => existingVariant.id === variant.id) ?? null;

                          return {
                            ...variant,
                            stock: Math.max(Number(persistedVariant?.stock ?? 0), 0),
                            colorHex: inferredHex || variant.colorHex || '',
                          };
                        })
                      : [],
                };

                await onSubmit(nextValues);
                form.reset(defaultValues);
              },
              () => {
                toast({
                  title: 'Faltan datos por completar',
                  description: 'Revisa los campos marcados antes de guardar.',
                  variant: 'destructive',
                });
              }
            )}
            className="space-y-3"
          >
            <div className="space-y-3">
              <div className="space-y-3">
                <AdminMobileSection
                  value="product-info"
                  title="Informacion del producto"
                  defaultOpen
                  className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-3.5"
                  headerClassName="mb-2 sm:mb-2.5"
                  contentClassName="space-y-3"
                >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre</FormLabel>
                          <FormControl>
                            <Input placeholder="Tiza Taom V10" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripcion</FormLabel>
                          <FormControl>
                            <Textarea rows={3} placeholder="Describe el producto y su valor para el cliente." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-3 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between gap-2">
                              <FormLabel>Categoria</FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto px-0 text-xs"
                                onClick={() => setOpenCategoryDialog(true)}
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
                              </Button>
                            </div>
                            <FormControl>
                              <SearchableSelect
                                value={field.value}
                                onChange={(value) => {
                                  if (structureLocked) return;
                                  field.onChange(value);
                                  const nextCategory = categoryOptions.find((category) => category.id === value);
                                  const nextSubcategory =
                                    [...(nextCategory?.subcategories ?? [])].sort((left, right) => {
                                      const rankDiff =
                                        rankSubcategoryForVariants(value, left) -
                                        rankSubcategoryForVariants(value, right);
                                      if (rankDiff !== 0) return rankDiff;
                                      return left.localeCompare(right, 'es', { sensitivity: 'base' });
                                    })[0] ?? '';
                                  form.setValue('subcategory', nextSubcategory, {
                                    shouldValidate: true,
                                  });
                                }}
                                placeholder="Selecciona categoria"
                                searchPlaceholder="Buscar categoria..."
                                emptyLabel="No se encontraron categorias."
                                options={categoryOptions.map((category) => ({
                                  value: category.id,
                                  label: category.label,
                                }))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="subcategory"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between gap-2">
                              <FormLabel>Subcategoria</FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto px-0 text-xs"
                                disabled={!selectedCategoryId}
                                onClick={() => setOpenSubcategoryDialog(true)}
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
                              </Button>
                            </div>
                            {selectedCategory && selectedSubcategoryOptions.length > 0 ? (
                              <Select
                                value={field.value}
                                onValueChange={(value) => {
                                  if (structureLocked) return;
                                  field.onChange(value);
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full" disabled={structureLocked}>
                                    <SelectValue placeholder="Selecciona" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {selectedSubcategoryOptions.map((subcategory) => (
                                    <SelectItem key={subcategory} value={subcategory}>
                                      {subcategory}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <FormControl>
                                <Input
                                  value={selectedCategoryId ? 'Sin subcategoria' : 'Selecciona una categoria primero'}
                                  disabled
                                />
                              </FormControl>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="brand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Marca</FormLabel>
                            <FormControl>
                              <Input list="brand-options" placeholder="Predator" {...field} />
                            </FormControl>
                            <datalist id="brand-options">
                              {availableBrands.map((brand) => (
                                <option key={brand} value={brand} />
                              ))}
                            </datalist>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-3 rounded-2xl border border-border bg-card/88 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/70 sm:px-3.5 sm:py-3.5">
                      {variantsDisabledForSelection ? (
                        <div className="rounded-2xl border border-border bg-muted/70 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {selectedSubcategory || 'Esta presentacion'}
                          </span>{' '}
                          se maneja como producto simple y no muestra variantes disponibles.
                        </div>
                      ) : (
                        <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Variantes disponibles</h4>
                        </div>
                        {variantTemplate && !isVariantTemplateApplied ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-xl bg-card/88 dark:bg-slate-950/70 max-sm:h-9"
                            disabled={structureLocked}
                            onClick={applyVariantTemplate}
                          >
                            Configurar segun categoria
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid gap-2.5">
                        {structureLocked ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                            Este producto ya tiene historial y la estructura de variantes esta protegida.
                          </div>
                        ) : null}

                        {canReconfigureVirolaHistory ? (
                          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/20 dark:text-cyan-100">
                            El historial existente se reasignara a la variante que selecciones abajo.
                          </div>
                        ) : null}

                        <div className="grid gap-2.5">
                          <FormField
                            control={form.control}
                            name="saleMode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Tipo de venta</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger className="w-full" disabled={structureLocked}>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="simple">Producto simple</SelectItem>
                                    <SelectItem value="varianted">Producto con variantes</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                        </div>

                        {saleMode === 'varianted' ? (
                          <div className="space-y-2 rounded-2xl bg-slate-50/55 p-2.5 dark:bg-slate-900/55">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Atributos de la variante</p>
                              </div>
                              {templateAllowsAttributeEditing ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 w-full rounded-xl bg-card/88 dark:bg-slate-950/70 sm:h-10 sm:w-auto"
                                  disabled={structureLocked}
                                  onClick={addManualVariantAttribute}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  {attributeFields.length > 0 ? 'Agregar otro atributo' : 'Agregar atributo'}
                                </Button>
                              ) : null}
                            </div>

                            {templateAllowsAttributeEditing ? (
                              <div className="flex flex-wrap gap-2">
                                {suggestedManualAttributes.map((label) => (
                                  <Button
                                    key={label}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 rounded-full bg-muted px-3 dark:bg-slate-900/70"
                                    disabled={
                                      structureLocked ||
                                      form
                                        .getValues('variantAttributes')
                                        .some(
                                          (attribute) =>
                                            attribute.label.trim().toLowerCase() === label.toLowerCase()
                                        )
                                    }
                                    onClick={() => appendSuggestedManualAttribute(label)}
                                  >
                                    + {label}
                                  </Button>
                                ))}
                              </div>
                            ) : null}

                            {attributeFields.length > 0 ? (
                              attributeFields.map((field, index) => (
                                <div key={field.id} className="rounded-2xl border border-border bg-card/88 p-2.5 dark:border-slate-800 dark:bg-slate-950/70">
                                  {!templateAllowsAttributeEditing ? (
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      {form.getValues(`variantAttributes.${index}.label`) || `Atributo ${index + 1}`}
                                    </p>
                                  ) : (
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                      <FormField
                                        control={form.control}
                                        name={`variantAttributes.${index}.label`}
                                        render={({ field }) => (
                                          <FormItem className="min-w-0 flex-1">
                                            <FormControl>
                                              <Input
                                                {...field}
                                                value={field.value ?? ''}
                                                placeholder={`Ej: ${index === 0 ? 'Color' : `Atributo ${index + 1}`}`}
                                                disabled={structureLocked}
                                                onChange={(event) => {
                                                  field.onChange(event);
                                                  updateManualVariantAttribute(index, event.target.value);
                                                }}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="mt-0.5 h-9 w-9 shrink-0 self-end rounded-xl text-slate-500 hover:bg-muted hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-900 sm:self-auto"
                                        disabled={structureLocked}
                                        onClick={() => removeManualVariantAttribute(index)}
                                        aria-label="Eliminar atributo"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : templateAllowsAttributeEditing ? (
                              <div className="hidden rounded-2xl border border-dashed border-slate-300 bg-card/88 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400 sm:block">
                                Empieza por definir al menos un atributo, por ejemplo `Color`, `Tamano` o `Presentacion`.
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {saleMode === 'varianted' && form.formState.errors.variantAttributes?.message ? (
                          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {form.formState.errors.variantAttributes.message}
                          </div>
                        ) : null}

                        {canReconfigureVirolaHistory && saleMode === 'varianted' && variantFields.length > 0 ? (
                          <div className="space-y-3 rounded-2xl border border-border bg-muted/75 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                            <FormField
                              control={form.control}
                              name="historyVariantName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Historial previo</FormLabel>
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Selecciona la variante historica" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {variantFields.map((variantField, index) => {
                                        const variantName =
                                          form.getValues(`variants.${index}.name`) ||
                                          form.getValues(`variants.${index}.attributeValues.0`) ||
                                          `Variante ${index + 1}`;
                                        return (
                                          <SelectItem key={variantField.id} value={variantName}>
                                            {variantName}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                              El stock historico se migrara a esta variante base. Cualquier carga inicial o redistribucion posterior debe hacerse desde Inventario.
                            </p>
                          </div>
                        ) : null}

                        {usesSingleAxisTemplate ? (
                          <div className="rounded-2xl border border-border bg-card/88 p-4 dark:border-slate-800 dark:bg-slate-950/72">
                            <div className="flex flex-col gap-3">
                              {availableSingleAxisOptions.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {availableSingleAxisOptions.map((option) => (
                                    <Button
                                      key={option}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="rounded-full bg-muted"
                                      disabled={structureLocked}
                                      onClick={() => appendSingleAxisVariant(option)}
                                    >
                                      + {option}
                                    </Button>
                                  ))}
                                </div>
                              ) : null}

                              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <Input
                                  value={customSingleAxisValue}
                                  onChange={(event) => setCustomSingleAxisValue(event.target.value)}
                                  placeholder={`Agregar otra ${singleAxisTemplate?.label?.toLowerCase() ?? 'variante'}`}
                                  disabled={structureLocked}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full rounded-xl sm:w-auto"
                                  disabled={
                                    structureLocked ||
                                    !customSingleAxisValue.trim() ||
                                    normalizedExistingSingleAxisValues.has(customSingleAxisValue.trim().toLowerCase())
                                  }
                                  onClick={() => {
                                    appendSingleAxisVariant(customSingleAxisValue);
                                    setCustomSingleAxisValue('');
                                  }}
                                >
                                  Agregar
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {usesCompactVariantEditor ? (
                          <VariantCompactEditor
                            attributes={compactAttributeControls}
                            rows={watchedVariants.map((variant, index) => ({
                              id: variant.id || `row-${index}`,
                              values: Object.fromEntries(
                                normalizedAttributeDefinitions.map((attribute, attributeIndex) => [
                                  attribute.key,
                                  variant.attributeValues?.[attributeIndex] ?? '',
                                ])
                              ),
                              salePrice: Number(variant.salePrice ?? form.getValues('salePrice') ?? 0),
                              stock: Number(variant.stock ?? 0),
                              sku: variant.sku ?? '',
                              status: variant.status === 'inactive' ? 'inactive' : 'active',
                            }))}
                            structureLocked={structureLocked}
                            globalPrice={
                              compactEditorConfig?.priceMode === 'global'
                                ? {
                                    label: 'Precio sugerido global',
                                    description: 'Este valor se replica automaticamente en todas las variantes de este preset.',
                                    value: Number(form.getValues('salePrice') ?? 0),
                                    onChange: (value) =>
                                      form.setValue('salePrice', value, { shouldDirty: true, shouldValidate: true }),
                                  }
                                : undefined
                            }
                            onToggleAttributeValue={toggleCompactAttributeValue}
                            onAddAttributeValue={addCompactAttributeValue}
                            onRowSalePriceChange={setCompactRowSalePrice}
                            onRowStockChange={setCompactRowStock}
                            onRowSkuChange={setCompactRowSku}
                            onRowStatusChange={setCompactRowStatus}
                            onAddRow={addCompactManualVariantRow}
                            onRemoveRow={removeCompactManualVariantRow}
                            onRowAttributeChange={setCompactRowAttribute}
                            getRowAttributeOptions={getCompactRowAttributeOptions}
                            hiddenColumns={compactEditorConfig?.hiddenColumns}
                            manualRows={usesCompactManualRows}
                            hideStockColumn
                          />
                        ) : null}

                        <FormField
                          control={form.control}
                          name="variantLabel"
                          render={() => <FormMessage />}
                        />

                        {saleMode === 'varianted' && form.formState.errors.variants?.message ? (
                          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {form.formState.errors.variants.message}
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          {saleMode === 'varianted' && variantFields.length > 0 ? (
                            usesCompactVariantEditor ? null : (
                            <div
                              className={
                                usesSingleAxisTemplate
                                  ? ''
                                  : 'space-y-3'
                              }
                            >
                              {usesSingleAxisTemplate ? (
                                <div className="overflow-hidden rounded-2xl border border-border bg-card/88 dark:border-slate-800 dark:bg-slate-950/72">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/80 hover:bg-muted/80">
                                        <TableHead className="h-9 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                          {singleAxisTemplate?.label ?? 'Variante'}
                                        </TableHead>
                                        <TableHead className="h-9 w-[56px] px-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Eliminar</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {variantFields.map((field, index) => (
                                        <TableRow key={field.id}>
                                          <TableCell className="px-3 py-2">
                                            <div className="grid gap-1.5">
                                              {normalizedAttributeDefinitions.map((attribute, attributeIndex) => (
                                                <FormField
                                                  key={`${field.id}-${attribute.id}`}
                                                  control={form.control}
                                                  name={`variants.${index}.attributeValues.${attributeIndex}`}
                                                  render={({ field }) => (
                                                    <FormItem>
                                                      <FormControl>
                                                        <Input
                                                          placeholder={`Ej: ${attribute.label}`}
                                                          {...field}
                                                          disabled={structureLocked}
                                                          className="h-8 rounded-md border-border bg-background/88 px-2.5 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-100"
                                                          onChange={(event) => {
                                                            field.onChange(event);
                                                            if (hasColorAttribute && attribute.key === 'color') {
                                                              form.setValue(
                                                                `variants.${index}.colorHex`,
                                                                inferColorHex(event.target.value),
                                                                { shouldDirty: true }
                                                              );
                                                            }
                                                          }}
                                                        />
                                                      </FormControl>
                                                      <FormMessage />
                                                    </FormItem>
                                                  )}
                                                />
                                              ))}
                                            </div>
                                          </TableCell>
                                          <TableCell className="px-2 py-2 text-center">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 w-8 rounded-md p-0 text-slate-500 hover:bg-muted hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-900"
                                              disabled={structureLocked}
                                              onClick={() => removeVariant(index)}
                                              aria-label="Eliminar variante"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : null}
                              {usesSingleAxisTemplate ? null : variantFields.map((field, index) => (
                                <div
                                  key={field.id}
                                  className={
                                    usesSingleAxisTemplate
                                      ? 'grid grid-cols-[minmax(0,1fr)_120px_64px] items-end gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0'
                                      : 'grid min-w-0 gap-3 rounded-2xl border border-border bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/72'
                                  }
                                >
                                {normalizedAttributeDefinitions.length > 0 ? (
                                  <div
                                    className={
                                      usesSingleAxisTemplate
                                        ? 'grid gap-2'
                                        : `grid min-w-0 gap-3 ${normalizedAttributeDefinitions.length > 1 ? 'md:grid-cols-2' : ''}`
                                    }
                                  >
                                    {normalizedAttributeDefinitions.map((attribute, attributeIndex) => (
                                      <FormField
                                        key={`${field.id}-${attribute.id}`}
                                        control={form.control}
                                        name={`variants.${index}.attributeValues.${attributeIndex}`}
                                        render={({ field }) => (
                                          <FormItem className="min-w-0">
                                            {!usesSingleAxisTemplate ? <FormLabel>{attribute.label}</FormLabel> : null}
                                            <FormControl>
                                              <Input
                                                placeholder={`Ej: ${attribute.label}`}
                                                {...field}
                                                disabled={structureLocked}
                                                className={
                                                  usesSingleAxisTemplate
                                                    ? 'h-9 rounded-lg border-slate-200 bg-white text-sm font-semibold text-slate-900'
                                                    : undefined
                                                }
                                                onChange={(event) => {
                                                  field.onChange(event);
                                                  if (hasColorAttribute && attribute.key === 'color') {
                                                    form.setValue(
                                                      `variants.${index}.colorHex`,
                                                      inferColorHex(event.target.value),
                                                      { shouldDirty: true }
                                                    );
                                                  }
                                                }}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    ))}
                                    {usesSingleAxisTemplate ? (
                                      <>
                                        <div className="flex items-end">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 w-full rounded-lg px-0 text-slate-500 hover:bg-slate-100 hover:text-rose-600"
                                            disabled={structureLocked}
                                            onClick={() => removeVariant(index)}
                                            aria-label="Eliminar variante"
                                          >
                                            <span className="text-lg leading-none">×</span>
                                          </Button>
                                        </div>
                                      </>
                                    ) : null}
                                  </div>
                                ) : null}

                                {!usesSingleAxisTemplate ? (
                                  <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                                    <FormField
                                      control={form.control}
                                      name={`variants.${index}.salePrice`}
                                      render={({ field }) => (
                                          <FormItem className="min-w-0">
                                            <FormLabel>Precio venta</FormLabel>
                                            <FormControl>
                                              <Input type="number" min="0" step="0.01" {...field} />
                                            </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <div className="flex items-end">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 w-full rounded-xl"
                                        disabled={structureLocked}
                                        onClick={() => removeVariant(index)}
                                      >
                                        Quitar
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}

                                {!usesSingleAxisTemplate ? (
                                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-600">
                                    Nombre generado: {buildVariantDisplayName({
                                      name: '',
                                      attributes: normalizedAttributeDefinitions.reduce<Record<string, string>>((accumulator, attribute, attributeIndex) => {
                                        const value = form.getValues(`variants.${index}.attributeValues.${attributeIndex}`)?.trim();
                                        if (value) accumulator[attribute.key] = value;
                                        return accumulator;
                                      }, {}),
                                    }, normalizedAttributeDefinitions) || 'Completa los atributos para generar el nombre'}
                                  </div>
                                ) : null}
                              </div>
                              ))}
                            </div>
                            )
                          ) : null}

                          {saleMode === 'varianted' &&
                          !usesCompactVariantEditor &&
                          ((!usesSingleAxisTemplate && !usesAutoCombinationTemplate) || !variantTemplate) ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 rounded-xl bg-white"
                              disabled={structureLocked || (templateAllowsAttributeEditing && !canAddManualVariants)}
                              onClick={() =>
                                appendVariant({
                                  id: '',
                                  name: '',
                                  sku: '',
                                  salePrice: Number(form.getValues('salePrice') ?? 0),
                                  stock: 0,
                                  status: 'active',
                                  attributeValues: normalizedAttributeDefinitions.map(() => ''),
                                  colorHex: '',
                                })
                              }
                            >
                              Agregar combinacion
                            </Button>
                          ) : null}

                        </div>
                      </div>
                        </>
                      )}
                    </div>
                </AdminMobileSection>

                <AdminMobileSection
                  value="product-commerce"
                  title="Configuracion comercial"
                  className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-3.5"
                  headerClassName="mb-2 sm:mb-2.5"
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                    {usesCompactVariantEditor && compactEditorConfig?.priceMode === 'global' ? (
                      <div className="hidden rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 sm:block">
                        El precio de venta se controla desde el bloque de variantes.
                      </div>
                    ) : (
                      <FormField
                        control={form.control}
                        name="salePrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Precio de venta</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estado</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Activo</SelectItem>
                              <SelectItem value="draft">Borrador</SelectItem>
                              <SelectItem value="archived">Archivado</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="mt-3">
                    <FormField
                      control={form.control}
                      name="featured"
                      render={({ field }) => (
                        <FormItem className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60 sm:p-3.5">
                          <div className="flex items-start gap-3">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                            </FormControl>
                            <div>
                              <FormLabel className="text-sm font-medium text-slate-950 dark:text-slate-100">Mostrar como producto destacado</FormLabel>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </AdminMobileSection>
              </div>

                <AdminMobileSection
                  value="product-image"
                  title="Imagen"
                  className="space-y-3 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-3 shadow-sm dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] sm:p-3.5"
                  defaultOpen
                >
                <FormField
                  control={form.control}
                  name="image"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px] md:items-start md:gap-4">
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => void handleImageChange(event, field.onChange)}
                          />
                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className="block min-h-[190px] w-full rounded-3xl border border-dashed border-slate-300 bg-card/88 p-3.5 text-left transition hover:border-slate-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-950/60 sm:min-h-[220px] sm:p-4"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Cargar imagen</p>
                            </div>
                          </button>
                          <div className="overflow-hidden rounded-3xl border border-border bg-card/88 dark:border-slate-800 dark:bg-slate-950/70">
                            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Vista actual</p>
                            </div>
                            <div className="relative mx-auto aspect-square w-full max-w-[240px] bg-gradient-to-br from-white via-slate-50 to-slate-100">
                              <Image
                                src={selectedImage}
                                alt="Vista previa del producto"
                                fill
                                className="object-cover"
                                style={{ transform: `rotate(${selectedRotation}deg)` }}
                                unoptimized={selectedImage.startsWith('data:')}
                              />
                            </div>
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </AdminMobileSection>
            </div>
          </form>
        </Form>
        <CategoryFormDialog
          open={openCategoryDialog}
          onOpenChange={setOpenCategoryDialog}
          onSubmit={handleQuickCategoryCreate}
        />
        <SubcategoryFormDialog
          open={openSubcategoryDialog}
          onOpenChange={setOpenSubcategoryDialog}
          category={categories.find((category) => category.id === selectedCategoryId)}
          onSubmit={handleQuickSubcategoryCreate}
        />
    </AdminResponsiveDialog>
  );
}
