'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, ReceiptText, Search, Trash2 } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { PurchaseFormDialog, type PurchaseFormValues } from '@/components/admin/purchases/purchase-form-dialog';
import { useAdminData } from '@/components/admin/admin-data-context';
import { calculateUnitProfit, formatCurrency, formatNumber, getProductById } from '@/lib/admin/calculations';
import { useToast } from '@/hooks/use-toast';

export default function ComprasPage() {
  const { purchases, products, suppliers, registerPurchase, updatePurchase, updatePurchaseBatch, deletePurchase, deletePurchaseBatch } = useAdminData();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [query, setQuery] = useState('');
  const [editingBatchId, setEditingBatchId] = useState<string | undefined>();
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | undefined>();
  const [editingValues, setEditingValues] = useState<PurchaseFormValues | undefined>();

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      const product = getProductById(products, purchase.productId);
      return `${product?.name ?? ''} ${purchase.supplier}`
        .toLowerCase()
        .includes(query.toLowerCase());
    });
  }, [products, purchases, query]);

  const totalInvestment = filteredPurchases.reduce(
    (accumulator, purchase) => accumulator + purchase.totalInvestment,
    0
  );
  const totalPurchaseValue = filteredPurchases.reduce(
    (accumulator, purchase) => accumulator + purchase.purchaseValueTotal,
    0
  );
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
        totalInvestment: number;
        totalShipping: number;
        items: typeof filteredPurchases;
      }
    >();

    filteredPurchases.forEach((purchase) => {
      const key = purchase.purchaseBatchId ?? `${purchase.supplier}-${purchase.purchasedAt}`;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(purchase);
        existing.totalPurchaseValue += purchase.purchaseValueTotal;
        existing.totalInvestment += purchase.totalInvestment;
        existing.totalShipping += purchase.shippingValueTotal;
        return;
      }

      groups.set(key, {
        key,
        batchId: purchase.purchaseBatchId,
        supplier: purchase.supplier,
        source: purchase.source ?? 'purchase',
        purchasedAt: purchase.purchasedAt,
        totalPurchaseValue: purchase.purchaseValueTotal,
        totalInvestment: purchase.totalInvestment,
        totalShipping: purchase.shippingValueTotal,
        items: [purchase],
      });
    });

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()
    );
  }, [filteredPurchases]);

  const buildInitialValues = (groupItems: typeof filteredPurchases): PurchaseFormValues => ({
    supplierId: groupItems[0]?.supplierId ?? '',
    supplier: groupItems[0]?.supplier ?? '',
    purchasedAt: new Date(groupItems[0]?.purchasedAt ?? new Date().toISOString()).toISOString().slice(0, 10),
    shippingValueTotal: groupItems.reduce((sum, item) => sum + item.shippingValueTotal, 0),
    items: groupItems.map((item) => {
      const product = getProductById(products, item.productId);
      return {
        productId: item.productId,
        presentationQuantity: item.presentationQuantity,
        purchaseUnitValue: item.purchaseUnitValue,
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
        description: 'Revisa la configuracion y permisos de Firebase.',
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
        description: 'Revisa la configuracion y permisos de Firebase.',
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
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Valor total de la compra</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(totalPurchaseValue)}</p>
          <p className="mt-2 text-sm text-slate-500">
            Suma del valor de compra de los productos, sin incluir envio.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Inversion total</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(totalInvestment)}</p>
          <p className="mt-2 text-sm text-slate-500">
            Suma de compra y envio prorrateado en las compras filtradas.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Pedidos registrados</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {formatNumber(groupedPurchases.length)}
          </p>
          <p className="mt-2 text-sm text-slate-500">Cada pedido puede incluir varios productos del mismo proveedor.</p>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:col-span-2 sm:p-6 xl:col-span-1">
          <p className="text-sm text-emerald-800">Regla financiera activa</p>
          <p className="mt-3 text-lg font-semibold text-emerald-950">
            (valor_total_compra + valor_total_envio) / cantidad_comprada
          </p>
          <p className="mt-2 text-sm text-emerald-900">
            El resultado se guarda como costo unitario real y afecta el inventario.
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por producto o proveedor"
            className="pl-9"
          />
        </div>

        {groupedPurchases.length > 0 ? (
          <div className="space-y-4">
            {groupedPurchases.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-3xl border border-slate-200">
                <div className="flex flex-col gap-4 bg-slate-50 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{group.supplier}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(group.purchasedAt).toLocaleDateString('es-CO')} · {group.items.length} productos
                    </p>
                    {group.source === 'initial-load' ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Registro creado como carga inicial sin soporte.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <div className="rounded-2xl bg-white px-3 py-2 text-slate-600">
                      Valor compra: <span className="font-semibold text-slate-900">{formatCurrency(group.totalPurchaseValue)}</span>
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

                <div className="relative z-0 w-full overflow-x-auto rounded-b-3xl">
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
                        <TableHead className="text-right">Acciones</TableHead>
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
                        return (
                          <TableRow key={purchase.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-slate-900">{product?.name}</p>
                                <p className="text-xs text-slate-500">{product?.brand}</p>
                              </div>
                            </TableCell>
                            <TableCell>{formatNumber(purchase.quantityPurchased)} uds</TableCell>
                            <TableCell>{formatCurrency(purchase.purchaseValueTotal)}</TableCell>
                            <TableCell>{formatCurrency(purchase.shippingValueTotal)}</TableCell>
                            <TableCell>{formatCurrency(purchase.totalInvestment)}</TableCell>
                            <TableCell>{formatCurrency(purchase.realUnitCost)}</TableCell>
                            <TableCell>{formatCurrency(currentSuggestedSalePrice)}</TableCell>
                            <TableCell>{formatCurrency(unitProfit)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleEditItem(purchase.id)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleDeleteItem(purchase.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
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
              purchasedAt: new Date(values.purchasedAt).toISOString(),
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
              description: 'Revisa la configuracion y permisos de Firebase.',
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />
    </div>
  );
}
