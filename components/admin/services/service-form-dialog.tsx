'use client';

import { useEffect, useId, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatNumber, getProductRealUnitCost, getStoredProductStock, getVariantOrProductRealUnitCost } from '@/lib/admin/calculations';
import { filterProductsByCategoryFamily } from '@/lib/admin/category-rules';
import { serviceTypeLabels } from '@/lib/admin/catalogs';
import { getTodayDateInputValue } from '@/lib/admin/date-utils';
import { buildVariantDisplayName, getProductSaleMode, getProductVariantStock } from '@/lib/admin/variant-helpers';
import type { InventoryMovement, Product, Purchase, ServiceType } from '@/lib/admin/types';

const serviceTypeOptions = [
  'tip-installation',
  'ferrule-installation',
  'tip-ferrule-installation',
  'extension-installation',
  'shaft-reduction',
  'shaft-straightening',
  'custom-turning',
] as const satisfies readonly ServiceType[];

const serviceSchema = z.object({
  serviceType: z.enum(serviceTypeOptions),
  serviceLabel: z.string().default(''),
  serviceCategory: z.string().default('torno'),
  performedAt: z.string().min(1, 'Selecciona la fecha'),
  customerName: z.string().min(2, 'Ingresa el cliente'),
  cueReference: z.string().min(2, 'Describe el taco o referencia'),
  paymentMethod: z.string().min(1, 'Selecciona el metodo de pago'),
  paymentReference: z.string().default(''),
  servicePrice: z.coerce.number().positive('Ingresa un valor valido para el servicio'),
  serviceCost: z.coerce.number().min(0, 'Ingresa un costo valido').default(0),
  tipProductId: z.string().default(''),
  tipVariantId: z.string().default(''),
  ferruleProductId: z.string().default(''),
  ferruleVariantId: z.string().default(''),
  suppressorProductId: z.string().default(''),
  suppressorVariantId: z.string().default(''),
  includeSuppressor: z.boolean().default(false),
  extensionProductId: z.string().default(''),
  extensionVariantId: z.string().default(''),
  bumperProductId: z.string().default(''),
  bumperVariantId: z.string().default(''),
  notes: z.string().default(''),
}).superRefine((values, context) => {
  if (!values.tipProductId && (values.serviceType === 'tip-installation' || values.serviceType === 'tip-ferrule-installation')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tipProductId'], message: 'Selecciona el casquillo.' });
  }
  if (values.serviceType === 'ferrule-installation' && !values.ferruleProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ferruleProductId'], message: 'Selecciona la virola.' });
  }
  if (values.serviceType === 'tip-ferrule-installation' && !values.ferruleProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ferruleProductId'], message: 'Selecciona la virola.' });
  }
  if (values.includeSuppressor && !values.suppressorProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['suppressorProductId'], message: 'Selecciona el supresor.' });
  }
  if (values.serviceType === 'extension-installation' && !values.extensionProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['extensionProductId'], message: 'Selecciona la extension.' });
  }
  if (values.serviceType === 'extension-installation' && !values.bumperProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['bumperProductId'], message: 'Selecciona el parachoque.' });
  }
  if (values.serviceType === 'custom-turning' && values.serviceLabel.trim().length < 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['serviceLabel'], message: 'Describe el trabajo realizado.' });
  }
});

export type ServiceFormValues = z.infer<typeof serviceSchema>;

const defaultValues: ServiceFormValues = {
  serviceType: 'tip-installation',
  serviceLabel: '',
  serviceCategory: 'torno',
  performedAt: getTodayDateInputValue(),
  customerName: '',
  cueReference: '',
  paymentMethod: 'efectivo',
  paymentReference: '',
  servicePrice: 0,
  serviceCost: 0,
  tipProductId: '',
  tipVariantId: '',
  ferruleProductId: '',
  ferruleVariantId: '',
  suppressorProductId: '',
  suppressorVariantId: '',
  includeSuppressor: false,
  extensionProductId: '',
  extensionVariantId: '',
  bumperProductId: '',
  bumperVariantId: '',
  notes: '',
};

function buildProductVariantOptions(product?: Product) {
  if (!product) return [];
  return (product.variants ?? [])
    .filter((variant) => variant.status !== 'inactive')
    .map((variant) => ({
      value: variant.id,
      label: buildVariantDisplayName(variant, product.variantAttributes),
    }));
}

function resolveDefaultVariantId(product?: Product) {
  return buildProductVariantOptions(product)[0]?.value ?? '';
}

export function ServiceFormDialog({
  open,
  onOpenChange,
  products,
  purchases,
  movements,
  hideFinancialSummary = false,
  initialValues,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  purchases: Purchase[];
  movements: InventoryMovement[];
  hideFinancialSummary?: boolean;
  initialValues?: ServiceFormValues;
  submitLabel?: string;
  onSubmit: (values: ServiceFormValues) => Promise<void> | void;
}) {
  const serviceFormId = useId();
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues,
  });
  const isSubmitting = form.formState.isSubmitting;

  useEffect(() => {
    if (open) {
      form.reset(initialValues ?? defaultValues);
    }
  }, [form, initialValues, open]);

  const values = form.watch();
  const needsTip = values.serviceType === 'tip-installation' || values.serviceType === 'tip-ferrule-installation';
  const needsFerrule = values.serviceType === 'ferrule-installation' || values.serviceType === 'tip-ferrule-installation';
  const needsExtension = values.serviceType === 'extension-installation';
  const allowsSuppressor = needsTip || needsFerrule;
  const tipOptions = useMemo(() => filterProductsByCategoryFamily(products, 'casquillos'), [products]);
  const ferruleOptions = useMemo(() => filterProductsByCategoryFamily(products, 'virolas'), [products]);
  const suppressorOptions = useMemo(() => filterProductsByCategoryFamily(products, 'supresores'), [products]);
  const extensionOptions = useMemo(() => filterProductsByCategoryFamily(products, 'extensiones'), [products]);
  const bumperOptions = useMemo(() => filterProductsByCategoryFamily(products, 'parachoques'), [products]);
  const selectedTipProduct = products.find((product) => product.id === values.tipProductId);
  const selectedFerruleProduct = products.find((product) => product.id === values.ferruleProductId);
  const selectedSuppressorProduct = products.find((product) => product.id === values.suppressorProductId);
  const selectedExtensionProduct = products.find((product) => product.id === values.extensionProductId);
  const selectedBumperProduct = products.find((product) => product.id === values.bumperProductId);
  const tipVariantOptions = useMemo(() => buildProductVariantOptions(selectedTipProduct), [selectedTipProduct]);
  const ferruleVariantOptions = useMemo(() => buildProductVariantOptions(selectedFerruleProduct), [selectedFerruleProduct]);
  const suppressorVariantOptions = useMemo(() => buildProductVariantOptions(selectedSuppressorProduct), [selectedSuppressorProduct]);
  const extensionVariantOptions = useMemo(() => buildProductVariantOptions(selectedExtensionProduct), [selectedExtensionProduct]);
  const bumperVariantOptions = useMemo(() => buildProductVariantOptions(selectedBumperProduct), [selectedBumperProduct]);

  useEffect(() => {
    const hasVariants = getProductSaleMode(selectedTipProduct) === 'varianted';
    const currentVariantId = form.getValues('tipVariantId');
    const variantExists = tipVariantOptions.some((variant) => variant.value === currentVariantId);
    if (!hasVariants && currentVariantId) {
      form.setValue('tipVariantId', '', { shouldValidate: true });
      return;
    }
    if (hasVariants && !variantExists) {
      form.setValue('tipVariantId', resolveDefaultVariantId(selectedTipProduct), { shouldValidate: true });
    }
  }, [form, selectedTipProduct, tipVariantOptions]);

  useEffect(() => {
    const hasVariants = getProductSaleMode(selectedFerruleProduct) === 'varianted';
    const currentVariantId = form.getValues('ferruleVariantId');
    const variantExists = ferruleVariantOptions.some((variant) => variant.value === currentVariantId);
    if (!hasVariants && currentVariantId) {
      form.setValue('ferruleVariantId', '', { shouldValidate: true });
      return;
    }
    if (hasVariants && !variantExists) {
      form.setValue('ferruleVariantId', resolveDefaultVariantId(selectedFerruleProduct), { shouldValidate: true });
    }
  }, [ferruleVariantOptions, form, selectedFerruleProduct]);

  useEffect(() => {
    const hasVariants = getProductSaleMode(selectedSuppressorProduct) === 'varianted';
    const currentVariantId = form.getValues('suppressorVariantId');
    const variantExists = suppressorVariantOptions.some((variant) => variant.value === currentVariantId);
    if (!hasVariants && currentVariantId) {
      form.setValue('suppressorVariantId', '', { shouldValidate: true });
      return;
    }
    if (hasVariants && !variantExists) {
      form.setValue('suppressorVariantId', resolveDefaultVariantId(selectedSuppressorProduct), { shouldValidate: true });
    }
  }, [form, selectedSuppressorProduct, suppressorVariantOptions]);

  useEffect(() => {
    const hasVariants = getProductSaleMode(selectedExtensionProduct) === 'varianted';
    const currentVariantId = form.getValues('extensionVariantId');
    const variantExists = extensionVariantOptions.some((variant) => variant.value === currentVariantId);
    if (!hasVariants && currentVariantId) {
      form.setValue('extensionVariantId', '', { shouldValidate: true });
      return;
    }
    if (hasVariants && !variantExists) {
      form.setValue('extensionVariantId', resolveDefaultVariantId(selectedExtensionProduct), { shouldValidate: true });
    }
  }, [extensionVariantOptions, form, selectedExtensionProduct]);

  useEffect(() => {
    const hasVariants = getProductSaleMode(selectedBumperProduct) === 'varianted';
    const currentVariantId = form.getValues('bumperVariantId');
    const variantExists = bumperVariantOptions.some((variant) => variant.value === currentVariantId);
    if (!hasVariants && currentVariantId) {
      form.setValue('bumperVariantId', '', { shouldValidate: true });
      return;
    }
    if (hasVariants && !variantExists) {
      form.setValue('bumperVariantId', resolveDefaultVariantId(selectedBumperProduct), { shouldValidate: true });
    }
  }, [bumperVariantOptions, form, selectedBumperProduct]);

  const selectedMaterials = [
    needsTip && values.tipProductId
      ? { productId: values.tipProductId, variantId: values.tipVariantId || undefined }
      : null,
    needsFerrule && values.ferruleProductId
      ? { productId: values.ferruleProductId, variantId: values.ferruleVariantId || undefined }
      : null,
    allowsSuppressor && values.includeSuppressor && values.suppressorProductId
      ? { productId: values.suppressorProductId, variantId: values.suppressorVariantId || undefined }
      : null,
    needsExtension && values.extensionProductId
      ? { productId: values.extensionProductId, variantId: values.extensionVariantId || undefined }
      : null,
    needsExtension && values.bumperProductId
      ? { productId: values.bumperProductId, variantId: values.bumperVariantId || undefined }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const materialSummary = selectedMaterials.map(({ productId, variantId }) => {
    const product = products.find((item) => item.id === productId);
    const selectedVariant = variantId ? product?.variants?.find((variant) => variant.id === variantId) : undefined;
    const unitCost = product
      ? variantId
        ? getVariantOrProductRealUnitCost(purchases, product.id, variantId)
        : getProductRealUnitCost(purchases, product.id)
      : 0;
    const stock = product
      ? variantId
        ? getProductVariantStock(product, variantId, movements)
        : getStoredProductStock(product)
      : 0;
    return {
      productId: `${productId}::${variantId ?? ''}`,
      name: product?.name ?? 'Producto',
      variantLabel: selectedVariant ? buildVariantDisplayName(selectedVariant, product?.variantAttributes) : '',
      unitCost,
      stock,
    };
  });

  const totalMaterialCost = materialSummary.reduce((sum, item) => sum + item.unitCost, 0);
  const operationalCost = Math.max(Number(values.serviceCost) || 0, 0);
  const estimatedTotalCost = totalMaterialCost + operationalCost;
  const estimatedProfit = (Number(values.servicePrice) || 0) - estimatedTotalCost;

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title="Registrar servicio de torno"
      busy={isSubmitting}
      busyTitle="Guardando servicio..."
      busyDescription="Espera la confirmacion. Se esta registrando el servicio y descontando inventario."
      description="Registra el valor del trabajo y descuenta del inventario los productos usados en el servicio."
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form={serviceFormId} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : submitLabel ?? 'Guardar servicio'}
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={serviceFormId}
            onSubmit={form.handleSubmit(async (submittedValues) => {
              await onSubmit(submittedValues);
              form.reset(initialValues ?? defaultValues);
            })}
            className="space-y-6"
          >
            <div className="grid gap-4 rounded-3xl border border-border bg-card/88 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-[0_18px_40px_rgba(2,6,23,0.22)] sm:grid-cols-2 sm:p-5">
              <FormField
                control={form.control}
                name="serviceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de servicio</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {serviceTypeOptions.map((value) => (
                          <SelectItem key={value} value={value}>
                            {serviceTypeLabels[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="performedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha del servicio</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serviceCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria del servicio</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: torno" {...field} readOnly />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {values.serviceType === 'custom-turning' && (
                <FormField
                  control={form.control}
                  name="serviceLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trabajo realizado</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: instalacion de virola con supresor de impacto" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del cliente" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cueReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taco o referencia</FormLabel>
                    <FormControl>
                      <Input placeholder="Ejemplo: taco Cuetec de Juan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            <div className="grid gap-4 rounded-3xl border border-border bg-muted/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 lg:grid-cols-2 sm:p-5">
              {needsTip && (
                <FormField
                  control={form.control}
                  name="tipProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Casquillo</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          const nextProduct = products.find((product) => product.id === value);
                          form.setValue('tipVariantId', resolveDefaultVariantId(nextProduct), { shouldValidate: true });
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona el casquillo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tipOptions.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {needsTip && getProductSaleMode(selectedTipProduct) === 'varianted' && (
                <FormField
                  control={form.control}
                  name="tipVariantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{selectedTipProduct?.variantLabel || 'Variante del casquillo'}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona la variante" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tipVariantOptions.map((variant) => (
                            <SelectItem key={variant.value} value={variant.value}>
                              {variant.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {needsFerrule && (
                <FormField
                  control={form.control}
                  name="ferruleProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Virola</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          const nextProduct = products.find((product) => product.id === value);
                          form.setValue('ferruleVariantId', resolveDefaultVariantId(nextProduct), { shouldValidate: true });
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona la virola" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ferruleOptions.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {needsFerrule && getProductSaleMode(selectedFerruleProduct) === 'varianted' && (
                <FormField
                  control={form.control}
                  name="ferruleVariantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{selectedFerruleProduct?.variantLabel || 'Variante de la virola'}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona la variante" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ferruleVariantOptions.map((variant) => (
                            <SelectItem key={variant.value} value={variant.value}>
                              {variant.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {needsExtension && (
                <>
                  <FormField
                    control={form.control}
                    name="extensionProductId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Extension</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            const nextProduct = products.find((product) => product.id === value);
                            form.setValue('extensionVariantId', resolveDefaultVariantId(nextProduct), { shouldValidate: true });
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona la extension" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {extensionOptions.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {getProductSaleMode(selectedExtensionProduct) === 'varianted' && (
                    <FormField
                      control={form.control}
                      name="extensionVariantId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{selectedExtensionProduct?.variantLabel || 'Variante de la extension'}</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona la variante" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {extensionVariantOptions.map((variant) => (
                                <SelectItem key={variant.value} value={variant.value}>
                                  {variant.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="bumperProductId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parachoque</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            const nextProduct = products.find((product) => product.id === value);
                            form.setValue('bumperVariantId', resolveDefaultVariantId(nextProduct), { shouldValidate: true });
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona el parachoque" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {bumperOptions.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {getProductSaleMode(selectedBumperProduct) === 'varianted' && (
                    <FormField
                      control={form.control}
                      name="bumperVariantId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{selectedBumperProduct?.variantLabel || 'Variante del parachoque'}</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona la variante" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {bumperVariantOptions.map((variant) => (
                                <SelectItem key={variant.value} value={variant.value}>
                                  {variant.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}

              {allowsSuppressor && (
                <div className="space-y-3 lg:col-span-2">
                  <FormField
                    control={form.control}
                    name="includeSuppressor"
                    render={({ field }) => (
                      <FormItem className="rounded-2xl border border-border bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/72 sm:p-4">
                        <div className="flex items-center gap-3">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                          </FormControl>
                          <div>
                            <FormLabel>Agregar supresor</FormLabel>
                            <p className="hidden text-sm text-muted-foreground sm:block">Activalo si este trabajo tambien lleva supresor.</p>
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />

                  {values.includeSuppressor && (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="suppressorProductId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Supresor</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                const nextProduct = products.find((product) => product.id === value);
                                form.setValue('suppressorVariantId', resolveDefaultVariantId(nextProduct), { shouldValidate: true });
                              }}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona el supresor" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {suppressorOptions.map((product) => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {getProductSaleMode(selectedSuppressorProduct) === 'varianted' ? (
                        <FormField
                          control={form.control}
                          name="suppressorVariantId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{selectedSuppressorProduct?.variantLabel || 'Variante del supresor'}</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona la variante" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {suppressorVariantOptions.map((variant) => (
                                    <SelectItem key={variant.value} value={variant.value}>
                                      {variant.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 rounded-3xl border border-cyan-200/70 bg-cyan-50/70 p-3.5 dark:border-cyan-900/60 dark:bg-cyan-950/18 lg:grid-cols-[1.1fr_0.9fr] sm:p-5">
              <div className="space-y-3.5 sm:space-y-4">
                <FormField
                  control={form.control}
                  name="servicePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor del servicio</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serviceCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo del servicio</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea rows={4} placeholder="Observaciones del trabajo realizado" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-3xl border border-border bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/72 sm:p-4">
                <p className="text-sm font-semibold text-foreground">Resumen del servicio</p>
                <div className="mt-4 space-y-3">
                  {materialSummary.length > 0 ? (
                    materialSummary.map((item) => (
                      <div key={item.productId} className="rounded-2xl border border-border/70 bg-background/88 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="font-medium text-foreground">{item.name}</p>
                        {item.variantLabel ? <p className="text-muted-foreground">{item.variantLabel}</p> : null}
                        <p className="text-muted-foreground">Stock: {formatNumber(item.stock)} uds</p>
                        {!hideFinancialSummary ? (
                          <p className="text-muted-foreground">Costo real: {formatCurrency(item.unitCost)}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="hidden text-sm text-muted-foreground sm:block">
                      {hideFinancialSummary
                        ? 'Selecciona los insumos para revisar disponibilidad y registrar el trabajo.'
                        : 'Selecciona los insumos para calcular el costo del trabajo.'}
                    </p>
                  )}

                  <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                    <p className="text-sm">Valor servicio: {formatCurrency(Number(values.servicePrice) || 0)}</p>
                    <p className="mt-1 text-sm">Costo operativo: {formatCurrency(operationalCost)}</p>
                    {!hideFinancialSummary ? <p className="mt-1 text-sm">Costo materiales: {formatCurrency(totalMaterialCost)}</p> : null}
                    <p className="mt-1 text-sm">Costo total: {formatCurrency(estimatedTotalCost)}</p>
                    <p className="mt-2 text-lg font-semibold">Utilidad estimada: {formatCurrency(estimatedProfit)}</p>
                    <p className="mt-2 text-sm text-slate-300">El sistema descontara automaticamente los materiales del inventario.</p>
                  </div>
                </div>
              </div>
            </div>

          </form>
        </Form>
    </AdminResponsiveDialog>
  );
}
