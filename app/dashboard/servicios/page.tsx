'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Wrench } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { ServiceFormDialog, type ServiceFormValues } from '@/components/admin/services/service-form-dialog';
import { filterProductsByCategoryFamily } from '@/lib/admin/category-rules';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDateTime, formatNumber, getProductById } from '@/lib/admin/calculations';
import { getDateKeyInBogota, getTodayDateInputValue, toOperationalDateISOString } from '@/lib/admin/date-utils';
import { serviceTypeLabels } from '@/lib/admin/catalogs';
import type { ServiceOrderStatus } from '@/lib/admin/types';

const serviceOrderStatusLabels: Record<ServiceOrderStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En trabajo',
  ready: 'Listo por entregar',
  delivered: 'Entregado y cobrado',
  cancelled: 'Cancelado',
};

const serviceOrderStatusClasses: Record<ServiceOrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  ready: 'bg-blue-50 text-blue-700 border-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

function getServiceStatus(service: { status?: ServiceOrderStatus }): ServiceOrderStatus {
  return service.status ?? 'delivered';
}

function isOpenServiceStatus(status: ServiceOrderStatus) {
  return status === 'pending' || status === 'in_progress' || status === 'ready';
}

export default function ServiciosPage() {
  const { services, products, purchases, movements, customers, registerService, updateService } = useAdminData();
  const { profile, role, user } = useAuth();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const isSalesUser = role === 'sales';
  const canEditServices = role === 'admin' || role === 'superadmin';
  const currentMonth = getTodayDateInputValue().slice(0, 7);
  const getServiceDisplayLabel = (service: (typeof services)[number]) =>
    service.serviceLabel?.trim() || serviceTypeLabels[service.serviceType];
  const editableService = services.find((service) => service.id === editingServiceId) ?? null;
  const tipProductIds = new Set(filterProductsByCategoryFamily(products, 'casquillos').map((product) => product.id));
  const ferruleProductIds = new Set(filterProductsByCategoryFamily(products, 'virolas').map((product) => product.id));
  const suppressorProductIds = new Set(filterProductsByCategoryFamily(products, 'supresores').map((product) => product.id));
  const extensionProductIds = new Set(filterProductsByCategoryFamily(products, 'extensiones').map((product) => product.id));
  const bumperProductIds = new Set(filterProductsByCategoryFamily(products, 'parachoques').map((product) => product.id));

  const editingInitialValues: ServiceFormValues | undefined = editableService
    ? {
        serviceType: editableService.serviceType,
        serviceLabel: editableService.serviceLabel ?? '',
        serviceCategory: editableService.serviceCategory ?? 'torno',
        status: getServiceStatus(editableService),
        performedAt: editableService.performedAt.slice(0, 10),
        customerName: editableService.customerName,
        customerPhone: editableService.customerPhone ?? '',
        customerDocument: editableService.customerDocument ?? '',
        cueReference: editableService.cueReference,
        paymentMethod: editableService.paymentMethod ?? 'efectivo',
        paymentReference: editableService.paymentReference ?? '',
        servicePrice: editableService.servicePrice,
        amountPaid: Number(editableService.amountPaid ?? editableService.totalRevenue ?? 0),
        serviceCost: Number(editableService.totalOperationalCost ?? 0),
        tipProductId: editableService.materials.find((item) => tipProductIds.has(item.productId))?.productId ?? '',
        tipVariantId: editableService.materials.find((item) => tipProductIds.has(item.productId))?.variantId ?? '',
        ferruleProductId: editableService.materials.find((item) => ferruleProductIds.has(item.productId))?.productId ?? '',
        ferruleVariantId: editableService.materials.find((item) => ferruleProductIds.has(item.productId))?.variantId ?? '',
        suppressorProductId: editableService.materials.find((item) => suppressorProductIds.has(item.productId))?.productId ?? '',
        suppressorVariantId: editableService.materials.find((item) => suppressorProductIds.has(item.productId))?.variantId ?? '',
        includeSuppressor: editableService.materials.some((item) => suppressorProductIds.has(item.productId)),
        extensionProductId: editableService.materials.find((item) => extensionProductIds.has(item.productId))?.productId ?? '',
        extensionVariantId: editableService.materials.find((item) => extensionProductIds.has(item.productId))?.variantId ?? '',
        bumperProductId: editableService.materials.find((item) => bumperProductIds.has(item.productId))?.productId ?? '',
        bumperVariantId: editableService.materials.find((item) => bumperProductIds.has(item.productId))?.variantId ?? '',
        notes: editableService.notes ?? '',
      }
    : undefined;

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return services.filter((service) => {
      const materialNames = service.materials
        .map((item) => {
          const productName = getProductById(products, item.productId)?.name ?? '';
          return item.variantName ? `${productName} ${item.variantName}`.trim() : productName;
        })
        .join(' ');
      const statusLabel = serviceOrderStatusLabels[getServiceStatus(service)];
      const content = `${getServiceDisplayLabel(service)} ${statusLabel} ${service.customerName} ${service.customerPhone ?? ''} ${service.customerDocument ?? ''} ${service.cueReference} ${service.notes} ${materialNames}`.toLowerCase();
      return !normalizedQuery || content.includes(normalizedQuery);
    });
  }, [products, query, services]);

  const monthTotals = useMemo(
    () =>
      filteredServices.reduce(
        (accumulator, service) => {
          const status = getServiceStatus(service);
          if (isOpenServiceStatus(status)) {
            accumulator.openCount += 1;
            accumulator.pendingBalance += Number(service.balanceDue ?? service.servicePrice ?? 0);
            accumulator.pendingMaterialCost += Number(service.totalMaterialCost ?? 0);
            accumulator.advances += Number(service.amountPaid ?? 0);
          }

          if (getDateKeyInBogota(service.performedAt).slice(0, 7) !== currentMonth || status !== 'delivered') {
            return accumulator;
          }

          accumulator.deliveredCount += 1;
          accumulator.revenue += service.totalRevenue;
          accumulator.cost += service.totalCost ?? service.totalMaterialCost;
          accumulator.profit += service.grossProfit;
          return accumulator;
        },
        {
          deliveredCount: 0,
          openCount: 0,
          pendingBalance: 0,
          pendingMaterialCost: 0,
          advances: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        }
      ),
    [currentMonth, filteredServices]
  );

  const buildMaterialChips = (service: (typeof filteredServices)[number]) =>
    service.materials.map((item) => {
      const product = getProductById(products, item.productId);
      const variantSuffix = item.variantName ? ` - ${item.variantName}` : '';
      return `${product?.name ?? 'Producto'}${variantSuffix} x${formatNumber(item.quantity)}`;
    });

  const buildMaterialMeta = (service: (typeof filteredServices)[number]) => {
    const materialChips = buildMaterialChips(service);
    const visibleCount = service.source === 'sale-addon' ? 1 : isSalesUser ? 2 : 3;
    const visibleChips = materialChips.slice(0, visibleCount);
    const hiddenCount = Math.max(0, materialChips.length - visibleCount);
    const detailLabel =
      service.source === 'sale-addon'
        ? hiddenCount > 0
          ? `Asociado a venta · ${formatNumber(materialChips.length)} materiales`
          : 'Asociado a venta'
        : materialChips.length > 1
          ? `${formatNumber(materialChips.length)} materiales`
          : materialChips.length === 1
            ? '1 material'
            : 'Sin materiales';

    return {
      materialChips,
      visibleChips,
      hiddenCount,
      detailLabel,
      isSaleAddon: service.source === 'sale-addon',
    };
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Torno y reparaciones"
        title="Servicios"
        description="Gestiona ordenes pendientes, materiales consumidos, anticipos y servicios cobrados."
        actions={
          <Button onClick={() => setOpenDialog(true)} className="w-full rounded-xl sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Registrar servicio
          </Button>
        }
      />

      <div className={`grid gap-4 sm:gap-6 ${isSalesUser ? 'sm:grid-cols-2 lg:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Ordenes abiertas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatNumber(monthTotals.openCount)}</p>
          <p className="mt-2 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">Pendientes, en trabajo o listas por entregar.</p>
        </div>
        {isSalesUser ? (
          <div className="rounded-[28px] border border-cyan-200 bg-[linear-gradient(180deg,rgba(236,254,255,0.98)_0%,rgba(207,250,254,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-cyan-900/70 dark:bg-[linear-gradient(180deg,rgba(8,47,73,0.52)_0%,rgba(14,116,144,0.24)_100%)] sm:p-6">
            <p className="text-sm text-cyan-800 dark:text-cyan-200">Saldo por cobrar</p>
            <p className="mt-3 text-3xl font-semibold text-cyan-950 dark:text-cyan-50">{formatCurrency(monthTotals.pendingBalance)}</p>
            <p className="mt-2 hidden text-sm text-cyan-900 dark:text-cyan-100 sm:block">De ordenes abiertas.</p>
          </div>
        ) : (
          <>
            <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
              <p className="text-sm text-slate-500 dark:text-slate-400">Ingresos reales del mes</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{formatCurrency(monthTotals.revenue)}</p>
              <p className="mt-2 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">Solo servicios entregados y cobrados en {currentMonth}.</p>
            </div>
            <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-amber-900/70 dark:bg-[linear-gradient(180deg,rgba(120,53,15,0.34)_0%,rgba(146,64,14,0.22)_100%)] sm:p-6">
              <p className="text-sm text-amber-800 dark:text-amber-200">Saldo por cobrar</p>
              <p className="mt-3 text-3xl font-semibold text-amber-950 dark:text-amber-50">{formatCurrency(monthTotals.pendingBalance)}</p>
              <p className="mt-2 hidden text-sm text-amber-900 dark:text-amber-100 sm:block">Material comprometido: {formatCurrency(monthTotals.pendingMaterialCost)}.</p>
            </div>
            <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(209,250,229,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-emerald-900/70 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.38)_0%,rgba(5,150,105,0.2)_100%)] sm:p-6">
              <p className="text-sm text-emerald-800 dark:text-emerald-200">Utilidad del torno</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-950 dark:text-emerald-50">{formatCurrency(monthTotals.profit)}</p>
              <p className="mt-2 hidden text-sm text-emerald-900 dark:text-emerald-100 sm:block">{formatNumber(monthTotals.deliveredCount)} servicios entregados en el mes actual.</p>
            </div>
          </>
        )}
      </div>

      <div className="space-y-4 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cliente, servicio, taco o material"
            className="rounded-2xl border-slate-200 bg-white/90 pl-9 shadow-sm dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-100"
          />
        </div>

        {filteredServices.length > 0 ? (
          <>
            <div className="space-y-3 md:hidden">
                {filteredServices.map((service) => {
                  const { materialChips, hiddenCount, isSaleAddon } = buildMaterialMeta(service);
                  const status = getServiceStatus(service);
                  const materialsSummary = materialChips.join(', ');
                  const operationalCost = Number(service.totalOperationalCost ?? 0);
                  const materialCost = Number(service.totalMaterialCost ?? 0);
                  const totalCost = Number(service.totalCost ?? materialCost + operationalCost);
                  const rowHoverSummary = [
                    getServiceDisplayLabel(service),
                    `Estado: ${serviceOrderStatusLabels[status]}`,
                    `Cliente: ${service.customerName}`,
                    `Referencia: ${service.cueReference}`,
                    `Categoria: ${service.serviceCategory || 'General'}`,
                    `Valor acordado: ${formatCurrency(service.servicePrice)}`,
                    `Cobrado: ${formatCurrency(service.amountPaid ?? service.totalRevenue)}`,
                    `Saldo: ${formatCurrency(service.balanceDue ?? 0)}`,
                    `Ingreso reconocido: ${formatCurrency(service.totalRevenue)}`,
                    `Costo: ${formatCurrency(totalCost)}`,
                    `Materiales: ${formatCurrency(materialCost)}`,
                    `Operativo: ${formatCurrency(operationalCost)}`,
                    !isSalesUser ? `Utilidad: ${formatCurrency(service.grossProfit)}` : '',
                    `Materiales: ${materialsSummary}`,
                    `Fecha: ${formatDateTime(service.performedAt)}`,
                  ]
                    .filter(Boolean)
                    .join('\n');

                  return (
                    <article
                      key={service.id}
                      className="rounded-[22px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.94)_100%)] p-3.5 shadow-sm dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.86)_100%)]"
                      title={rowHoverSummary}
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{getServiceDisplayLabel(service)}</p>
                        <p className="truncate text-sm text-slate-500 dark:text-slate-400">{service.cueReference}</p>
                        <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${serviceOrderStatusClasses[status]}`}>
                          {serviceOrderStatusLabels[status]}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <p className="text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(service.servicePrice)}
                        </p>
                        {canEditServices && service.source !== 'sale-addon' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-xl px-2.5"
                            onClick={() => {
                              setEditingServiceId(service.id);
                              setOpenDialog(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                      <p><span className="font-medium text-slate-800">Cliente:</span> {service.customerName}</p>
                      <p><span className="font-medium text-slate-800">Cobrado:</span> {formatCurrency(service.amountPaid ?? service.totalRevenue)}</p>
                      <p><span className="font-medium text-slate-800">Saldo:</span> {formatCurrency(service.balanceDue ?? 0)}</p>
                      <p>
                        <span className="font-medium text-slate-800">Materiales:</span>{' '}
                        {isSaleAddon && hiddenCount > 0
                          ? `${materialChips[0]} + ${formatNumber(hiddenCount)} mas`
                          : materialsSummary}
                      </p>
                      <p><span className="font-medium text-slate-800">Categoria:</span> {service.serviceCategory || 'General'}</p>
                      {!isSalesUser ? (
                        <div className="rounded-2xl bg-slate-50/80 px-3 py-2">
                          <p><span className="font-medium text-slate-800">Costo total:</span> {formatCurrency(totalCost)}</p>
                          <p className="text-xs text-slate-500">
                            Materiales {formatCurrency(materialCost)} + Operativo {formatCurrency(operationalCost)}
                          </p>
                        </div>
                      ) : null}
                      <p><span className="font-medium text-slate-800">Fecha:</span> {formatDateTime(service.performedAt)}</p>
                      {service.notes ? <p><span className="font-medium text-slate-800">Nota:</span> {service.notes}</p> : null}
                      {!isSalesUser ? (
                        <p className="text-emerald-700">
                          <span className="font-medium">Utilidad:</span> {formatCurrency(service.grossProfit)}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden min-w-0 md:block">
            <div className="mb-2 hidden text-xs text-slate-500 lg:block">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
            <div className="pb-2">
            <Table className={isSalesUser ? 'min-w-[1080px]' : 'min-w-[900px]'}>
              <TableHeader>
                <TableRow>
                  <TableHead className={isSalesUser ? 'w-[200px]' : undefined}>Servicio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className={isSalesUser ? 'w-[190px]' : undefined}>Cliente</TableHead>
                  <TableHead className={isSalesUser ? 'w-[360px]' : undefined}>Materiales</TableHead>
                  <TableHead className={isSalesUser ? 'w-[150px] whitespace-nowrap' : undefined}>Valor</TableHead>
                  {!isSalesUser ? <TableHead>Costo</TableHead> : null}
                  {!isSalesUser ? <TableHead>Utilidad</TableHead> : null}
                  <TableHead className={isSalesUser ? 'w-[160px] whitespace-nowrap' : undefined}>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServices.map((service) => {
                    const { materialChips, visibleChips, hiddenCount, detailLabel, isSaleAddon } = buildMaterialMeta(service);
                    const status = getServiceStatus(service);
                    const materialsSummary = materialChips.join(', ');
                    const operationalCost = Number(service.totalOperationalCost ?? 0);
                    const materialCost = Number(service.totalMaterialCost ?? 0);
                    const totalCost = Number(service.totalCost ?? materialCost + operationalCost);
                    const rowHoverSummary = [
                      getServiceDisplayLabel(service),
                      `Estado: ${serviceOrderStatusLabels[status]}`,
                      `Cliente: ${service.customerName}`,
                      `Responsable: ${service.responsibleUser}`,
                      `Referencia: ${service.cueReference}`,
                      `Categoria: ${service.serviceCategory || 'General'}`,
                      `Valor acordado: ${formatCurrency(service.servicePrice)}`,
                      `Cobrado: ${formatCurrency(service.amountPaid ?? service.totalRevenue)}`,
                      `Saldo: ${formatCurrency(service.balanceDue ?? 0)}`,
                      `Ingreso reconocido: ${formatCurrency(service.totalRevenue)}`,
                      `Costo: ${formatCurrency(totalCost)}`,
                      `Materiales: ${formatCurrency(materialCost)}`,
                      `Operativo: ${formatCurrency(operationalCost)}`,
                      !isSalesUser ? `Utilidad: ${formatCurrency(service.grossProfit)}` : '',
                      `Materiales: ${materialsSummary}`,
                      service.notes ? `Nota: ${service.notes}` : '',
                      `Fecha: ${formatDateTime(service.performedAt)}`,
                    ]
                      .filter(Boolean)
                      .join('\n');

                    return (
                      <TableRow key={service.id} title={rowHoverSummary}>
                        <TableCell className={isSalesUser ? 'align-top' : undefined}>
                        <div>
                          <p className="font-medium text-slate-900">{getServiceDisplayLabel(service)}</p>
                          <p className="text-xs text-slate-500">{service.cueReference}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${serviceOrderStatusClasses[status]}`}>
                          {serviceOrderStatusLabels[status]}
                        </span>
                      </TableCell>
                      <TableCell className={isSalesUser ? 'align-top' : undefined}>
                        <div>
                          <p>{service.customerName}</p>
                          <p className="text-xs text-slate-500">{service.responsibleUser}</p>
                        </div>
                      </TableCell>
                      <TableCell className={isSalesUser ? 'max-w-[280px] align-top' : 'max-w-[260px] align-top'}>
                        <div className="flex flex-wrap gap-1.5">
                          {visibleChips.map((materialLabel) => (
                            <span
                              key={`${service.id}-${materialLabel}`}
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                isSaleAddon ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {materialLabel}
                            </span>
                          ))}
                          {hiddenCount > 0 ? (
                            <span className="inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700">
                              +{hiddenCount} mas
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{detailLabel}</p>
                      </TableCell>
                      <TableCell className={isSalesUser ? 'align-top whitespace-nowrap font-semibold text-slate-900' : undefined}>
                        <div>
                          <p className="font-semibold text-slate-900">{formatCurrency(service.servicePrice)}</p>
                          <p className="text-xs text-slate-500">Cobrado {formatCurrency(service.amountPaid ?? service.totalRevenue)}</p>
                          <p className="text-xs text-slate-500">Saldo {formatCurrency(service.balanceDue ?? 0)}</p>
                        </div>
                      </TableCell>
                      {!isSalesUser ? (
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{formatCurrency(totalCost)}</p>
                            <p className="text-xs text-slate-500">
                              Mat. {formatCurrency(materialCost)} + Op. {formatCurrency(operationalCost)}
                            </p>
                          </div>
                        </TableCell>
                      ) : null}
                      {!isSalesUser ? (
                        <TableCell className="font-medium text-emerald-700">{formatCurrency(service.grossProfit)}</TableCell>
                      ) : null}
                      <TableCell className={isSalesUser ? 'align-top whitespace-nowrap' : undefined}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{formatDateTime(service.performedAt)}</span>
                          {canEditServices && service.source !== 'sale-addon' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-xl px-2"
                              onClick={() => {
                                setEditingServiceId(service.id);
                                setOpenDialog(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            </div>
          </>
        ) : (
          <Empty className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 py-12">
            <EmptyHeader>
              <EmptyMedia className="bg-cyan-100 text-cyan-700">
                <Wrench className="h-6 w-6" />
              </EmptyMedia>
              <EmptyTitle>No hay servicios registrados</EmptyTitle>
              <EmptyDescription>
                Empieza registrando instalaciones de casquillo, virola, supresor o extension para descontar materiales y medir la ganancia del torno.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <ServiceFormDialog
        open={openDialog}
        onOpenChange={(nextOpen) => {
          setOpenDialog(nextOpen);
          if (!nextOpen) {
            setEditingServiceId(null);
          }
        }}
        products={products}
        purchases={purchases}
        movements={movements}
        customers={customers}
        hideFinancialSummary={isSalesUser}
        initialValues={editingInitialValues}
        submitLabel={editableService ? 'Guardar cambios' : 'Guardar servicio'}
        onSubmit={async (values: ServiceFormValues) => {
          const resolveVariantName = (productId: string, variantId?: string) =>
            products.find((product) => product.id === productId)?.variants?.find((variant) => variant.id === variantId)?.name;
          const needsTip = values.serviceType === 'tip-installation' || values.serviceType === 'tip-ferrule-installation';
          const needsFerrule = values.serviceType === 'ferrule-installation' || values.serviceType === 'tip-ferrule-installation';
          const needsExtension = values.serviceType === 'extension-installation';
          const allowsSuppressor = needsTip || needsFerrule;
          const materials = [
            needsTip && values.tipProductId
              ? {
                  productId: values.tipProductId,
                  variantId: values.tipVariantId || undefined,
                  variantName: resolveVariantName(values.tipProductId, values.tipVariantId || undefined),
                  quantity: 1,
                }
              : null,
            needsFerrule && values.ferruleProductId
              ? {
                  productId: values.ferruleProductId,
                  variantId: values.ferruleVariantId || undefined,
                  variantName: resolveVariantName(values.ferruleProductId, values.ferruleVariantId || undefined),
                  quantity: 1,
                }
              : null,
            allowsSuppressor && values.includeSuppressor && values.suppressorProductId
              ? {
                  productId: values.suppressorProductId,
                  variantId: values.suppressorVariantId || undefined,
                  variantName: resolveVariantName(values.suppressorProductId, values.suppressorVariantId || undefined),
                  quantity: 1,
                }
              : null,
            needsExtension && values.extensionProductId
              ? {
                  productId: values.extensionProductId,
                  variantId: values.extensionVariantId || undefined,
                  variantName: resolveVariantName(values.extensionProductId, values.extensionVariantId || undefined),
                  quantity: 1,
                }
              : null,
            needsExtension && values.bumperProductId
              ? {
                  productId: values.bumperProductId,
                  variantId: values.bumperVariantId || undefined,
                  variantName: resolveVariantName(values.bumperProductId, values.bumperVariantId || undefined),
                  quantity: 1,
                }
              : null,
          ].filter((item): item is NonNullable<typeof item> => Boolean(item));

          const payload = {
            serviceType: values.serviceType,
            serviceLabel: values.serviceLabel,
            serviceCategory: values.serviceCategory,
            status: values.status,
            performedAt: toOperationalDateISOString(values.performedAt),
            deliveredAt: values.status === 'delivered' ? toOperationalDateISOString(values.performedAt) : undefined,
            cancelledAt: values.status === 'cancelled' ? toOperationalDateISOString(values.performedAt) : undefined,
            customerName: values.customerName,
            customerPhone: values.customerPhone,
            customerDocument: values.customerDocument,
            cueReference: values.cueReference,
            paymentMethod: 'efectivo',
            paymentReference: '',
            servicePrice: values.servicePrice,
            amountPaid: values.amountPaid,
            serviceCost: values.serviceCost,
            materials,
            notes: values.notes,
            actorRole: role ?? 'admin',
            responsibleUser:
              profile?.nombre?.trim() ||
              user?.displayName?.trim() ||
              user?.email?.trim() ||
              'Administrador',
          };

          if (editableService) {
            await updateService(editableService.id, payload);
          } else {
            await registerService(payload);
          }

          setOpenDialog(false);
          setEditingServiceId(null);
          toast({
            title: editableService ? 'Servicio actualizado' : 'Servicio registrado',
            description: editableService
              ? 'Los cambios del servicio ya quedaron aplicados y el inventario fue recalculado.'
              : values.status === 'delivered'
                ? 'El trabajo quedo entregado/cobrado y el inventario ya fue descontado.'
                : 'La orden quedo abierta, el material fue descontado y el saldo queda por cobrar.',
          });
        }}
      />
    </div>
  );
}
