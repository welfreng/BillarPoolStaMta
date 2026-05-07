'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, CornerUpLeft, Eye, LockKeyhole, MoreHorizontal, Pencil, Plus, Receipt, Search } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { SaleDetailsDialog } from '@/components/admin/sales/sale-details-dialog';
import { SaleFormDialog, type SaleFormValues } from '@/components/admin/sales/sale-form-dialog';
import { SaleReturnDialog, type SaleReturnFormValues } from '@/components/admin/sales/sale-return-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDateTime, formatNumber, getProductById, getProductStock } from '@/lib/admin/calculations';
import { toOperationalDateISOString } from '@/lib/admin/date-utils';
import { getFriendlyFirestoreWriteErrorMessage } from '@/lib/firestore-write-retry';
import { getSaleLineDisplayName } from '@/lib/admin/sale-line-display';
import type { AuthorizationRequest, AuthorizationRequestType } from '@/lib/admin/types';

function getAuthorizationTypeLabel(requestType: AuthorizationRequestType) {
  if (requestType === 'sale-return') return 'devolucion';
  if (requestType === 'sale-discount') return 'descuento';
  return 'edicion';
}

function buildDiscountRequestSummary(
  draftSalePayload: AuthorizationRequest['draftSalePayload'],
  products: ReturnType<typeof useAdminData>['products']
) {
  if (!draftSalePayload) return { lines: [], totalDiscount: 0 };

  const lines = draftSalePayload.items
    .map((item, index) => {
      const product = products.find((productItem) => productItem.id === item.productId);
      if (!product) return null;
      const suggestedUnitPrice = item.variantId
        ? Number(
            product.variants?.find((variant) => variant.id === item.variantId)?.salePrice ??
              product.salePrice ??
              0
          )
        : Number(product.salePrice ?? 0);
      const requestedUnitPrice = Number(item.unitPrice ?? 0);
      const unitDiscount = suggestedUnitPrice - requestedUnitPrice;
      if (unitDiscount <= 0) return null;

      return {
        key: `${item.productId}-${item.variantId ?? index}`,
        lineNumber: index + 1,
        productName: product.name,
        quantity: Number(item.quantity ?? 0),
        suggestedUnitPrice,
        requestedUnitPrice,
        lineDiscount: unitDiscount * Number(item.quantity ?? 0),
      };
    })
    .filter(
      (
        item
      ): item is {
        key: string;
        lineNumber: number;
        productName: string;
        quantity: number;
        suggestedUnitPrice: number;
        requestedUnitPrice: number;
        lineDiscount: number;
      } => Boolean(item)
    );

  return {
    lines,
    totalDiscount: lines.reduce((sum, line) => sum + line.lineDiscount, 0),
  };
}

function getPendingRequestForGroup(
  requests: AuthorizationRequest[],
  saleBatchId: string,
  requestType: AuthorizationRequestType
) {
  return requests.find(
    (request) =>
      request.saleBatchId === saleBatchId &&
      request.requestType === requestType &&
      request.status === 'pending'
  ) ?? null;
}

function getApprovedRequestForGroup(
  requests: AuthorizationRequest[],
  saleBatchId: string,
  requestType: AuthorizationRequestType
) {
  return requests.find(
    (request) =>
      request.saleBatchId === saleBatchId &&
      request.requestType === requestType &&
      request.status === 'approved'
  ) ?? null;
}

function getRejectedRequestForGroup(
  requests: AuthorizationRequest[],
  saleBatchId: string,
  requestType: AuthorizationRequestType
) {
  return requests.find(
    (request) =>
      request.saleBatchId === saleBatchId &&
      request.requestType === requestType &&
      request.status === 'rejected'
  ) ?? null;
}

function getSalesRowHighlightClass(input: {
  pendingEditRequest: AuthorizationRequest | null;
  pendingReturnRequest: AuthorizationRequest | null;
  approvedEditRequest: AuthorizationRequest | null;
  approvedReturnRequest: AuthorizationRequest | null;
  rejectedEditRequest: AuthorizationRequest | null;
  rejectedReturnRequest: AuthorizationRequest | null;
}) {
  if (input.rejectedReturnRequest || input.rejectedEditRequest) {
    return 'bg-rose-50/90 hover:bg-rose-100/70 dark:bg-rose-950/20 dark:hover:bg-rose-950/30';
  }
  if (input.pendingReturnRequest) {
    return 'bg-amber-50/90 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/30';
  }
  if (input.pendingEditRequest) {
    return 'bg-cyan-50/90 hover:bg-cyan-100/70 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/30';
  }
  if (input.approvedReturnRequest) {
    return 'bg-emerald-50/80 hover:bg-emerald-100/70 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30';
  }
  if (input.approvedEditRequest) {
    return 'bg-sky-50/80 hover:bg-sky-100/70 dark:bg-sky-950/20 dark:hover:bg-sky-950/30';
  }

  return '';
}

export default function VentasPage() {
  const {
    loading,
    sales,
    services,
    products,
    purchases,
    movements,
    registerSale,
    updateSaleBatch,
    registerSaleReturns,
    authorizationRequests,
    createAuthorizationRequest,
    completeAuthorizationRequest,
  } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingSaleBatchId, setEditingSaleBatchId] = useState<string | null>(null);
  const [returningSaleId, setReturningSaleId] = useState<string | null>(null);
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<'details' | 'invoice'>('details');
  const [query, setQuery] = useState('');
  const [authorizationDialogState, setAuthorizationDialogState] = useState<{
    saleBatchId: string;
    saleId: string;
    customerName: string;
    saleSummary: string;
    requestType: AuthorizationRequestType;
  } | null>(null);
  const [authorizationReason, setAuthorizationReason] = useState('');
  const [activeEditAuthorizationId, setActiveEditAuthorizationId] = useState<string | null>(null);
  const [activeReturnAuthorizationId, setActiveReturnAuthorizationId] = useState<string | null>(null);
  const isSalesUser = role === 'sales';

  const saleGroups = useMemo(() => {
    const groups = new Map<string, { key: string; sales: typeof sales }>();
    sales.forEach((sale) => {
      const key = sale.saleBatchId ?? sale.id;
      const existing = groups.get(key);
      if (existing) {
        existing.sales.push(sale);
        return;
      }
      groups.set(key, { key, sales: [sale] });
    });
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        sales: [...group.sales].sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => new Date(b.sales[0]?.soldAt ?? 0).getTime() - new Date(a.sales[0]?.soldAt ?? 0).getTime());
  }, [sales]);

  const editingGroup = editingSaleBatchId
    ? saleGroups.find((group) => group.key === editingSaleBatchId) ?? null
    : null;
  const editingSale = editingGroup?.sales[0] ?? null;
  const returningGroup = returningSaleId
    ? saleGroups.find((group) => group.key === returningSaleId || group.sales.some((sale) => sale.id === returningSaleId)) ?? null
    : null;
  const returningSale = returningGroup?.sales[0] ?? null;
  const detailsSale = detailsSaleId ? sales.find((sale) => sale.id === detailsSaleId) ?? null : null;
  const initialSaleValues: SaleFormValues | null = editingSale
    ? {
        soldAt: editingSale.soldAt.slice(0, 10),
        items: (editingGroup?.sales ?? [editingSale]).flatMap((sale) =>
          sale.lineItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? '',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            serviceItems: services
              .filter((service) => service.source === 'sale-addon' && service.saleId === sale.id)
              .map((service) => ({
                serviceType: service.serviceType,
                serviceCategory: service.serviceCategory ?? 'torno',
                price: service.totalRevenue,
                cost: service.totalOperationalCost ?? service.totalCost ?? service.totalMaterialCost,
                cueReference: service.cueReference,
                notes: service.notes ?? '',
              })),
            giftItems: sale.giftItems.map((giftItem) => ({
              productId: giftItem.productId,
              quantity: giftItem.quantity,
            })),
          }))
        ),
        customerPhone: editingSale.customerPhone ?? '',
        customerName: editingSale.customerName,
        notes: editingSale.notes,
      }
    : null;
  const filteredSales = useMemo(() => {
    return saleGroups.filter((group) => {
      const baseSale = group.sales[0];
      const productNames = group.sales
        .flatMap((sale) => sale.lineItems.map((item) => getProductById(products, item.productId)?.name ?? ''))
        .join(' ');
      return `${productNames} ${baseSale?.customerName ?? ''} ${baseSale?.notes ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase());
    });
  }, [products, query, saleGroups]);
  const normalizedQuery = query.trim();

  const totals = useMemo(
    () =>
      filteredSales.reduce(
        (accumulator, group) => {
          group.sales.forEach((sale) => {
            accumulator.totalRevenue += sale.totalSale - (sale.returnedSaleAmount ?? 0);
            accumulator.totalProfit +=
              sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0));
            accumulator.totalUnits += sale.quantity - (sale.returnedQuantity ?? 0);
          });
          return accumulator;
        },
        { totalRevenue: 0, totalProfit: 0, totalUnits: 0 }
      ),
    [filteredSales]
  );
  const pendingAuthorizationsCount = authorizationRequests.filter((request) => request.status === 'pending').length;
  const approvedAuthorizationsCount = authorizationRequests.filter((request) => request.status === 'approved').length;

  const openAuthorizedEdit = (saleBatchId: string, requestId: string) => {
    setActiveEditAuthorizationId(requestId);
    setEditingSaleBatchId(saleBatchId);
    setOpenDialog(true);
  };

  const openAuthorizedReturn = (saleBatchId: string, requestId: string) => {
    setActiveReturnAuthorizationId(requestId);
    setReturningSaleId(saleBatchId);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader
        eyebrow="Operacion comercial"
        title="Ventas"
        description={
          isSalesUser
            ? 'Registra cada venta para descontar stock y mantener el inventario al dia.'
            : 'Registra cada venta para descontar stock, medir ingresos y dejar un historial claro para el negocio.'
        }
        actions={
          <Button
            onClick={() => {
              setEditingSaleBatchId(null);
              setActiveEditAuthorizationId(null);
              setOpenDialog(true);
            }}
            className="w-full rounded-xl sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" /> Registrar venta
          </Button>
        }
      />

      <div className={`grid gap-3.5 sm:gap-6 ${isSalesUser ? 'sm:grid-cols-1 lg:grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-3.5 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Ventas registradas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatNumber(filteredSales.length)}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Historial de ventas del periodo visible.</p>
        </div>
        {isSalesUser ? (
          <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.82)_100%)] p-3.5 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-amber-900/70 dark:bg-[linear-gradient(180deg,rgba(120,53,15,0.34)_0%,rgba(146,64,14,0.22)_100%)] sm:p-6">
            <p className="text-sm text-amber-800 dark:text-amber-200">Solicitudes de autorizacion</p>
            <p className="mt-3 text-3xl font-semibold text-amber-950 dark:text-amber-50">{formatNumber(pendingAuthorizationsCount)}</p>
            <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
              Si necesitas editar o devolver una venta, primero envias la solicitud al administrador.
            </p>
            {approvedAuthorizationsCount > 0 ? (
                <p className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                {formatNumber(approvedAuthorizationsCount)} autorizacion(es) aprobada(s) lista(s) para usar
              </p>
            ) : null}
          </div>
        ) : null}
        {!isSalesUser && (
          <>
            <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-3.5 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
              <p className="text-sm text-slate-500 dark:text-slate-400">Ingresos</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatCurrency(totals.totalRevenue)}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Suma de las ventas filtradas.</p>
            </div>
            <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(209,250,229,0.82)_100%)] p-3.5 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-emerald-900/70 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.38)_0%,rgba(5,150,105,0.2)_100%)] sm:col-span-2 sm:p-6 lg:col-span-1">
              <p className="text-sm text-emerald-800 dark:text-emerald-200">Utilidad bruta</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-950 dark:text-emerald-50">{formatCurrency(totals.totalProfit)}</p>
              <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">Calculada contra el costo real del inventario.</p>
            </div>
          </>
        )}
      </div>

      <div className="min-w-0 space-y-3.5 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-3.5 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:space-y-4 sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por producto, cliente o nota"
            className="rounded-2xl border-slate-200 bg-white/90 pl-9 shadow-sm dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-100"
          />
        </div>

        {!loading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {normalizedQuery
              ? `Ventas cargadas: ${formatNumber(saleGroups.length)}. Coincidencias con el filtro: ${formatNumber(filteredSales.length)}.`
              : `Ventas cargadas desde Firestore: ${formatNumber(saleGroups.length)}.`}
          </p>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">Cargando ventas desde Firestore...</p>
        )}

        {loading ? (
          <Empty className="border border-dashed border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Receipt className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>Cargando ventas</EmptyTitle>
              <EmptyDescription>
                Espera un momento mientras el panel consulta la coleccion `sales`.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filteredSales.length > 0 ? (
          <div className="min-w-0">
            <div className="mb-2 hidden items-center justify-between gap-3 text-xs text-slate-500 md:flex">
              <p className="dark:text-slate-400">Desliza la tabla hacia la derecha para ver todas las columnas.</p>
              <p className="hidden sm:block">Scroll horizontal activo</p>
            </div>
            <div className="space-y-2.5 md:hidden">
                {filteredSales.map((group) => {
                  const baseSale = group.sales[0];
                  const saleBatchId = group.key;
                  const linkedServices = services.filter(
                    (service) =>
                    service.source === 'sale-addon' &&
                    (service.saleBatchId === saleBatchId || group.sales.some((sale) => service.saleId === sale.id))
                );
                const serviceRevenue = linkedServices.reduce((sum, service) => sum + service.totalRevenue, 0);
                const serviceCost = linkedServices.reduce(
                  (sum, service) => sum + (service.totalCost ?? service.totalOperationalCost ?? service.totalMaterialCost),
                  0
                );
                const returnedQuantity = group.sales.reduce((sum, sale) => sum + (sale.returnedQuantity ?? 0), 0);
                const totalQuantity = group.sales.reduce((sum, sale) => sum + sale.quantity, 0);
                const netTotalSale = group.sales.reduce(
                  (sum, sale) => sum + sale.totalSale - (sale.returnedSaleAmount ?? 0),
                  0
                ) + serviceRevenue;
                  const netProfit = group.sales.reduce(
                    (sum, sale) => sum + sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0)),
                    0
                  ) + (serviceRevenue - serviceCost);
                  const giftSummary = group.sales
                    .flatMap((sale) => sale.giftItems)
                    .map((item) => {
                      const product = getProductById(products, item.productId);
                      return product ? `${product.name} x ${formatNumber(item.quantity)}` : null;
                    })
                    .filter(Boolean)
                    .join(', ');
                  const lineItemsSummary = group.sales
                    .flatMap((sale) =>
                      sale.lineItems.map((item) => {
                        const product = getProductById(products, item.productId);
                        return `${getSaleLineDisplayName(product, item)} x ${formatNumber(item.quantity)}`;
                    })
                  )
                  .filter(Boolean);
                const lineSummary =
                  lineItemsSummary.length > 2
                    ? `${lineItemsSummary.slice(0, 2).join(', ')} + ${formatNumber(lineItemsSummary.length - 2)} mas`
                    : lineItemsSummary.join(', ');
                const serviceSummary = linkedServices
                  .map((service) => `${service.serviceCategory || 'torno'} ${formatCurrency(service.totalRevenue)}`)
                  .join(', ');
                  const integratedUnitPrice =
                    group.sales.length === 1 && totalQuantity > 0
                      ? baseSale.unitPrice + serviceRevenue / totalQuantity
                      : null;
                  const rowHoverSummary = [
                    lineSummary || 'Venta registrada',
                    `Cliente: ${baseSale.customerName}`,
                    `Cantidad: ${formatNumber(totalQuantity)}`,
                    `Total: ${formatCurrency(netTotalSale)}`,
                    serviceSummary ? `Servicio: ${serviceSummary}` : '',
                    giftSummary ? `Obsequio: ${giftSummary}` : '',
                    `Fecha: ${formatDateTime(baseSale.soldAt)}`,
                  ]
                    .filter(Boolean)
                    .join('\n');

                  return (
                    <div
                      key={group.key}
                      className="rounded-[22px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] px-3 py-3.5 shadow-sm dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.86)_100%)]"
                      title={rowHoverSummary}
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-900 dark:text-slate-100">{lineSummary || 'Venta registrada'}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                          {[baseSale.customerName, serviceSummary ? `Servicio: ${serviceSummary}` : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-lg"
                        onClick={() => {
                          setDetailsInitialTab('details');
                          setDetailsSaleId(baseSale.id);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                        <p className="text-slate-500 dark:text-slate-400">Cantidad</p>
                        <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{formatNumber(totalQuantity)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                        <p className="text-slate-500 dark:text-slate-400">Unitario</p>
                        <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                          {integratedUnitPrice === null ? 'Varios' : formatCurrency(integratedUnitPrice)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                        <p className="text-slate-500 dark:text-slate-400">Total</p>
                        <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{formatCurrency(netTotalSale)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/70">
                        <p className="text-slate-500 dark:text-slate-400">{isSalesUser ? 'Fecha' : 'Utilidad'}</p>
                        <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                          {isSalesUser ? formatDateTime(baseSale.soldAt) : formatCurrency(netProfit)}
                        </p>
                      </div>
                    </div>

                    {returnedQuantity > 0 ? (
                      <p className="mt-2 text-[11px] font-medium text-amber-700">
                        Devuelto: {formatNumber(returnedQuantity)}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="hidden rounded-2xl border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-900/40 md:block">
            <div className="overflow-x-scroll pb-3">
              <Table className="min-w-[1020px] bg-white/90 text-sm dark:bg-slate-950/40">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[390px]">Producto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Precio unidad</TableHead>
                    {!isSalesUser && <TableHead>Total venta</TableHead>}
                    {!isSalesUser && <TableHead>Utilidad</TableHead>}
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="sticky right-0 z-10 bg-slate-50/95 text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)] dark:bg-slate-900/95 dark:shadow-[-12px_0_16px_-16px_rgba(2,6,23,0.65)]">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((group) => {
                    const baseSale = group.sales[0];
                    const saleBatchId = group.key;
                    const linkedServices = services.filter(
                      (service) =>
                        service.source === 'sale-addon' &&
                        (service.saleBatchId === saleBatchId || group.sales.some((sale) => service.saleId === sale.id))
                    );
                    const serviceRevenue = linkedServices.reduce((sum, service) => sum + service.totalRevenue, 0);
                    const serviceCost = linkedServices.reduce(
                      (sum, service) => sum + (service.totalCost ?? service.totalOperationalCost ?? service.totalMaterialCost),
                      0
                    );
                    const returnedQuantity = group.sales.reduce((sum, sale) => sum + (sale.returnedQuantity ?? 0), 0);
                    const totalQuantity = group.sales.reduce((sum, sale) => sum + sale.quantity, 0);
                    const netTotalSale = group.sales.reduce(
                      (sum, sale) => sum + sale.totalSale - (sale.returnedSaleAmount ?? 0),
                      0
                    ) + serviceRevenue;
                    const netProfit = group.sales.reduce(
                      (sum, sale) => sum + sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0)),
                      0
                    ) + (serviceRevenue - serviceCost);
                    const giftSummary = group.sales
                      .flatMap((sale) => sale.giftItems)
                      .map((item) => {
                        const product = getProductById(products, item.productId);
                        return product ? `${product.name} x ${formatNumber(item.quantity)}` : null;
                      })
                      .filter(Boolean)
                      .join(', ');
                    const lineItemsSummary = group.sales
                      .flatMap((sale) =>
                        sale.lineItems.map((item) => {
                          const product = getProductById(products, item.productId);
                          return getSaleLineDisplayName(product, item);
                        })
                      )
                      .filter(Boolean);
                    const lineSummary =
                      lineItemsSummary.length > 2
                        ? `${lineItemsSummary.slice(0, 2).join(', ')} + ${formatNumber(lineItemsSummary.length - 2)} mas`
                        : lineItemsSummary.join(', ');
                    const serviceSummary = linkedServices
                      .map((service) => `${service.serviceCategory || 'torno'} ${formatCurrency(service.totalRevenue)}`)
                      .join(', ');
                    const returnStatus =
                      returnedQuantity <= 0
                        ? 'Sin devolucion'
                        : returnedQuantity >= totalQuantity
                          ? 'Devuelta'
                          : `Parcial (${formatNumber(returnedQuantity)})`;
                    const saleSummary = lineSummary || 'Venta registrada';
                    const integratedUnitPrice =
                      group.sales.length === 1 && totalQuantity > 0
                        ? baseSale.unitPrice + serviceRevenue / totalQuantity
                        : null;
                    const rowHoverSummary = [
                      lineSummary || 'Venta registrada',
                      `Cliente: ${baseSale.customerName}`,
                      `Cantidad: ${formatNumber(totalQuantity)}`,
                      `Total: ${formatCurrency(netTotalSale)}`,
                      serviceSummary ? `Servicio: ${serviceSummary}` : '',
                      giftSummary ? `Obsequio: ${giftSummary}` : '',
                      `Fecha: ${formatDateTime(baseSale.soldAt)}`,
                    ]
                      .filter(Boolean)
                      .join('\n');
                    const pendingEditRequest = getPendingRequestForGroup(
                      authorizationRequests,
                      saleBatchId,
                      'sale-edit'
                    );
                    const pendingReturnRequest = getPendingRequestForGroup(
                      authorizationRequests,
                      saleBatchId,
                      'sale-return'
                    );
                    const approvedEditRequest = getApprovedRequestForGroup(
                      authorizationRequests,
                      saleBatchId,
                      'sale-edit'
                    );
                    const approvedReturnRequest = getApprovedRequestForGroup(
                      authorizationRequests,
                      saleBatchId,
                      'sale-return'
                    );
                    const rejectedEditRequest = getRejectedRequestForGroup(
                      authorizationRequests,
                      saleBatchId,
                      'sale-edit'
                    );
                    const rejectedReturnRequest = getRejectedRequestForGroup(
                      authorizationRequests,
                      saleBatchId,
                      'sale-return'
                    );
                    const salesRowHighlightClass = isSalesUser
                      ? getSalesRowHighlightClass({
                          pendingEditRequest,
                          pendingReturnRequest,
                          approvedEditRequest,
                          approvedReturnRequest,
                          rejectedEditRequest,
                          rejectedReturnRequest,
                        })
                      : '';
                    return (
                      <TableRow key={group.key} className={salesRowHighlightClass}>
                        <TableCell className="max-w-[390px] py-2" title={rowHoverSummary}>
                          <div className="space-y-0.5">
                            <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-900 dark:text-slate-100">{lineSummary}</p>
                            <p className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                              {[
                                `${formatNumber(group.sales.length)} linea(s)`,
                                serviceSummary ? `Servicio: ${serviceSummary}` : '',
                                giftSummary ? 'Obsequio' : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate py-2 text-slate-700 dark:text-slate-200" title={rowHoverSummary}>{baseSale.customerName}</TableCell>
                        <TableCell title={rowHoverSummary}>
                          <div>
                            <p className="text-sm text-slate-700 dark:text-slate-200">{formatNumber(totalQuantity)}</p>
                            {returnedQuantity > 0 ? (
                              <p className="text-xs text-amber-700">Devuelto: {formatNumber(returnedQuantity)}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-slate-700 dark:text-slate-200" title={rowHoverSummary}>{integratedUnitPrice === null ? 'Varios' : formatCurrency(integratedUnitPrice)}</TableCell>
                        {!isSalesUser && <TableCell className="py-2 text-slate-700 dark:text-slate-200" title={rowHoverSummary}>{formatCurrency(netTotalSale)}</TableCell>}
                        {!isSalesUser && <TableCell className="py-2 text-slate-700 dark:text-slate-200" title={rowHoverSummary}>{formatCurrency(netProfit)}</TableCell>}
                        <TableCell className="py-2 text-xs text-slate-700 dark:text-slate-200" title={rowHoverSummary}>{returnStatus}</TableCell>
                        <TableCell className="py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-200" title={rowHoverSummary}>{formatDateTime(baseSale.soldAt)}</TableCell>
                        <TableCell className="sticky right-0 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur dark:bg-slate-950/95 dark:shadow-[-12px_0_16px_-16px_rgba(2,6,23,0.65)]">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg"
                              onClick={() => {
                                setDetailsInitialTab('details');
                                setDetailsSaleId(baseSale.id);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDetailsInitialTab('details');
                                    setDetailsSaleId(baseSale.id);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                  Ver detalle
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {isSalesUser ? (
                                  <>
                                    {approvedEditRequest ? (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          openAuthorizedEdit(group.key, approvedEditRequest.id);
                                        }}
                                      >
                                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                                        Editar autorizado
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        disabled={Boolean(pendingEditRequest)}
                                        onClick={() => {
                                          setAuthorizationDialogState({
                                            saleBatchId,
                                            saleId: baseSale.id,
                                            customerName: baseSale.customerName,
                                            saleSummary,
                                            requestType: 'sale-edit',
                                          });
                                          setAuthorizationReason('');
                                        }}
                                      >
                                        {pendingEditRequest ? (
                                          <Clock3 className="h-4 w-4 text-amber-700" />
                                        ) : (
                                          <LockKeyhole className="h-4 w-4" />
                                        )}
                                        {pendingEditRequest ? 'Edicion en revision' : 'Solicitar edicion'}
                                      </DropdownMenuItem>
                                    )}
                                    {approvedReturnRequest ? (
                                      <DropdownMenuItem
                                        disabled={group.sales.every((sale) => (sale.quantity - (sale.returnedQuantity ?? 0)) <= 0)}
                                        onClick={() => {
                                          openAuthorizedReturn(group.key, approvedReturnRequest.id);
                                        }}
                                      >
                                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                                        Devolucion autorizada
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        disabled={
                                          Boolean(pendingReturnRequest) ||
                                          group.sales.every((sale) => (sale.quantity - (sale.returnedQuantity ?? 0)) <= 0)
                                        }
                                        onClick={() => {
                                          setAuthorizationDialogState({
                                            saleBatchId,
                                            saleId: baseSale.id,
                                            customerName: baseSale.customerName,
                                            saleSummary,
                                            requestType: 'sale-return',
                                          });
                                          setAuthorizationReason('');
                                        }}
                                      >
                                        {pendingReturnRequest ? (
                                          <Clock3 className="h-4 w-4 text-amber-700" />
                                        ) : (
                                          <LockKeyhole className="h-4 w-4" />
                                        )}
                                        {pendingReturnRequest ? 'Devolucion en revision' : 'Solicitar devolucion'}
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditingSaleBatchId(group.key);
                                        setOpenDialog(true);
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                      Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={group.sales.every((sale) => (sale.quantity - (sale.returnedQuantity ?? 0)) <= 0)}
                                      onClick={() => setReturningSaleId(group.key)}
                                    >
                                      <CornerUpLeft className="h-4 w-4" />
                                      Devolucion
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {isSalesUser && (pendingEditRequest || pendingReturnRequest || approvedEditRequest || approvedReturnRequest || rejectedEditRequest || rejectedReturnRequest) ? (
                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                              {pendingEditRequest ? (
                                <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">
                                  Edicion pendiente
                                </Badge>
                              ) : null}
                              {pendingReturnRequest ? (
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                  Devolucion pendiente
                                </Badge>
                              ) : null}
                              {approvedEditRequest ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
                                  onClick={() => openAuthorizedEdit(group.key, approvedEditRequest.id)}
                                >
                                  Edicion autorizada
                                </button>
                              ) : null}
                              {approvedReturnRequest ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
                                  onClick={() => openAuthorizedReturn(group.key, approvedReturnRequest.id)}
                                >
                                  Devolucion autorizada
                                </button>
                              ) : null}
                              {rejectedEditRequest ? (
                                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">
                                  Edicion rechazada
                                </Badge>
                              ) : null}
                              {rejectedReturnRequest ? (
                                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">
                                  Devolucion rechazada
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </div>
          </div>
        ) : (
          <Empty className="border border-dashed border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Receipt className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>{normalizedQuery ? 'No hay ventas para ese filtro' : 'No hay ventas registradas'}</EmptyTitle>
              <EmptyDescription>
                {normalizedQuery
                  ? 'Prueba con otro nombre de producto, cliente o nota para confirmar si el historial si existe.'
                  : 'No se encontraron documentos en la coleccion `sales` o todavia no se ha registrado ninguna venta.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <SaleFormDialog
        open={openDialog}
        onOpenChange={(nextOpen) => {
          setOpenDialog(nextOpen);
          if (!nextOpen) {
            setEditingSaleBatchId(null);
            setActiveEditAuthorizationId(null);
          }
        }}
        products={products}
        purchases={purchases}
        movements={movements}
        initialValues={initialSaleValues}
        mode={editingSaleBatchId ? 'edit' : 'create'}
        hideFinancialSummary={isSalesUser}
        canEditUnitPrice
        unitPriceHelpText={
          isSalesUser
            ? 'Si bajas el precio frente al valor sugerido, la venta se enviara a autorizacion antes de registrarse.'
            : undefined
        }
        onSubmit={async (values) => {
          try {
            const payload = {
              ...values,
              soldAt: toOperationalDateISOString(values.soldAt),
              paymentMethod: 'efectivo',
              paymentReference: '',
              actorRole: role ?? 'admin',
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            };
            const discountedLines = values.items
              .map((item, index) => {
                const product = products.find((productItem) => productItem.id === item.productId);
                if (!product) return null;
                const suggestedUnitPrice = item.variantId
                  ? Number(
                      product.variants?.find((variant) => variant.id === item.variantId)?.salePrice ??
                        product.salePrice ??
                        0
                    )
                  : Number(product.salePrice ?? 0);
                const requestedUnitPrice = Number(item.unitPrice ?? 0);
                if (requestedUnitPrice >= suggestedUnitPrice || suggestedUnitPrice <= 0) return null;
                return {
                  index: index + 1,
                  productName: product.name,
                  requestedUnitPrice,
                  suggestedUnitPrice,
                };
              })
              .filter(
                (
                  item
                ): item is {
                  index: number;
                  productName: string;
                  requestedUnitPrice: number;
                  suggestedUnitPrice: number;
                } => Boolean(item)
              );

            if (!editingSaleBatchId && isSalesUser && discountedLines.length > 0) {
              const draftRequestId = `discount-${Date.now()}`;
              const saleSummary = values.items
                .map((item) => {
                  const product = products.find((productItem) => productItem.id === item.productId);
                  return `${product?.name ?? 'Producto'} x${formatNumber(item.quantity)}`;
                })
                .join(' | ');
              const reason = discountedLines
                .map(
                  (line) =>
                    `Linea ${line.index}: ${line.productName} de ${formatCurrency(line.suggestedUnitPrice)} a ${formatCurrency(line.requestedUnitPrice)}`
                )
                .join(' | ');

              await createAuthorizationRequest({
                saleId: draftRequestId,
                saleBatchId: draftRequestId,
                requestType: 'sale-discount',
                customerName: values.customerName,
                saleSummary,
                reason,
                requestedBy:
                  profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
                requestedByRole: role ?? 'sales',
                draftSalePayload: payload,
              });

              setOpenDialog(false);
              toast({
                title: 'Solicitud de descuento enviada',
                description: 'La venta no se registro aun. Quedo pendiente de aprobacion del administrador.',
              });
              return;
            }
            if (editingSaleBatchId) {
              await updateSaleBatch(editingSaleBatchId, payload);
              if (isSalesUser && activeEditAuthorizationId) {
                try {
                  await completeAuthorizationRequest({
                    requestId: activeEditAuthorizationId,
                    completedBy:
                      profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
                  });
                } catch (authorizationError) {
                  console.error('No se pudo cerrar la autorizacion de edicion:', authorizationError);
                }
              }
            } else {
              const createdSales = await registerSale(payload);
              const createdSale = createdSales[0] ?? null;
              if (createdSale) {
                setDetailsInitialTab('invoice');
                setDetailsSaleId(createdSale.id);
              }
            }
            setOpenDialog(false);
            setEditingSaleBatchId(null);
            setActiveEditAuthorizationId(null);
            toast({
              title: editingSaleBatchId ? 'Venta actualizada' : 'Venta registrada',
              description: 'El stock y los indicadores comerciales fueron actualizados.',
            });
          } catch (error) {
            toast({
              title: editingSaleBatchId ? 'No se pudo actualizar la venta' : 'No se pudo registrar la venta',
              description: getFriendlyFirestoreWriteErrorMessage(
                error,
                error instanceof Error ? error.message : 'Verifica el stock disponible.'
              ),
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />

      <SaleDetailsDialog
        open={Boolean(detailsSale)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDetailsSaleId(null);
            setDetailsInitialTab('details');
          }
        }}
        sale={detailsSale}
        sales={sales}
        services={services}
        products={products}
        hideFinancialDetails={isSalesUser}
        initialTab={detailsInitialTab}
      />

      <SaleReturnDialog
        open={Boolean(returningSale)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setReturningSaleId(null);
            setActiveReturnAuthorizationId(null);
          }
        }}
        sales={returningGroup?.sales ?? []}
        products={products}
        customerName={returningSale?.customerName ?? 'Cliente'}
        onSubmit={async (values: SaleReturnFormValues) => {
          if (!returningGroup) return;
          try {
            await registerSaleReturns({
              returnedAt: toOperationalDateISOString(values.returnedAt),
              items: values.items,
              notes: values.notes,
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            });
            if (isSalesUser && activeReturnAuthorizationId) {
              try {
                await completeAuthorizationRequest({
                  requestId: activeReturnAuthorizationId,
                  completedBy:
                    profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
                });
              } catch (authorizationError) {
                console.error('No se pudo cerrar la autorizacion de devolucion:', authorizationError);
              }
            }
            setReturningSaleId(null);
            setActiveReturnAuthorizationId(null);
            toast({
              title: 'Devolucion registrada',
              description: 'La venta y el inventario fueron actualizados correctamente.',
            });
          } catch (error) {
            toast({
              title: 'No se pudo registrar la devolucion',
              description: getFriendlyFirestoreWriteErrorMessage(
                error,
                error instanceof Error ? error.message : 'Verifica la cantidad a devolver.'
              ),
              variant: 'destructive',
            });
            throw error;
          }
        }}
      />

      <Dialog
        open={Boolean(authorizationDialogState)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setAuthorizationDialogState(null);
            setAuthorizationReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Solicitar autorizacion</DialogTitle>
            <DialogDescription>
              El administrador recibira esta solicitud y podra aprobar la {authorizationDialogState
                ? getAuthorizationTypeLabel(authorizationDialogState.requestType)
                : 'accion'}.
            </DialogDescription>
          </DialogHeader>

          {authorizationDialogState ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Venta</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{authorizationDialogState.saleSummary}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Cliente</p>
                <p className="mt-1 text-sm text-slate-700">{authorizationDialogState.customerName || 'Cliente'}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Motivo de la solicitud</p>
                <Textarea
                  value={authorizationReason}
                  onChange={(event) => setAuthorizationReason(event.target.value)}
                  placeholder="Explica por que necesitas editar o devolver esta venta."
                  rows={4}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setAuthorizationDialogState(null);
                setAuthorizationReason('');
              }}
            >
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              onClick={async () => {
                if (!authorizationDialogState) return;

                try {
                  await createAuthorizationRequest({
                    saleId: authorizationDialogState.saleId,
                    saleBatchId: authorizationDialogState.saleBatchId,
                    requestType: authorizationDialogState.requestType,
                    customerName: authorizationDialogState.customerName,
                    saleSummary: authorizationDialogState.saleSummary,
                    reason: authorizationReason,
                    requestedBy:
                      profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
                    requestedByRole: role ?? 'sales',
                  });
                  toast({
                    title: 'Solicitud enviada',
                    description: 'El administrador ya puede revisar esta autorizacion desde su panel.',
                  });
                  setAuthorizationDialogState(null);
                  setAuthorizationReason('');
                } catch (error) {
                  toast({
                    title: 'No se pudo enviar la solicitud',
                    description: getFriendlyFirestoreWriteErrorMessage(
                      error,
                      error instanceof Error ? error.message : 'Intenta nuevamente.'
                    ),
                    variant: 'destructive',
                  });
                }
              }}
            >
              Enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
