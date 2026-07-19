'use client';

import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Gift, PackageCheck, ReceiptText } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatNumber, getStoredProductStock, getVariantOrProductRealUnitCost } from '@/lib/admin/calculations';
import { getTodayDateInputValue } from '@/lib/admin/date-utils';
import type { InventoryMovement, Product, Purchase } from '@/lib/admin/types';
import { getProductSaleMode, getProductVariantStock } from '@/lib/admin/variant-helpers';

const giftMovementSchema = z.object({
  productId: z.string().min(1, 'Selecciona el producto obsequiado'),
  variantId: z.string().default(''),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  occurredAt: z.string().min(1, 'Selecciona la fecha'),
  customerName: z.string().min(2, 'Ingresa el cliente o destinatario'),
  customerPhone: z.string().default(''),
  giftReason: z.enum(['fidelizacion', 'garantia-comercial', 'promocion', 'cortesia', 'otro']),
  notes: z.string().min(8, 'Agrega una nota breve para trazabilidad'),
  responsibleUser: z.string().min(2, 'Ingresa el responsable'),
});

export type GiftMovementFormValues = z.infer<typeof giftMovementSchema>;

const giftReasonLabels: Record<GiftMovementFormValues['giftReason'], string> = {
  fidelizacion: 'Fidelizacion',
  'garantia-comercial': 'Garantia comercial',
  promocion: 'Promocion',
  cortesia: 'Cortesia',
  otro: 'Otro',
};

function createDefaultValues(): GiftMovementFormValues {
  return {
    productId: '',
    variantId: '',
    quantity: 1,
    occurredAt: getTodayDateInputValue(),
    customerName: '',
    customerPhone: '',
    giftReason: 'cortesia',
    notes: '',
    responsibleUser: 'Administrador',
  };
}

export function GiftMovementDialog({
  open,
  onOpenChange,
  products,
  purchases,
  movements,
  responsibleUser,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  purchases: Purchase[];
  movements: InventoryMovement[];
  responsibleUser: string;
  onSubmit: (values: GiftMovementFormValues) => Promise<void> | void;
}) {
  const giftFormId = useId();
  const form = useForm<GiftMovementFormValues>({
    resolver: zodResolver(
      giftMovementSchema.superRefine((values, ctx) => {
        const selectedProduct = products.find((product) => product.id === values.productId);
        if (!selectedProduct) return;

        if (getProductSaleMode(selectedProduct) === 'varianted' && !values.variantId.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Selecciona la variante que vas a obsequiar.',
            path: ['variantId'],
          });
        }

        const availableStock =
          getProductSaleMode(selectedProduct) === 'varianted'
            ? getProductVariantStock(selectedProduct, values.variantId, movements)
            : getStoredProductStock(selectedProduct);
        if (Number(values.quantity) > availableStock) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Stock insuficiente. Disponible: ${formatNumber(availableStock)}.`,
            path: ['quantity'],
          });
        }
      })
    ),
    defaultValues: createDefaultValues(),
  });
  const isSubmitting = form.formState.isSubmitting;
  const selectedProductId = form.watch('productId');
  const selectedVariantId = form.watch('variantId');
  const selectedQuantity = Number(form.watch('quantity') || 0);
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const selectedVariantOptions = selectedProduct?.variants ?? [];
  const selectedUnitCost = selectedProduct
    ? getVariantOrProductRealUnitCost(purchases, selectedProduct.id, selectedVariantId || undefined)
    : 0;
  const selectedStock =
    selectedProduct && getProductSaleMode(selectedProduct) === 'varianted'
      ? getProductVariantStock(selectedProduct, selectedVariantId, movements)
      : selectedProduct
        ? getStoredProductStock(selectedProduct)
        : 0;
  const selectedTotalCost = selectedUnitCost * Math.max(selectedQuantity, 0);

  useEffect(() => {
    if (!open) return;
    form.reset({
      ...createDefaultValues(),
      responsibleUser,
    });
  }, [form, open, responsibleUser]);

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title="Registrar obsequio"
      description="Descuenta un producto entregado como cortesia sin crear una venta."
      busy={isSubmitting}
      busyTitle="Registrando obsequio..."
      busyDescription="Espera la confirmacion para evitar salidas duplicadas."
      desktopContentClassName="lg:max-w-3xl"
      footer={
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
          <div className="hidden min-w-[190px] rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60 md:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Costo obsequio</p>
            <p className="font-semibold text-foreground">{formatCurrency(selectedTotalCost)}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form={giftFormId} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Registrar obsequio'}
          </Button>
          </div>
        </div>
      }
    >
      <Form {...form}>
        <form
          id={giftFormId}
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values);
            form.reset({
              ...createDefaultValues(),
              responsibleUser,
            });
          })}
          className="space-y-4"
        >
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#071a3d_0%,#0d2b78_54%,#102b4e_100%)] text-white shadow-[0_18px_44px_rgba(8,22,47,0.22)] dark:border-slate-800">
            <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
              <div className="sm:col-span-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  <Gift className="h-3.5 w-3.5" />
                  Obsequio
                </div>
                <p className="mt-3 line-clamp-1 text-xl font-semibold tracking-[-0.02em]">
                  {selectedProduct?.name ?? 'Selecciona un producto'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Stock</p>
                <p className="mt-1 text-sm font-semibold">{formatNumber(selectedStock)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Cantidad</p>
                <p className="mt-1 text-sm font-semibold">{formatNumber(selectedQuantity || 0)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Costo</p>
                <p className="mt-1 text-sm font-semibold">{formatCurrency(selectedTotalCost)}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-border bg-card/92 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/78 sm:p-5 md:grid-cols-2">
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Producto obsequiado</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        form.setValue('variantId', '', { shouldValidate: true });
                      }}
                      placeholder="Selecciona producto"
                      searchPlaceholder="Buscar producto..."
                      emptyLabel="No se encontraron productos."
                      recentStorageKey="gift-products"
                      options={products
                        .filter((product) => product.status === 'active')
                        .map((product) => ({
                          value: product.id,
                          label: `${product.name} - ${product.brand}`,
                        }))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedVariantOptions.length > 0 ? (
              <FormField
                control={form.control}
                name="variantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{selectedProduct?.variantLabel || 'Variante'}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona variante" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedVariantOptions.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variant.name} ({formatNumber(getProductVariantStock(selectedProduct, variant.id, movements))})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="occurredAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente / destinatario</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del cliente" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono opcional</FormLabel>
                  <FormControl>
                    <Input placeholder="Opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="giftReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo comercial</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(giftReasonLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
              name="responsibleUser"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsable</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nota obligatoria</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Ejemplo: cortesia por cliente frecuente o reposicion comercial acordada."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/22 sm:grid-cols-3">
            <div>
              <Label className="inline-flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-200">
                <PackageCheck className="h-3.5 w-3.5" />
                Stock disponible
              </Label>
              <p className="mt-1 font-semibold text-emerald-950 dark:text-emerald-100">{formatNumber(selectedStock)}</p>
            </div>
            <div>
              <Label className="text-xs text-emerald-800 dark:text-emerald-200">Costo unitario real</Label>
              <p className="mt-1 font-semibold text-emerald-950 dark:text-emerald-100">{formatCurrency(selectedUnitCost)}</p>
            </div>
            <div>
              <Label className="inline-flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-200">
                <ReceiptText className="h-3.5 w-3.5" />
                Costo total obsequio
              </Label>
              <p className="mt-1 font-semibold text-emerald-950 dark:text-emerald-100">{formatCurrency(selectedTotalCost)}</p>
            </div>
          </div>
        </form>
      </Form>
    </AdminResponsiveDialog>
  );
}
