'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, ReceiptText, Search, Trash2 } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { PurchaseFormDialog, type PurchaseFormValues } from '@/components/admin/purchases/purchase-form-dialog';
import { ResponsiveRowActions } from '@/components/admin/shared/responsive-row-actions';
import { useAdminData } from '@/components/admin/admin-data-context';
import {
  calculateUnitProfit,
  formatCurrency,
  formatNumber,
  getOperationalProductRealUnitCost,
  getOperationalProductStock,
  getProductById,
} from '@/lib/admin/calculations';
import { getDateKeyInBogota, getTodayDateInputValue, toOperationalDateISOString } from '@/lib/admin/date-utils';
import { getFriendlyFirestoreWriteErrorMessage } from '@/lib/firestore-write-retry';
import { useToast } from '@/hooks/use-toast';

export default function ComprasPage() {
  const { purchases, products, suppliers, registerPurchase, updatePurchase, updatePurchaseBatch, deletePurchase, deletePurchaseBatch } = useAdminData();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [query, setQuery] = useState('');
  const [editingBatchId, setEditingBatchId] = useState<string | undefined>();
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | undefined>();
  const [editingValues, setEditingValues] = useState<PurchaseFormValues | undefined>();
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchasePageSize, setPurchasePageSize] = useState(20);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      const product = getProductById(products, purchase.productId);
      const supplierName =
        suppliers.find((supplier) => supplier.id === purchase.supplierId)?.name ?? purchase.supplier;
      return `${product?.name ?? ''} ${supplierName}`
        .toLowerCase()
        .includes(query.toLowerCase());
    });
  }, [products, purchases, query, suppliers]);

  const totalInvestment = filteredPurchases.reduce(
    (accumulator, purchase) => accumulator + purchase.totalInvestment,
    0
  );
  const totalRegisteredInvestment = purchases.reduce(
    (accumulator, purchase) => accumulator + purchase.totalInvestment,
    0
  );
  const totalPurchaseValue = filteredPurchases.reduce(
    (accumulator, purchase) => accumulator + purchase.purchaseValueTotal,
    0
  );
  const currentPhysicalInvestment = useMemo(
    () =>
      products.reduce((total, product) => {
        const stock = getOperationalProductStock(product, []);
        const realUnitCost = getOperationalProductRealUnitCost(product, purchases);
        return total + stock * realUnitCost;
      }, 0),
    [products, purchases]
  );
  const recoveredInvestment = Math.max(totalRegisteredInvestment - currentPhysicalInvestment, 0);
  const groupedPurchases = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        batchId?: string;
        supplier: string;
        source: 'purchase' | 'initial-load';
        purchasedAt: string;
        totalPurchaseValue: number;
        totalGrossPurchaseValue: number;
        totalDiscountValue: number;
        totalInvestment: number;
        totalShipping: number;
        items: typeof filteredPurchases;
      }
    >();

    filteredPurchases.forEach((purchase) => {
      const key = purchase.purchaseBatchId ?? `${purchase.supplierId ?? purchase.supplier}-${purchase.purchasedAt}`;
      const supplierName =
        suppliers.find((supplier) => supplier.id === purchase.supplierId)?.name ?? purchase.supplier;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(purchase);
        existing.totalPurchaseValue += purchase.purchaseValueTotal;
        existing.totalGrossPurchaseValue += purchase.purchaseGrossValueTotal ?? purchase.purchaseValueTotal;
        existing.totalDiscountValue += purchase.purchaseDiscountTotal ?? 0;
        existing.totalInvestment += purchase.totalInvestment;
        existing.totalShipping += purchase.shippingValueTotal;
        return;
      }

      groups.set(key, {
        key,
        batchId: purchase.purchaseBatchId,
        supplier: supplierName,
        source: purchase.source ?? 'purchase',
        purchasedAt: purchase.purchasedAt,
        totalPurchaseValue: purchase.purchaseValueTotal,
        totalGrossPurchaseValue: purchase.purchaseGrossValueTotal ?? purchase.purchaseValueTotal,
        totalDiscountValue: purchase.purchaseDiscountTotal ?? 0,
        totalInvestment: purchase.totalInvestment,
        totalShipping: purchase.shippingValueTotal,
        items: [purchase],
      });
    });

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()
    );
  }, [filteredPurchases, suppliers]);
  const purchaseTotalPages = Math.max(Math.ceil(groupedPurchases.length / purchasePageSize), 1);
  const purchasePageStart = groupedPurchases.length === 0 ? 0 : (purchasePage - 1) * purchasePageSize + 1;
  const purchasePageEnd = Math.min(purchasePage * purchasePageSize, groupedPurchases.length);
  const paginatedPurchaseGroups = useMemo(
    () => groupedPurchases.slice((purchasePage - 1) * purchasePageSize, purchasePage * purchasePageSize),
    [groupedPurchases, purchasePage, purchasePageSize]
  );

  useEffect(() => {
    setPurchasePage(1);
  }, [query, purchasePageSize]);

  useEffect(() => {
    setPurchasePage((currentPage) => Math.min(currentPage, purchaseTotalPages));
  }, [purchaseTotalPages]);

  const buildInitialValues = (groupItems: typeof filteredPurchases): PurchaseFormValues => ({
    purchaseType: groupItems[0]?.purchaseType === 'international' ? 'international' : 'local',
    supplierId: groupItems[0]?.supplierId ?? '',
    supplier:
      suppliers.find((supplier) => supplier.id === groupItems[0]?.supplierId)?.name ??
      groupItems[0]?.supplier ??
      '',
    purchasedAt: groupItems[0]?.purchasedAt ? getDateKeyInBogota(groupItems[0].purchasedAt) : getTodayDateInputValue(),
    discountPercent: groupItems[0]?.purchaseDiscountPercent ?? 0,
    shippingValueTotal: groupItems.reduce((sum, item) => sum + item.shippingValueTotal, 0),
    internationalVendorName: groupItems[0]?.internationalVendorName ?? '',
    productsValueUsd: groupItems[0]?.productsValueUsd ?? 0,
    shippingValueUsd: groupItems[0]?.shippingValueUsd ?? 0,
    platformFeePercent: groupItems[0]?.platformFeePercent ?? 2.99,
    usdToCopRate: groupItems[0]?.usdToCopRate ?? 0,
    customsTaxCop: groupItems[0]?.customsTaxCop ?? 0,
    items: groupItems.map((item) => {
      const product = getProductById(products, item.productId);
      return {
        productId: item.productId,
        variantId: item.variantId ?? '',
        presentationQuantity: item.presentationQuantity,
        purchaseUnitValue: item.purchaseUnitValue,
        purchaseUnitValueUsd:
          item.purchaseUnitValueUsd && Number(item.purchaseUnitValueUsd) > 0
            ? Number(item.purchaseUnitValueUsd)
            : (groupItems[0]?.purchaseType === 'international' && Number(groupItems[0]?.usdToCopRate ?? 0) > 0)
              ? Number((item.purchaseUnitValue / Number(groupItems[0]?.usdToCopRate ?? 1)).toFixed(6))
              : 0,
        suggestedSalePrice: product?.salePrice ?? item.suggestedSalePrice,
      };
    }),
  });

  const handleEditGroup = (group: (typeof groupedPurchases)[number]) => {
    setEditingBatchId(group.batchId);
    setEditingPurchaseId(undefined);
    setEditingValues(buildInitialValues(group.items));
    setOpenDialog(true);
  };

  const handleEditItem = (purchaseId: string) => {
    const target = purchases.find((item) => item.id === purchaseId);
    if (!target) return;

    setEditingBatchId(undefined);
    setEditingPurchaseId(target.id);
    setEditingValues(buildInitialValues([target]));
    setOpenDialog(true);
  };

  const resetEditingState = () => {
    setEditingBatchId(undefined);
    setEditingPurchaseId(undefined);
    setEditingValues(undefined);
  };

  const handleDeleteGroup = async (group: (typeof groupedPurchases)[number]) => {
    if (!window.confirm(`Deseas eliminar la compra del proveedor ${group.supplier}?`)) return;

    try {
      if (group.batchId) {
        await deletePurchaseBatch(group.batchId);
      } else {
        await Promise.all(group.items.map((item) => deletePurchase(item.id)));
      }
      toast({
        title: 'Compra eliminada',
        description: 'El pedido y sus productos fueron eliminados.',
      });
    } catch (error) {
      console.error('Error eliminando compra agrupada:', error);
      toast({
        title: 'No se pudo eliminar la compra',
        description: getFriendlyFirestoreWriteErrorMessage(
          error,
          'Revisa la configuracion y permisos de Firebase.'
        ),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteItem = async (purchaseId: string) => {
    if (!window.confirm('Deseas eliminar este producto de la compra?')) return;

    try {
      await deletePurchase(purchaseId);
      toast({
        title: 'Producto eliminado',
        description: 'La linea de compra fue eliminada correctamente.',
      });
    } catch (error) {
      console.error('Error eliminando producto de compra:', error);
      toast({
        title: 'No se pudo eliminar el producto',
        description: getFriendlyFirestoreWriteErrorMessage(
          error,
          'Revisa la configuracion y permisos de Firebase.'
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Compras e inversion"
        title="Costo real por compra"
        description="Registra compras de forma simple, usando proveedores guardados, y deja calculado el costo real por unidad."
        actions={
          <Button onClick={() => setOpenDialog(true)} className="w-full rounded-xl sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Registrar compra
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 sm:gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_18px_40px_rgba(2,6,23,0.24)] sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Valor total de la compra</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatCurrency(totalPurchaseValue)}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Suma del valor de compra de los productos, sin incluir envio.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_18px_40px_rgba(2,6,23,0.24)] sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Inversion total</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatCurrency(totalInvestment)}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Suma de compra y envio prorrateado en las compras filtradas.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_18px_40px_rgba(2,6,23,0.24)] sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Pedidos registrados</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">
            {formatNumber(groupedPurchases.length)}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Cada pedido puede incluir varios productos del mismo proveedor.</p>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20 sm:col-span-2 sm:p-6 xl:col-span-1">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">Inversion fisica actual</p>
          <p className="mt-3 text-3xl font-semibold text-emerald-950 dark:text-emerald-50">
            {formatCurrency(currentPhysicalInvestment)}
          </p>
          <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">
            Valor del inventario que queda: stock actual por costo real unitario.
          </p>
          <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
            Recuperado o descargado: {formatCurrency(recoveredInvestment)}
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_18px_40px_rgba(2,6,23,0.24)] sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md lg:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por producto o proveedor"
              className="pl-9"
            />
          </div>
          {groupedPurchases.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/55 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {formatNumber(purchasePageStart)}-{formatNumber(purchasePageEnd)} de {formatNumber(groupedPurchases.length)} compras
              </p>
              <Select value={String(purchasePageSize)} onValueChange={(value) => setPurchasePageSize(Number(value))}>
                <SelectTrigger className="h-10 w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20 por pagina</SelectItem>
                  <SelectItem value="50">50 por pagina</SelectItem>
                  <SelectItem value="100">100 por pagina</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setPurchasePage((currentPage) => Math.max(currentPage - 1, 1))}
                  disabled={purchasePage <= 1}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setPurchasePage((currentPage) => Math.min(currentPage + 1, purchaseTotalPages))}
                  disabled={purchasePage >= purchaseTotalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {groupedPurchases.length > 0 ? (
          <div className="space-y-4">
            {paginatedPurchaseGroups.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-3xl border border-slate-200">
                <div className="flex flex-col gap-4 bg-slate-50 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.supplier}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(group.purchasedAt).toLocaleDateString('es-CO')} · {group.items.length} productos
                    </p>
                    {group.source === 'initial-load' ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Registro creado como carga inicial sin soporte.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <div className="rounded-2xl bg-white px-3 py-2 text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                      Valor compra: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(group.totalPurchaseValue)}</span>
                      {group.totalDiscountValue > 0 ? (
                        <span className="ml-1 text-xs text-emerald-700">
                          ({formatCurrency(group.totalGrossPurchaseValue)} - {formatCurrency(group.totalDiscountValue)})
                        </span>
                      ) : null}
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-slate-600">
                      Envio total: <span className="font-semibold text-slate-900">{formatCurrency(group.totalShipping)}</span>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-slate-600">
                      Inversion: <span className="font-semibold text-slate-900">{formatCurrency(group.totalInvestment)}</span>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleEditGroup(group)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar compra
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteGroup(group)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar compra
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 px-4 pb-4 md:hidden">
                  {group.items.map((purchase) => {
                    const product = getProductById(products, purchase.productId);
                    const currentSuggestedSalePrice = product?.salePrice ?? purchase.suggestedSalePrice;
                    const unitProfit = calculateUnitProfit(purchase.realUnitCost, currentSuggestedSalePrice);

                    return (
                      <div key={purchase.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{product?.name}</p>
                            <p className="mt-1 text-sm text-slate-500">{product?.brand}</p>
                            <div className="mt-2 grid gap-1 text-sm text-slate-600">
                              <p>Cantidad: {formatNumber(purchase.quantityPurchased)} uds</p>
                              {Number(purchase.purchaseDiscountTotal ?? 0) > 0 ? (
                                <p>
                                  Compra: {formatCurrency(purchase.purchaseValueTotal)}
                                  <span className="text-emerald-700">
                                    {' '}desc. {formatCurrency(purchase.purchaseDiscountTotal ?? 0)}
                                  </span>
                                </p>
                              ) : null}
                              <p>Costo real: {formatCurrency(purchase.realUnitCost)}</p>
                              <p>Precio sugerido: {formatCurrency(currentSuggestedSalePrice)}</p>
                              <p>Utilidad: {formatCurrency(unitProfit)}</p>
                            </div>
                          </div>
                          <ResponsiveRowActions
                            actions={[
                              {
                                label: 'Editar',
                                icon: <Pencil className="h-4 w-4" />,
                                onClick: () => handleEditItem(purchase.id),
                              },
                              {
                                label: 'Eliminar',
                                icon: <Trash2 className="h-4 w-4" />,
                                onClick: () => handleDeleteItem(purchase.id),
                                destructive: true,
                              },
                            ]}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden px-4 pt-3 text-xs text-slate-500 md:block">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
                <div className="relative z-0 hidden w-full overflow-x-auto rounded-b-3xl md:block">
                  <Table className="min-w-[980px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Cantidad base</TableHead>
                        <TableHead>Compra</TableHead>
                        <TableHead>Envio asignado</TableHead>
                        <TableHead>Inversion</TableHead>
                        <TableHead>Costo unitario real</TableHead>
                        <TableHead>Precio sugerido</TableHead>
                        <TableHead>Utilidad</TableHead>
                        <TableHead className="sticky right-0 z-10 bg-slate-50/95 text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)] dark:bg-slate-900/95 dark:shadow-[-12px_0_16px_-16px_rgba(2,6,23,0.65)]">
                          Acciones
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {group.items.map((purchase) => {
                          const product = getProductById(products, purchase.productId);
                          const currentSuggestedSalePrice = product?.salePrice ?? purchase.suggestedSalePrice;
                          const unitProfit = calculateUnitProfit(
                            purchase.realUnitCost,
                            currentSuggestedSalePrice
                          );
                          const rowHoverSummary = [
                            product?.name ?? 'Producto',
                            `Cantidad: ${formatNumber(purchase.quantityPurchased)} uds`,
                            `Compra neta: ${formatCurrency(purchase.purchaseValueTotal)}`,
                            Number(purchase.purchaseDiscountTotal ?? 0) > 0
                              ? `Descuento: ${formatCurrency(purchase.purchaseDiscountTotal ?? 0)}`
                              : '',
                            `Envio: ${formatCurrency(purchase.shippingValueTotal)}`,
                            `Inversion: ${formatCurrency(purchase.totalInvestment)}`,
                            `Costo unitario real: ${formatCurrency(purchase.realUnitCost)}`,
                            `Precio sugerido: ${formatCurrency(currentSuggestedSalePrice)}`,
                            `Utilidad unitaria: ${formatCurrency(unitProfit)}`,
                          ].join('\n');
                          return (
                            <TableRow key={purchase.id} title={rowHoverSummary}>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-slate-900">{product?.name}</p>
                                <p className="text-xs text-slate-500">{product?.brand}</p>
                              </div>
                            </TableCell>
                            <TableCell>{formatNumber(purchase.quantityPurchased)} uds</TableCell>
                            <TableCell>
                              <div>
                                <p>{formatCurrency(purchase.purchaseValueTotal)}</p>
                                {Number(purchase.purchaseDiscountTotal ?? 0) > 0 ? (
                                  <p className="text-xs text-emerald-700">
                                    {formatCurrency(purchase.purchaseGrossValueTotal ?? purchase.purchaseValueTotal)}
                                    {' '}-
                                    {' '}{formatCurrency(purchase.purchaseDiscountTotal ?? 0)}
                                  </p>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>{formatCurrency(purchase.shippingValueTotal)}</TableCell>
                            <TableCell>{formatCurrency(purchase.totalInvestment)}</TableCell>
                            <TableCell>{formatCurrency(purchase.realUnitCost)}</TableCell>
                            <TableCell>{formatCurrency(currentSuggestedSalePrice)}</TableCell>
                            <TableCell>{formatCurrency(unitProfit)}</TableCell>
                            <TableCell className="sticky right-0 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur dark:bg-slate-950/95 dark:shadow-[-12px_0_16px_-16px_rgba(2,6,23,0.65)]">
                              <ResponsiveRowActions
                                actions={[
                                  {
                                    label: 'Editar',
                                    icon: <Pencil className="h-4 w-4" />,
                                    onClick: () => handleEditItem(purchase.id),
                                  },
                                  {
                                    label: 'Eliminar',
                                    icon: <Trash2 className="h-4 w-4" />,
                                    onClick: () => handleDeleteItem(purchase.id),
                                    destructive: true,
                                  },
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pagina {formatNumber(purchasePage)} de {formatNumber(purchaseTotalPages)}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setPurchasePage((currentPage) => Math.max(currentPage - 1, 1))}
                  disabled={purchasePage <= 1}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setPurchasePage((currentPage) => Math.min(currentPage + 1, purchaseTotalPages))}
                  disabled={purchasePage >= purchaseTotalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Empty className="border border-dashed border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptText className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No hay compras para mostrar</EmptyTitle>
              <EmptyDescription>
                Registra compras para empezar a valorizar la inversion y el costo real del inventario.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <PurchaseFormDialog
        open={openDialog}
        onOpenChange={(nextOpen) => {
          setOpenDialog(nextOpen);
          if (!nextOpen) resetEditingState();
        }}
        products={products}
        suppliers={suppliers}
        initialValues={editingValues}
        onSubmit={async (values) => {
          try {
            const payload = {
              ...values,
              purchasedAt: toOperationalDateISOString(values.purchasedAt),
            };
            const createdPurchases = editingPurchaseId
              ? [await updatePurchase(editingPurchaseId, payload)]
              : editingBatchId
                ? await updatePurchaseBatch(editingBatchId, payload)
                : await registerPurchase(payload);
            setOpenDialog(false);
            resetEditingState();
            toast({
              title: editingPurchaseId || editingBatchId ? 'Compra actualizada' : 'Compra registrada',
              description: editingPurchaseId
                ? 'El producto de la compra fue actualizado.'
                : editingBatchId
                ? `Se actualizaron ${createdPurchases.length} productos de la compra.`
                : `Se registraron ${createdPurchases.length} productos y el envio fue repartido automaticamente.`,
            });
          } catch (error) {
            console.error('Error registrando compra en Firestore:', error);
            toast({
              title: 'No se pudo registrar la compra',
              description: getFriendlyFirestoreWriteErrorMessage(
                error,
                'Revisa la configuracion y permisos de Firebase.'
              ),
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />
    </div>
  );
}
