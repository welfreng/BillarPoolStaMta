'use client';

import { useMemo, useState } from 'react';
import { Plus, ReceiptText, Search } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { PurchaseFormDialog } from '@/components/admin/purchases/purchase-form-dialog';
import { useAdminData } from '@/components/admin/admin-data-context';
import { formatCurrency, formatNumber, getProductById } from '@/lib/admin/calculations';
import { useToast } from '@/hooks/use-toast';

export default function ComprasPage() {
  const { purchases, products, registerPurchase } = useAdminData();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [query, setQuery] = useState('');

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

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Compras e inversion"
        title="Costo real por compra"
        description="Cada compra calcula el costo unitario real con compra + envio, impacta el producto y mantiene trazabilidad financiera sobre el inventario."
        actions={
          <Button onClick={() => setOpenDialog(true)} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> Registrar compra
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Inversion total</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(totalInvestment)}</p>
          <p className="mt-2 text-sm text-slate-500">
            Suma de compra y envio prorrateado en las compras filtradas.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Compras registradas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {formatNumber(filteredPurchases.length)}
          </p>
          <p className="mt-2 text-sm text-slate-500">Historial listo para integrarse con proveedores reales.</p>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <p className="text-sm text-emerald-800">Regla financiera activa</p>
          <p className="mt-3 text-lg font-semibold text-emerald-950">
            (valor_total_compra + valor_total_envio) / cantidad_comprada
          </p>
          <p className="mt-2 text-sm text-emerald-900">
            El resultado se guarda como costo unitario real y afecta el inventario.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por producto o proveedor"
            className="pl-9"
          />
        </div>

        {filteredPurchases.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Cantidad base</TableHead>
                <TableHead>Inversion</TableHead>
                <TableHead>Costo unitario real</TableHead>
                <TableHead>Precio sugerido</TableHead>
                <TableHead>Margen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPurchases.map((purchase) => {
                const product = getProductById(products, purchase.productId);
                return (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{product?.name}</p>
                        <p className="text-xs text-slate-500">{product?.sku}</p>
                      </div>
                    </TableCell>
                    <TableCell>{purchase.supplier}</TableCell>
                    <TableCell>{formatNumber(purchase.quantityPurchased)} uds</TableCell>
                    <TableCell>{formatCurrency(purchase.totalInvestment)}</TableCell>
                    <TableCell>{formatCurrency(purchase.realUnitCost)}</TableCell>
                    <TableCell>{formatCurrency(purchase.suggestedSalePrice)}</TableCell>
                    <TableCell>{purchase.estimatedMargin.toFixed(1)}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
        onOpenChange={setOpenDialog}
        products={products}
        onSubmit={(values) => {
          registerPurchase({
            ...values,
            purchasedAt: new Date(values.purchasedAt).toISOString(),
          });
          setOpenDialog(false);
          toast({
            title: 'Compra registrada',
            description: 'El costo real y el stock ya fueron actualizados.',
          });
        }}
      />
    </div>
  );
}
