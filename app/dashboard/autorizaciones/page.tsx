'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber, getProductById } from '@/lib/admin/calculations';
import type { AuthorizationRequest } from '@/lib/admin/types';

function getRequestTypeLabel(requestType: AuthorizationRequest['requestType']) {
  if (requestType === 'sale-return') return 'Devolucion';
  if (requestType === 'sale-discount') return 'Descuento';
  return 'Edicion';
}

function getStatusLabel(status: AuthorizationRequest['status']) {
  switch (status) {
    case 'approved':
      return 'Aprobada';
    case 'rejected':
      return 'Rechazada';
    case 'completed':
      return 'Usada';
    default:
      return 'Pendiente';
  }
}

function getStatusClasses(status: AuthorizationRequest['status']) {
  switch (status) {
    case 'approved':
      return 'border-emerald-200/80 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200';
    case 'rejected':
      return 'border-rose-200/80 bg-rose-50/80 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200';
    case 'completed':
      return 'border-border bg-muted/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200';
    default:
      return 'border-amber-200/80 bg-amber-50/80 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200';
  }
}

function buildDiscountApprovalSummary(
  request: AuthorizationRequest,
  products: ReturnType<typeof useAdminData>['products']
) {
  const lines = request.draftSalePayload?.items
    .map((item, index) => {
      const product = getProductById(products, item.productId);
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
        productName: string;
        quantity: number;
        suggestedUnitPrice: number;
        requestedUnitPrice: number;
        lineDiscount: number;
      } => Boolean(item)
    ) ?? [];

  return {
    lines,
    totalDiscount: lines.reduce((sum, line) => sum + line.lineDiscount, 0),
  };
}

export default function AutorizacionesPage() {
  const { role, profile, user } = useAuth();
  const { authorizationRequests, reviewAuthorizationRequest, completeAuthorizationRequest, registerSale, products } = useAdminData();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<AuthorizationRequest | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return authorizationRequests;

    return authorizationRequests.filter((request) =>
      `${request.customerName} ${request.requestedBy} ${request.reason} ${request.saleSummary}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [authorizationRequests, query]);

  const pendingCount = authorizationRequests.filter((request) => request.status === 'pending').length;
  const approvedCount = authorizationRequests.filter((request) => request.status === 'approved').length;
  const rejectedCount = authorizationRequests.filter((request) => request.status === 'rejected').length;
  const selectedDiscountSummary =
    selectedRequest?.requestType === 'sale-discount'
      ? buildDiscountApprovalSummary(selectedRequest, products)
      : { lines: [], totalDiscount: 0 };

  if (role !== 'admin' && role !== 'superadmin') {
    return (
      <div className="rounded-3xl border border-border bg-card/88 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/72">
        <p className="text-lg font-semibold text-foreground">Acceso restringido</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Solo el administrador o superadmin puede revisar y aprobar solicitudes.
        </p>
      </div>
    );
  }

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedRequest) return;

    try {
      if (status === 'approved' && selectedRequest.requestType === 'sale-discount' && selectedRequest.draftSalePayload) {
        await reviewAuthorizationRequest(selectedRequest.id, {
          status: 'approved',
          reviewNote,
          reviewedBy: profile?.nombre?.trim() || user?.displayName || user?.email || 'Superadmin',
        });
        await registerSale(selectedRequest.draftSalePayload);
        await completeAuthorizationRequest({
          requestId: selectedRequest.id,
          completedBy: profile?.nombre?.trim() || user?.displayName || user?.email || 'Superadmin',
        });
        toast({
          title: 'Descuento aprobado y venta registrada',
          description: 'La venta con descuento ya quedo aplicada en el sistema.',
        });
        setSelectedRequest(null);
        setReviewNote('');
        return;
      }

      await reviewAuthorizationRequest(selectedRequest.id, {
        status,
        reviewNote,
        reviewedBy: profile?.nombre?.trim() || user?.displayName || user?.email || 'Superadmin',
      });
      toast({
        title: status === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada',
        description: 'La decision ya quedo registrada para el vendedor.',
      });
      setSelectedRequest(null);
      setReviewNote('');
    } catch (error) {
      toast({
        title: 'No se pudo procesar la solicitud',
        description: error instanceof Error ? error.message : 'Intenta nuevamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader
        eyebrow="Control de aprobaciones"
        title="Autorizaciones"
        description="Aprueba o rechaza las solicitudes que envian los vendedores para editar o devolver ventas."
      />

      <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border border-amber-200/80 bg-amber-50/75 p-3.5 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-background/80 p-3 text-amber-800 dark:bg-slate-950/55 dark:text-amber-200">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-amber-800 dark:text-amber-200/85">Pendientes</p>
              <p className="text-3xl font-semibold text-amber-950 dark:text-amber-100">{pendingCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/75 p-3.5 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-background/80 p-3 text-emerald-800 dark:bg-slate-950/55 dark:text-emerald-200">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-emerald-800 dark:text-emerald-200/85">Aprobadas</p>
              <p className="text-3xl font-semibold text-emerald-950 dark:text-emerald-100">{approvedCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-rose-200/80 bg-rose-50/75 p-3.5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/20 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-background/80 p-3 text-rose-800 dark:bg-slate-950/55 dark:text-rose-200">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-rose-800 dark:text-rose-200/85">Rechazadas</p>
              <p className="text-3xl font-semibold text-rose-950 dark:text-rose-100">{rejectedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card/88 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/72 sm:p-6">
        <div className="flex flex-col gap-3.5 md:flex-row md:items-center md:justify-between md:gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Bandeja de solicitudes</h2>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Aqui revisas quien solicita editar o devolver una venta antes de autorizarla.
            </p>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cliente, vendedor o motivo"
            className="max-w-md"
          />
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-2 dark:border-slate-800 dark:bg-slate-900/60 sm:mt-5">
          <div className="pb-2">
            <Table className="min-w-[980px] bg-card/88 dark:bg-slate-950/60">
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitud</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="sticky right-0 z-10 bg-muted/95 text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)] dark:bg-slate-900/95 dark:shadow-[-12px_0_16px_-16px_rgba(2,6,23,0.65)]">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => {
                  const rowHoverSummary = [
                    getRequestTypeLabel(request.requestType),
                    `Vendedor: ${request.requestedBy}`,
                    `Cliente: ${request.customerName || 'Cliente'}`,
                    `Estado: ${getStatusLabel(request.status)}`,
                    `Venta: ${request.saleSummary}`,
                    `Motivo: ${request.reason}`,
                    `Fecha: ${new Date(request.createdAt).toLocaleString('es-CO')}`,
                  ].join('\n');
                  return (
                  <TableRow key={request.id} title={rowHoverSummary}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{getRequestTypeLabel(request.requestType)}</p>
                        <p className="text-xs text-muted-foreground">{request.saleSummary}</p>
                      </div>
                    </TableCell>
                    <TableCell>{request.requestedBy}</TableCell>
                    <TableCell>{request.customerName || 'Cliente'}</TableCell>
                    <TableCell className="max-w-xs">
                      <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{request.reason}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusClasses(request.status)}>
                        {getStatusLabel(request.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(request.createdAt).toLocaleString('es-CO')}</TableCell>
                    <TableCell className="sticky right-0 bg-[rgba(241,245,249,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur dark:bg-slate-950/95 dark:shadow-[-12px_0_16px_-16px_rgba(2,6,23,0.65)]">
                      <Button
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => {
                          setSelectedRequest(request);
                          setReviewNote(request.reviewNote);
                        }}
                      >
                        Revisar
                      </Button>
                    </TableCell>
                  </TableRow>
                )})}
                {filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                        <div className="rounded-2xl bg-muted p-3 dark:bg-slate-900/80">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <p className="font-medium text-foreground">No hay solicitudes por revisar</p>
                        <p className="text-sm">Cuando un vendedor solicite una autorizacion aparecera aqui.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <AdminResponsiveDialog
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
            setReviewNote('');
          }
        }}
        title="Revisar solicitud"
        description="Confirma si autorizas la accion solicitada por el vendedor."
        desktopContentClassName="sm:max-w-2xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              className="w-full rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-200 dark:hover:bg-rose-950/20 sm:w-auto"
              onClick={() => void handleReview('rejected')}
              disabled={!selectedRequest || selectedRequest.status !== 'pending'}
            >
              Rechazar
            </Button>
            <Button
              className="w-full rounded-xl sm:w-auto"
              onClick={() => void handleReview('approved')}
              disabled={!selectedRequest || selectedRequest.status !== 'pending'}
            >
              Aprobar
            </Button>
          </div>
        }
      >
          {selectedRequest ? (
            <div className="space-y-3.5 sm:space-y-4">
              <div className="grid gap-3 rounded-2xl border border-border bg-muted/70 p-3 dark:border-slate-800 dark:bg-slate-900/70 sm:grid-cols-2 sm:p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo</p>
                  <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                    {getRequestTypeLabel(selectedRequest.requestType)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado</p>
                  <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{getStatusLabel(selectedRequest.status)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Vendedor</p>
                  <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{selectedRequest.requestedBy}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Cliente</p>
                  <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{selectedRequest.customerName || 'Cliente'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/72 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Venta</p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{selectedRequest.saleSummary}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Motivo enviado</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedRequest.reason}</p>
              </div>

              {selectedRequest.requestType === 'sale-discount' && selectedDiscountSummary.lines.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/20 sm:p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Descuento solicitado</p>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      Total: {formatCurrency(selectedDiscountSummary.totalDiscount)}
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedDiscountSummary.lines.map((line) => (
                      <div key={line.key} className="rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-950/40">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{line.productName}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {formatNumber(line.quantity)} uds · normal {formatCurrency(line.suggestedUnitPrice)} · solicitado {formatCurrency(line.requestedUnitPrice)}
                        </p>
                        <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                          Descuento linea: {formatCurrency(line.lineDiscount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Nota del administrador</p>
                <Textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Opcional: agrega una nota para dejar claro por que apruebas o rechazas."
                  rows={4}
                />
              </div>
            </div>
          ) : null}
      </AdminResponsiveDialog>
    </div>
  );
}
