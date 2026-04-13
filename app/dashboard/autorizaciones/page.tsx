'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
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
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { AuthorizationRequest } from '@/lib/admin/types';

function getRequestTypeLabel(requestType: AuthorizationRequest['requestType']) {
  return requestType === 'sale-return' ? 'Devolucion' : 'Edicion';
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
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'rejected':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'completed':
      return 'border-slate-200 bg-slate-100 text-slate-700';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800';
  }
}

export default function AutorizacionesPage() {
  const { role, profile, user } = useAuth();
  const { authorizationRequests, reviewAuthorizationRequest } = useAdminData();
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

  if (role !== 'admin') {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold text-slate-950">Acceso restringido</p>
        <p className="mt-2 text-sm text-slate-500">
          Solo el administrador puede revisar y aprobar solicitudes.
        </p>
      </div>
    );
  }

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedRequest) return;

    try {
      await reviewAuthorizationRequest(selectedRequest.id, {
        status,
        reviewNote,
        reviewedBy: profile?.nombre?.trim() || user?.displayName || user?.email || 'Administrador',
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
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Control de aprobaciones"
        title="Autorizaciones"
        description="Aprueba o rechaza las solicitudes que envian los vendedores para editar o devolver ventas."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/80 p-3 text-amber-800">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-amber-800">Pendientes</p>
              <p className="text-3xl font-semibold text-amber-950">{pendingCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/80 p-3 text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-emerald-800">Aprobadas</p>
              <p className="text-3xl font-semibold text-emerald-950">{approvedCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/80 p-3 text-rose-800">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-rose-800">Rechazadas</p>
              <p className="text-3xl font-semibold text-rose-950">{rejectedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Bandeja de solicitudes</h2>
            <p className="text-sm text-slate-500">
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

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
          <div className="pb-2">
            <Table className="min-w-[980px] bg-white">
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitud</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="sticky right-0 z-10 bg-slate-50/95 text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)]">
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
                        <p className="font-medium text-slate-900">{getRequestTypeLabel(request.requestType)}</p>
                        <p className="text-xs text-slate-500">{request.saleSummary}</p>
                      </div>
                    </TableCell>
                    <TableCell>{request.requestedBy}</TableCell>
                    <TableCell>{request.customerName || 'Cliente'}</TableCell>
                    <TableCell className="max-w-xs">
                      <p className="line-clamp-2 text-sm text-slate-600">{request.reason}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusClasses(request.status)}>
                        {getStatusLabel(request.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(request.createdAt).toLocaleString('es-CO')}</TableCell>
                    <TableCell className="sticky right-0 bg-white/95 text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)]">
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
                      <div className="flex flex-col items-center gap-2 text-slate-500">
                        <div className="rounded-2xl bg-slate-100 p-3">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <p className="font-medium text-slate-900">No hay solicitudes por revisar</p>
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

      <Dialog
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
            setReviewNote('');
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisar solicitud</DialogTitle>
            <DialogDescription>
              Confirma si autorizas la accion solicitada por el vendedor.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Tipo</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {getRequestTypeLabel(selectedRequest.requestType)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
                  <p className="mt-1 font-medium text-slate-900">{getStatusLabel(selectedRequest.status)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Vendedor</p>
                  <p className="mt-1 font-medium text-slate-900">{selectedRequest.requestedBy}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Cliente</p>
                  <p className="mt-1 font-medium text-slate-900">{selectedRequest.customerName || 'Cliente'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Venta</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{selectedRequest.saleSummary}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Motivo enviado</p>
                <p className="mt-1 text-sm text-slate-700">{selectedRequest.reason}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">Nota del administrador</p>
                <Textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Opcional: agrega una nota para dejar claro por que apruebas o rechazas."
                  rows={4}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={() => void handleReview('rejected')}
              disabled={!selectedRequest || selectedRequest.status !== 'pending'}
            >
              Rechazar
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => void handleReview('approved')}
              disabled={!selectedRequest || selectedRequest.status !== 'pending'}
            >
              Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
