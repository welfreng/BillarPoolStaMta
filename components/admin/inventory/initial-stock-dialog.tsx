'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Coins, PackageCheck, PlusCircle, ReceiptText } from 'lucide-react';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import type { Product } from '@/lib/admin/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { getTodayDateInputValue } from '@/lib/admin/date-utils';

export interface InitialStockBatchFormValues {
  productId: string;
  occurredAt: string;
  notes: string;
  items: Array<{
    variantId?: string;
    variantName?: string;
    quantity: number;
    estimatedUnitCost: number;
    suggestedSalePrice: number;
  }>;
}

type InitialStockLineDraft = {
  key: string;
  variantId?: string;
  variantName?: string;
  label: string;
  quantity: string;
  estimatedUnitCost: string;
  suggestedSalePrice: string;
};

const defaultNotes = 'Inventario inicial sin soporte ni proveedor confirmado.';

function createSimpleLine(product?: Product): InitialStockLineDraft[] {
  return [
    {
      key: 'simple',
      label: product?.name ?? 'Producto',
      quantity: '1',
      estimatedUnitCost: '0',
      suggestedSalePrice: String(Number(product?.salePrice ?? 0)),
    },
  ];
}

function createVariantLines(product?: Product): InitialStockLineDraft[] {
  return (product?.variants ?? []).map((variant, index) => ({
    key: variant.id || `variant-${index + 1}`,
    variantId: variant.id,
    variantName: variant.name,
    label: variant.displayName ?? variant.name,
    quantity: '',
    estimatedUnitCost: '0',
    suggestedSalePrice: String(Number(variant.salePrice ?? product?.salePrice ?? 0)),
  }));
}

export function InitialStockDialog({
  open,
  onOpenChange,
  products,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onSubmit: (values: InitialStockBatchFormValues) => Promise<void> | void;
}) {
  const initialStockFormId = useId();
  const [productId, setProductId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => getTodayDateInputValue());
  const [notes, setNotes] = useState(defaultNotes);
  const [lines, setLines] = useState<InitialStockLineDraft[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeProducts = useMemo(
    () => products.filter((product) => product.status === 'active'),
    [products]
  );
  const selectedProduct = activeProducts.find((product) => product.id === productId);
  const hasVariants = (selectedProduct?.variants?.length ?? 0) > 0;
  const linesWithTotals = useMemo(
    () =>
      lines.map((line) => {
        const quantity = Number(line.quantity || 0);
        const estimatedUnitCost = Number(line.estimatedUnitCost || 0);
        const suggestedSalePrice = Number(line.suggestedSalePrice || 0);
        return {
          ...line,
          parsedQuantity: Number.isFinite(quantity) ? quantity : 0,
          parsedEstimatedUnitCost: Number.isFinite(estimatedUnitCost) ? estimatedUnitCost : 0,
          parsedSuggestedSalePrice: Number.isFinite(suggestedSalePrice) ? suggestedSalePrice : 0,
          estimatedInvestment:
            (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(estimatedUnitCost) ? estimatedUnitCost : 0),
          estimatedSalesValue:
            (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(suggestedSalePrice) ? suggestedSalePrice : 0),
        };
      }),
    [lines]
  );
  const summaryTotals = useMemo(
    () =>
      linesWithTotals.reduce(
        (totals, line) => {
          totals.units += Math.max(line.parsedQuantity, 0);
          totals.estimatedInvestment += Math.max(line.estimatedInvestment, 0);
          totals.estimatedSalesValue += Math.max(line.estimatedSalesValue, 0);
          return totals;
        },
        {
          units: 0,
          estimatedInvestment: 0,
          estimatedSalesValue: 0,
        }
      ),
    [linesWithTotals]
  );

  useEffect(() => {
    if (!open) {
      setProductId('');
      setOccurredAt(getTodayDateInputValue());
      setNotes(defaultNotes);
      setLines([]);
      setErrorMessage('');
      setIsSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!selectedProduct) {
      setLines([]);
      return;
    }

    setLines(hasVariants ? createVariantLines(selectedProduct) : createSimpleLine(selectedProduct));
    setErrorMessage('');
  }, [hasVariants, selectedProduct]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorMessage('');

    if (!productId) {
      setErrorMessage('Selecciona un producto.');
      return;
    }
    if (!occurredAt) {
      setErrorMessage('Selecciona la fecha de carga.');
      return;
    }
    if (notes.trim().length < 6) {
      setErrorMessage('Agrega una nota breve sobre el origen del stock.');
      return;
    }

    const normalizedItems = lines
      .map((line) => ({
        variantId: line.variantId,
        variantName: line.variantName,
        quantity: Number(line.quantity || 0),
        estimatedUnitCost: Number(line.estimatedUnitCost || 0),
        suggestedSalePrice: Number(line.suggestedSalePrice || 0),
      }))
      .filter((line) => line.quantity > 0);

    if (normalizedItems.length === 0) {
      setErrorMessage(
        hasVariants
          ? 'Agrega al menos una variante con cantidad mayor a cero.'
          : 'La cantidad inicial debe ser mayor a cero.'
      );
      return;
    }

    const invalidLine = normalizedItems.find(
      (line) =>
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        !Number.isFinite(line.estimatedUnitCost) ||
        line.estimatedUnitCost < 0 ||
        !Number.isFinite(line.suggestedSalePrice) ||
        line.suggestedSalePrice < 0
    );

    if (invalidLine) {
      setErrorMessage('Revisa cantidades, costos y precios de venta. No se admiten valores negativos.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        productId,
        occurredAt,
        notes: notes.trim(),
        items: normalizedItems,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
      title="Cargar inventario inicial"
      busy={isSubmitting}
      busyTitle="Guardando carga inicial..."
      busyDescription="Espera la confirmacion para evitar duplicar el inventario inicial."
      description="Registra en una sola operacion el stock fisico inicial de un producto simple o varias variantes del mismo producto."
      desktopContentClassName="lg:max-w-5xl"
      footer={
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
          <div className="hidden min-w-[190px] rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60 md:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Unidades</p>
            <p className="font-semibold text-foreground">{summaryTotals.units.toLocaleString('es-CO')}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form={initialStockFormId} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar carga inicial'}
          </Button>
          </div>
        </div>
      }
    >
      <form id={initialStockFormId} onSubmit={handleSubmit} className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#071a3d_0%,#0d2b78_54%,#102b4e_100%)] text-white shadow-[0_18px_44px_rgba(8,22,47,0.22)] dark:border-slate-800">
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <div className="sm:col-span-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                <ReceiptText className="h-3.5 w-3.5" />
                Carga inicial
              </div>
              <p className="mt-3 line-clamp-1 text-xl font-semibold tracking-[-0.02em]">
                {selectedProduct?.name ?? 'Selecciona un producto'}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Unidades</p>
              <p className="mt-1 text-sm font-semibold">{summaryTotals.units.toLocaleString('es-CO')}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Inversion</p>
              <p className="mt-1 text-sm font-semibold">${summaryTotals.estimatedInvestment.toLocaleString('es-CO')}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Venta estimada</p>
              <p className="mt-1 text-sm font-semibold">${summaryTotals.estimatedSalesValue.toLocaleString('es-CO')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Producto</Label>
          <SearchableSelect
            value={productId}
            onChange={(value) => setProductId(value)}
            placeholder="Selecciona producto"
            searchPlaceholder="Buscar producto..."
            emptyLabel="No se encontraron productos."
            recentStorageKey="initial-stock-products"
            options={activeProducts.map((product) => ({
              value: product.id,
              label: `${product.name} - ${product.brand}`,
            }))}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="initial-stock-occurred-at">Fecha de carga</Label>
            <Input
              id="initial-stock-occurred-at"
              type="date"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="initial-stock-notes">Observacion</Label>
            <Textarea
              id="initial-stock-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ejemplo: inventario recibido antes de usar el sistema, sin factura ni proveedor confirmado."
            />
          </div>
        </div>

        {selectedProduct ? (
          <div className="rounded-2xl border border-slate-200 bg-card/92 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-slate-50">
                  <PackageCheck className="h-4 w-4 text-primary" />
                  {selectedProduct.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {hasVariants
                    ? 'Completa en una sola carga las variantes que realmente tienen stock inicial.'
                    : 'Completa la cantidad, el costo estimado y el precio de venta del producto.'}
                </p>
              </div>
              {hasVariants ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm dark:bg-slate-950/80 dark:text-slate-300">
                  <PlusCircle className="h-3.5 w-3.5" />
                  Variantes en un solo guardado
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {linesWithTotals.map((line, index) => (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/80 md:grid-cols-[minmax(0,1.4fr)_minmax(120px,0.75fr)_minmax(140px,0.95fr)_minmax(140px,0.95fr)_minmax(160px,1fr)]"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{line.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {hasVariants ? selectedProduct.variantLabel || 'Variante' : 'Producto simple'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`initial-stock-quantity-${index}`}>Cantidad</Label>
                    <Input
                      id={`initial-stock-quantity-${index}`}
                      type="number"
                      min="0"
                      value={line.quantity}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, quantity: event.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`initial-stock-cost-${index}`}>Costo estimado</Label>
                    <Input
                      id={`initial-stock-cost-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.estimatedUnitCost}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, estimatedUnitCost: event.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`initial-stock-price-${index}`}>Precio de venta</Label>
                    <Input
                      id={`initial-stock-price-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.suggestedSalePrice}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, suggestedSalePrice: event.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Resumen linea</Label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                      <p>Inversion: ${line.estimatedInvestment.toLocaleString('es-CO')}</p>
                      <p>Venta estimada: ${line.estimatedSalesValue.toLocaleString('es-CO')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 text-sm text-cyan-950 dark:border-cyan-900/40 dark:bg-cyan-950/20 dark:text-cyan-50 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-cyan-800/80 dark:text-cyan-200/80">Unidades</p>
                <p className="mt-1 text-lg font-semibold">{summaryTotals.units.toLocaleString('es-CO')}</p>
              </div>
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-cyan-800/80 dark:text-cyan-200/80">
                  <Coins className="h-3.5 w-3.5" />
                  Inversion estimada
                </p>
                <p className="mt-1 text-lg font-semibold">${summaryTotals.estimatedInvestment.toLocaleString('es-CO')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-cyan-800/80 dark:text-cyan-200/80">Venta estimada</p>
                <p className="mt-1 text-lg font-semibold">${summaryTotals.estimatedSalesValue.toLocaleString('es-CO')}</p>
              </div>
            </div>
          </div>
        ) : null}

        {errorMessage ? <p className="text-sm text-rose-600 dark:text-rose-300">{errorMessage}</p> : null}
      </form>
    </AdminResponsiveDialog>
  );
}
