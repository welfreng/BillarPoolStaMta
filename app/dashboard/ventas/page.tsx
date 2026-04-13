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
import { getSaleLineDisplayName } from '@/lib/admin/sale-line-display';
import type { AuthorizationRequest, AuthorizationRequestType } from '@/lib/admin/types';

function getAuthorizationTypeLabel(requestType: AuthorizationRequestType) {
  return requestType === 'sale-return' ? 'devolucion' : 'edicion';
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
    return 'bg-rose-50/90 hover:bg-rose-100/70';
  }
  if (input.pendingReturnRequest) {
    return 'bg-amber-50/90 hover:bg-amber-100/70';
  }
  if (input.pendingEditRequest) {
    return 'bg-cyan-50/90 hover:bg-cyan-100/70';
  }
  if (input.approvedReturnRequest) {
    return 'bg-emerald-50/80 hover:bg-emerald-100/70';
  }
  if (input.approvedEditRequest) {
    return 'bg-sky-50/80 hover:bg-sky-100/70';
  }

  return '';
}

export default function VentasPage() {
  const {
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
    <div className="space-y-6">
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

      <div className={`grid gap-4 sm:gap-6 ${isSalesUser ? 'sm:grid-cols-1 lg:grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">Ventas registradas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatNumber(filteredSales.length)}</p>
          <p className="mt-2 text-sm text-slate-500">Historial de ventas del periodo visible.</p>
        </div>
        {isSalesUser ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-6">
            <p className="text-sm text-amber-800">Solicitudes de autorizacion</p>
            <p className="mt-3 text-3xl font-semibold text-amber-950">{formatNumber(pendingAuthorizationsCount)}</p>
            <p className="mt-2 text-sm text-amber-900">
              Si necesitas editar o devolver una venta, primero envias la solicitud al administrador.
            </p>
            {approvedAuthorizationsCount > 0 ? (
              <p className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                {formatNumber(approvedAuthorizationsCount)} autorizacion(es) aprobada(s) lista(s) para usar
              </p>
            ) : null}
          </div>
        ) : null}
        {!isSalesUser && (
          <>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <p className="text-sm text-slate-500">Ingresos</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(totals.totalRevenue)}</p>
              <p className="mt-2 text-sm text-slate-500">Suma de las ventas filtradas.</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:col-span-2 sm:p-6 lg:col-span-1">
              <p className="text-sm text-emerald-800">Utilidad bruta</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-950">{formatCurrency(totals.totalProfit)}</p>
              <p className="mt-2 text-sm text-emerald-900">Calculada contra el costo real del inventario.</p>
            </div>
          </>
        )}
      </div>

      <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por producto, cliente o nota"
            className="pl-9"
          />
        </div>

        {filteredSales.length > 0 ? (
          <div className="min-w-0">
            <div className="mb-2 hidden items-center justify-between gap-3 text-xs text-slate-500 md:flex">
              <p>Desliza la tabla hacia la derecha para ver todas las columnas.</p>
              <p className="hidden sm:block">Scroll horizontal activo</p>
            </div>
            <div className="space-y-2 md:hidden">
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
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                      title={rowHoverSummary}
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-900">{lineSummary || 'Venta registrada'}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {baseSale.customerName}
                          {serviceSummary ? ` · Servicio: ${serviceSummary}` : ''}
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
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-slate-500">Cantidad</p>
                        <p className="mt-1 font-medium text-slate-900">{formatNumber(totalQuantity)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-slate-500">Unitario</p>
                        <p className="mt-1 font-medium text-slate-900">
                          {integratedUnitPrice === null ? 'Varios' : formatCurrency(integratedUnitPrice)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-slate-500">Total</p>
                        <p className="mt-1 font-medium text-slate-900">{formatCurrency(netTotalSale)}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-slate-500">{isSalesUser ? 'Fecha' : 'Utilidad'}</p>
                        <p className="mt-1 font-medium text-slate-900">
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
            <div className="hidden rounded-2xl border border-slate-200 bg-slate-50/60 p-2 md:block">
            <div className="overflow-x-scroll pb-3">
              <Table className="min-w-[1020px] bg-white text-sm">
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
                    <TableHead className="sticky right-0 z-10 bg-white text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)]">
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
                            <p className="line-clamp-2 text-sm font-medium leading-4.5 text-slate-900">{lineSummary}</p>
                            <p className="line-clamp-1 text-[11px] text-slate-500">
                              {formatNumber(group.sales.length)} linea(s)
                              {serviceSummary ? ` · Servicio: ${serviceSummary}` : ''}
                              {giftSummary ? ` · Obsequio` : ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate py-2" title={rowHoverSummary}>{baseSale.customerName}</TableCell>
                        <TableCell title={rowHoverSummary}>
                          <div>
                            <p className="text-sm">{formatNumber(totalQuantity)}</p>
                            {returnedQuantity > 0 ? (
                              <p className="text-xs text-amber-700">Devuelto: {formatNumber(returnedQuantity)}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="py-2" title={rowHoverSummary}>{integratedUnitPrice === null ? 'Varios' : formatCurrency(integratedUnitPrice)}</TableCell>
                        {!isSalesUser && <TableCell className="py-2" title={rowHoverSummary}>{formatCurrency(netTotalSale)}</TableCell>}
                        {!isSalesUser && <TableCell className="py-2" title={rowHoverSummary}>{formatCurrency(netProfit)}</TableCell>}
                        <TableCell className="py-2 text-xs" title={rowHoverSummary}>{returnStatus}</TableCell>
                        <TableCell className="py-2 whitespace-nowrap text-xs" title={rowHoverSummary}>{formatDateTime(baseSale.soldAt)}</TableCell>
                        <TableCell className="sticky right-0 bg-white text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)]">
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
          <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Receipt className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No hay ventas registradas</EmptyTitle>
              <EmptyDescription>
                Registra la primera venta para empezar a llevar el control operativo del modulo.
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
        onSubmit={async (values) => {
          try {
            const payload = {
              ...values,
              soldAt: new Date(values.soldAt).toISOString(),
              actorRole: role ?? 'admin',
              responsibleUser:
                profile?.nombre?.trim() || user?.displayName || user?.email || 'Usuario de ventas',
            };
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
              description: error instanceof Error ? error.message : 'Verifica el stock disponible.',
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
              returnedAt: new Date(values.returnedAt).toISOString(),
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
              description: error instanceof Error ? error.message : 'Verifica la cantidad a devolver.',
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
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Venta</p>
                <p className="mt-1 font-medium text-slate-900">{authorizationDialogState.saleSummary}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Cliente</p>
                <p className="mt-1 text-sm text-slate-700">{authorizationDialogState.customerName || 'Cliente'}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">Motivo de la solicitud</p>
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
                    description: error instanceof Error ? error.message : 'Intenta nuevamente.',
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
