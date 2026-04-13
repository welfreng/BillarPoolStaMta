'use client';

import { useMemo, useState } from 'react';
import { Boxes, ClipboardList, Eye, Plus, Search } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { MovementReasonBadge } from '@/components/admin/shared/status-badges';
import { MovementFormDialog } from '@/components/admin/inventory/movement-form-dialog';
import { InitialStockDialog } from '@/components/admin/inventory/initial-stock-dialog';
import { SaleFormDialog, type SaleFormValues } from '@/components/admin/sales/sale-form-dialog';
import { SaleDetailsDialog } from '@/components/admin/sales/sale-details-dialog';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
import { movementReasonLabels, movementTypeLabels } from '@/lib/admin/catalogs';
import { toCategoryOptions } from '@/lib/admin/category-utils';
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  getProductById,
  getProductRealUnitCost,
  getProductStock,
  getStockAlert,
  getStockAlertLabel,
  getVariantOrProductRealUnitCost,
} from '@/lib/admin/calculations';
import { useToast } from '@/hooks/use-toast';
import type { StockAlert } from '@/lib/admin/types';

export default function InventarioPage() {
  const { categories, movements, products, purchases, sales, services, registerMovement, registerInitialStock, registerSale } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [openInitialStockDialog, setOpenInitialStockDialog] = useState(false);
  const [openSaleDialog, setOpenSaleDialog] = useState(false);
  const [selectedProductForSaleId, setSelectedProductForSaleId] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [productId, setProductId] = useState('all');
  const [category, setCategory] = useState('all');
  const [adminTab, setAdminTab] = useState<'movements' | 'stock'>('movements');
  const categoryOptions = useMemo(() => toCategoryOptions(categories), [categories]);
  const isSalesUser = role === 'sales';
  const selectedSale = selectedSaleId ? sales.find((sale) => sale.id === selectedSaleId) ?? null : null;
  const selectedProductForSale = selectedProductForSaleId
    ? products.find((product) => product.id === selectedProductForSaleId) ?? null
    : null;

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      const product = getProductById(products, movement.productId);
      if (!product) return false;
      const matchesQuery = `${product.name} ${movement.notes} ${movement.reason}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesType = type === 'all' || movement.type === type;
      const matchesProduct = productId === 'all' || movement.productId === productId;
      return matchesQuery && matchesType && matchesProduct;
    });
  }, [movements, productId, products, query, type]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesQuery = `${product.name} ${product.brand} ${product.category} ${product.subcategory}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesProduct = productId === 'all' || product.id === productId;
      const matchesCategory = category === 'all' || product.category === category;
      return matchesQuery && matchesProduct && matchesCategory && product.status === 'active';
    });
  }, [category, productId, products, query]);

  const inventorySummary = useMemo(() => {
    return filteredProducts.map((product) => {
      const stock = getProductStock(movements, product.id);
      const realUnitCost = getProductRealUnitCost(purchases, product.id);
      const alert = getStockAlert(product, movements);
      return {
        product,
        stock,
        realUnitCost,
        inventoryValue: stock * realUnitCost,
        alert,
      };
    });
  }, [filteredProducts, movements, purchases]);
  const variantInventorySummary = useMemo(() => {
    return filteredProducts.flatMap((product) =>
      (product.variants ?? []).map((variant) => {
        const stock = Math.max(Number(variant.stock ?? 0), 0);
        const unitCost = getVariantOrProductRealUnitCost(purchases, product.id, variant.id);
        return {
          product,
          variant,
          stock,
          unitCost,
          inventoryValue: stock * unitCost,
          alert: (stock <= 0 ? 'out' : 'healthy') as StockAlert,
        };
      })
    );
  }, [filteredProducts, purchases]);

  const totalInventoryUnits = inventorySummary.reduce((sum, item) => sum + item.stock, 0);
  const totalInventoryValue = inventorySummary.reduce((sum, item) => sum + item.inventoryValue, 0);
  const outOfStockCount = inventorySummary.filter((item) => item.alert === 'out').length;
  const totalVariantUnits = variantInventorySummary.reduce((sum, item) => sum + item.stock, 0);
  const totalVariantValue = variantInventorySummary.reduce((sum, item) => sum + item.inventoryValue, 0);
  const outOfStockVariantCount = variantInventorySummary.filter((item) => item.alert === 'out').length;
  const initialSaleValues: SaleFormValues | null = selectedProductForSale
    ? {
        soldAt: new Date().toISOString().slice(0, 10),
        items: [
          {
            productId: selectedProductForSale.id,
            variantId: '',
            quantity: 1,
            unitPrice: selectedProductForSale.salePrice,
            serviceItems: [],
            giftItems: [],
          },
        ],
        customerPhone: '',
        customerName: '',
        notes: '',
      }
    : null;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Control diario"
        title={isSalesUser ? 'Stock disponible para vender' : 'Inventario facil de entender'}
        description={
          isSalesUser
            ? 'Consulta rapidamente que productos hay disponibles, cuantas unidades quedan y cual es su precio de venta.'
            : 'Consulta el stock actual y el historial de movimientos desde una vista mas clara y practica.'
        }
        actions={
          !isSalesUser ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setOpenInitialStockDialog(true)}
                className="w-full rounded-xl sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" /> Carga inicial
              </Button>
              <Button onClick={() => setOpenDialog(true)} className="w-full rounded-xl sm:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Registrar movimiento
              </Button>
            </div>
          ) : null
        }
      />

      <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {isSalesUser ? (
          <>
            <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-[1.5fr_0.9fr]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por producto, marca o categoria"
                  className="pl-9"
                />
              </div>

              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Producto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredProducts.length > 0 ? (
              <div className="min-w-0">
                <div className="mb-2 hidden text-xs text-slate-500 md:block">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
                <div className="pb-2">
                  <Table className="min-w-[860px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Precio de venta</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="sticky right-0 z-10 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur">
                          Accion
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredProducts.map((product) => {
                          const stock = getProductStock(movements, product.id);
                          const alert = getStockAlert(product, movements);
                          const rowHoverSummary = [
                            product.name,
                            `Marca: ${product.brand}`,
                            `Categoria: ${product.category} / ${product.subcategory}`,
                            `Stock: ${formatNumber(stock)}`,
                            `Precio venta: ${formatCurrency(product.salePrice)}`,
                            `Estado: ${getStockAlertLabel(alert)}`,
                          ].join('\n');
                          return (
                            <TableRow key={product.id} title={rowHoverSummary}>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-slate-900">{product.name}</p>
                                <p className="text-xs text-slate-500">{product.brand}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p>{product.category}</p>
                                <p className="text-xs text-slate-500">{product.subcategory}</p>
                              </div>
                            </TableCell>
                            <TableCell>{formatNumber(stock)}</TableCell>
                            <TableCell>{formatCurrency(product.salePrice)}</TableCell>
                            <TableCell>
                              <span className={alert === 'out' ? 'font-medium text-rose-700' : 'font-medium text-emerald-700'}>
                                {getStockAlertLabel(alert)}
                              </span>
                            </TableCell>
                            <TableCell className="sticky right-0 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur">
                              <Button
                                type="button"
                                className="rounded-xl"
                                disabled={stock <= 0}
                                onClick={() => {
                                  setSelectedProductForSaleId(product.id);
                                  setOpenSaleDialog(true);
                                }}
                              >
                                Vender
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ClipboardList className="h-5 w-5" />
                  </EmptyMedia>
                  <EmptyTitle>No hay productos para esos filtros</EmptyTitle>
                  <EmptyDescription>
                    Ajusta la busqueda para consultar lo disponible en venta.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </>
        ) : (
          <Tabs value={adminTab} onValueChange={(value) => setAdminTab(value as 'movements' | 'stock')} className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5">
              <TabsTrigger
                value="movements"
                className="min-h-12 rounded-xl border border-transparent text-sm font-semibold text-slate-600 data-[state=active]:border-cyan-200 data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-900 data-[state=active]:shadow-sm"
              >
                <ClipboardList className="mr-2 h-4 w-4" />
                Movimientos
              </TabsTrigger>
              <TabsTrigger
                value="stock"
                className="min-h-12 rounded-xl border border-transparent text-sm font-semibold text-slate-600 data-[state=active]:border-emerald-200 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-900 data-[state=active]:shadow-sm"
              >
                <Boxes className="mr-2 h-4 w-4" />
                Stock actual
              </TabsTrigger>
            </TabsList>

            <div className={`grid gap-3 ${adminTab === 'movements' ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
              <div className={adminTab === 'movements' ? 'relative sm:col-span-2 xl:col-span-2' : 'relative sm:col-span-2 xl:col-span-1'}>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    adminTab === 'movements'
                      ? 'Buscar por producto, observacion o motivo'
                      : 'Buscar por producto, marca o subcategoria'
                  }
                  className="pl-9"
                />
              </div>

              {adminTab === 'movements' ? (
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las acciones</SelectItem>
                    <SelectItem value="entry">{movementTypeLabels.entry}</SelectItem>
                    <SelectItem value="exit">{movementTypeLabels.exit}</SelectItem>
                    <SelectItem value="adjustment">{movementTypeLabels.adjustment}</SelectItem>
                    <SelectItem value="purchase">{movementTypeLabels.purchase}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorias</SelectItem>
                    {categoryOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Producto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TabsContent value="movements" className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Historial de movimientos</p>
                <p className="hidden text-sm text-slate-500 sm:block">
                  Entradas, salidas y ajustes para revisar lo que ha pasado en el inventario.
                </p>
              </div>

              {filteredMovements.length > 0 ? (
                <div className="min-w-0">
                  <div className="mb-2 hidden text-xs text-slate-500 lg:block">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
                  <div className="pb-2">
                  <Table className="min-w-[860px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Responsable</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="sticky right-0 z-10 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur">
                          Detalle
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMovements.map((movement) => {
                          const product = getProductById(products, movement.productId);
                          const isReturn = movement.reason === 'return';
                          const relatedSale = movement.saleId
                            ? sales.find((sale) => sale.id === movement.saleId) ?? null
                          : null;
                        const movementCost = Math.abs(movement.quantity) * movement.relatedUnitCost;
                        const saleProfit = relatedSale
                          ? relatedSale.grossProfit - ((relatedSale.returnedSaleAmount ?? 0) - (relatedSale.returnedCostAmount ?? 0))
                          : 0;
                        const valueLabel =
                          movement.reason === 'sale' && relatedSale
                            ? 'Utilidad venta'
                            : movement.type === 'purchase' || movement.type === 'entry'
                              ? 'Costo entrada'
                              : movement.reason === 'return'
                                ? 'Costo retorno'
                                : 'Costo movimiento';
                        const valueColorClass =
                          movement.reason === 'sale' && relatedSale
                            ? saleProfit >= 0
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                            : movement.type === 'purchase'
                              ? 'text-amber-700'
                              : movement.type === 'entry'
                                ? 'text-cyan-700'
                                : movement.reason === 'return'
                                  ? 'text-sky-700'
                                  : 'text-slate-700';
                          const valueAmount =
                            movement.reason === 'sale' && relatedSale
                              ? saleProfit
                              : movementCost;
                          const rowHoverSummary = [
                            product?.name ?? 'Producto',
                            `Tipo: ${movementTypeLabels[movement.type]}`,
                            `Cantidad: ${movement.quantity > 0 ? '+' : ''}${formatNumber(movement.quantity)}`,
                            `Motivo: ${isReturn ? 'Devolucion' : movementReasonLabels[movement.reason]}`,
                            `Responsable: ${movement.responsibleUser}`,
                            `${valueLabel}: ${formatCurrency(valueAmount)}`,
                            `Fecha: ${formatDateTime(movement.occurredAt)}`,
                          ].join('\n');
                          return (
                            <TableRow
                              key={movement.id}
                              className={isReturn ? 'bg-amber-50/60' : undefined}
                              title={rowHoverSummary}
                            >
                              <TableCell>
                                <div>
                                  <p className="font-medium text-slate-900">{product?.name}</p>
                                <p className="text-xs text-slate-500">{product?.brand}</p>
                              </div>
                            </TableCell>
                            <TableCell>{movementTypeLabels[movement.type]}</TableCell>
                            <TableCell>
                              {movement.quantity > 0 ? '+' : ''}
                              {formatNumber(movement.quantity)}
                            </TableCell>
                            <TableCell>
                              {isReturn ? (
                                <div className="space-y-1">
                                  <MovementReasonBadge reason={movement.reason} />
                                  <p className="text-xs text-amber-700">Producto devuelto al inventario</p>
                                </div>
                              ) : (
                                movementReasonLabels[movement.reason]
                              )}
                            </TableCell>
                            <TableCell>{movement.responsibleUser}</TableCell>
                            <TableCell>
                              <div>
                                <p className={`font-semibold ${valueColorClass}`}>{formatCurrency(valueAmount)}</p>
                                <p className="text-xs text-slate-500">{valueLabel}</p>
                              </div>
                            </TableCell>
                            <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                            <TableCell className="sticky right-0 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur">
                              {relatedSale ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-xl"
                                  onClick={() => setSelectedSaleId(relatedSale.id)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-400">Sin detalle</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              ) : (
                <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ClipboardList className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyTitle>No hay movimientos para esos filtros</EmptyTitle>
                    <EmptyDescription>
                      Crea el primer movimiento o ajusta la busqueda para inspeccionar el historial.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>

            <TabsContent value="stock" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.94)_100%)] p-3.5 shadow-sm sm:p-4">
                  <p className="text-sm text-slate-500">Unidades por producto</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(totalInventoryUnits)}</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.94)_100%)] p-3.5 shadow-sm sm:p-4">
                  <p className="text-sm text-slate-500">Valor por producto</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(totalInventoryValue)}</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.94)_100%)] p-3.5 shadow-sm sm:p-4">
                  <p className="text-sm text-slate-500">Productos agotados</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(outOfStockCount)}</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.94)_100%)] p-3.5 shadow-sm sm:p-4">
                  <p className="text-sm text-slate-500">Unidades por variante</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(totalVariantUnits)}</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.94)_100%)] p-3.5 shadow-sm sm:p-4">
                  <p className="text-sm text-slate-500">Valor por variante</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(totalVariantValue)}</p>
                </div>
                <div className="rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.94)_100%)] p-3.5 shadow-sm sm:p-4">
                  <p className="text-sm text-slate-500">Variantes agotadas</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(outOfStockVariantCount)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-950">Stock actual por producto</p>
                <p className="hidden text-sm text-slate-500 sm:block">
                  Existencias reales, costo unitario y valor estimado del inventario por producto.
                </p>
              </div>

              {inventorySummary.length > 0 ? (
                <div className="min-w-0 space-y-6">
                  <div className="mb-2 hidden text-xs text-slate-500 lg:block">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
                  <div className="pb-2">
                  <Table className="min-w-[920px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Stock actual</TableHead>
                        <TableHead>Costo real</TableHead>
                        <TableHead>Valor inventario</TableHead>
                        <TableHead>Precio venta</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventorySummary.map(({ product, stock, realUnitCost, inventoryValue, alert }) => {
                        const rowHoverSummary = [
                          product.name,
                          `Marca: ${product.brand}`,
                          `Categoria: ${product.category} / ${product.subcategory}`,
                          `Stock actual: ${formatNumber(stock)}`,
                          `Costo real: ${formatCurrency(realUnitCost)}`,
                          `Valor inventario: ${formatCurrency(inventoryValue)}`,
                          `Precio venta: ${formatCurrency(product.salePrice)}`,
                          `Estado: ${getStockAlertLabel(alert)}`,
                        ].join('\n');

                        return (
                        <TableRow key={product.id} title={rowHoverSummary}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-900">{product.name}</p>
                              <p className="text-xs text-slate-500">{product.brand}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p>{product.category}</p>
                              <p className="text-xs text-slate-500">{product.subcategory}</p>
                            </div>
                          </TableCell>
                          <TableCell>{formatNumber(stock)}</TableCell>
                          <TableCell>{formatCurrency(realUnitCost)}</TableCell>
                          <TableCell>{formatCurrency(inventoryValue)}</TableCell>
                          <TableCell>{formatCurrency(product.salePrice)}</TableCell>
                          <TableCell>
                            <span className={alert === 'out' ? 'font-medium text-rose-700' : 'font-medium text-emerald-700'}>
                              {getStockAlertLabel(alert)}
                            </span>
                          </TableCell>
                        </TableRow>
                      )})}
                    </TableBody>
                  </Table>
                  </div>

                  {variantInventorySummary.length > 0 ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-950">Stock actual por variante</p>
                        <p className="hidden text-sm text-slate-500 sm:block">
                          Aqui si puedes ver precios, stock y agotados por cada combinacion real.
                        </p>
                      </div>
                      <div className="pb-2">
                        <Table className="min-w-[1080px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Producto</TableHead>
                              <TableHead>Variante</TableHead>
                              <TableHead>Categoria</TableHead>
                              <TableHead>Stock</TableHead>
                              <TableHead>Costo real</TableHead>
                              <TableHead>Valor inventario</TableHead>
                              <TableHead>Precio venta</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {variantInventorySummary.map(({ product, variant, stock, unitCost, inventoryValue, alert }) => (
                              <TableRow key={variant.id}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-slate-900">{product.name}</p>
                                    <p className="text-xs text-slate-500">{product.brand}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{variant.displayName ?? variant.name}</TableCell>
                                <TableCell>
                                  <div>
                                    <p>{product.category}</p>
                                    <p className="text-xs text-slate-500">{product.subcategory}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{formatNumber(stock)}</TableCell>
                                <TableCell>{formatCurrency(unitCost)}</TableCell>
                                <TableCell>{formatCurrency(inventoryValue)}</TableCell>
                                <TableCell>{formatCurrency(Number(variant.salePrice ?? product.salePrice ?? 0))}</TableCell>
                                <TableCell>
                                  <span className={alert === 'out' ? 'font-medium text-rose-700' : 'font-medium text-emerald-700'}>
                                    {getStockAlertLabel(alert)}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ClipboardList className="h-5 w-5" />
                    </EmptyMedia>
                    <EmptyTitle>No hay productos para esos filtros</EmptyTitle>
                    <EmptyDescription>
                      Ajusta la busqueda para ver el stock actual por producto.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {!isSalesUser ? (
        <>
          <InitialStockDialog
            open={openInitialStockDialog}
            onOpenChange={setOpenInitialStockDialog}
            products={products}
            onSubmit={async (values) => {
              try {
                await registerInitialStock({
                  ...values,
                  occurredAt: new Date(values.occurredAt).toISOString(),
                  responsibleUser:
                    profile?.nombre?.trim() || user?.displayName || user?.email || 'Administrador',
                });
                setOpenInitialStockDialog(false);
                toast({
                  title: 'Carga inicial registrada',
                  description: 'El inventario quedo cargado sin exigir proveedor ni soporte.',
                });
              } catch (error) {
                console.error('Error registrando carga inicial en Firestore:', error);
                toast({
                  title: 'No se pudo registrar la carga inicial',
                  description: 'Revisa la configuracion y permisos de Firebase.',
                  variant: 'destructive',
                });
                throw error;
              }
            }}
          />

          <MovementFormDialog
            open={openDialog}
            onOpenChange={setOpenDialog}
            products={products}
            onSubmit={async (values) => {
              try {
                await registerMovement({
                  ...values,
                  responsibleUser:
                    profile?.nombre?.trim() || user?.displayName || user?.email || values.responsibleUser,
                  relatedUnitCost: getProductRealUnitCost(purchases, values.productId),
                });
                setOpenDialog(false);
                toast({
                  title: 'Movimiento registrado',
                  description: 'El stock fue actualizado correctamente.',
                });
              } catch (error) {
                console.error('Error registrando movimiento en Firestore:', error);
                toast({
                  title: 'No se pudo registrar el movimiento',
                  description: 'Revisa la configuracion y permisos de Firebase.',
                  variant: 'destructive',
                });
                throw error;
              }
            }}
          />

          <SaleDetailsDialog
            open={Boolean(selectedSale)}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setSelectedSaleId(null);
              }
            }}
            sale={selectedSale}
            sales={sales}
            services={services}
            products={products}
          />
        </>
      ) : null}

      <SaleFormDialog
        open={openSaleDialog}
        onOpenChange={(nextOpen) => {
          setOpenSaleDialog(nextOpen);
          if (!nextOpen) {
            setSelectedProductForSaleId(null);
          }
        }}
        products={products}
        purchases={purchases}
        movements={movements}
        initialValues={initialSaleValues}
        mode="create"
        hideFinancialSummary
        onSubmit={async (values) => {
          try {
            await registerSale({
              ...values,
              soldAt: new Date(values.soldAt).toISOString(),
              actorRole: role ?? 'sales',
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            });
            setOpenSaleDialog(false);
            setSelectedProductForSaleId(null);
            toast({
              title: 'Venta registrada',
              description: 'La venta se registro desde inventario y el stock ya fue actualizado.',
            });
          } catch (error) {
            toast({
              title: 'No se pudo registrar la venta',
              description: error instanceof Error ? error.message : 'Verifica el stock disponible.',
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />
    </div>
  );
}
