'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, Wrench } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { ServiceFormDialog, type ServiceFormValues } from '@/components/admin/services/service-form-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDateTime, formatNumber, getProductById } from '@/lib/admin/calculations';
import { serviceTypeLabels } from '@/lib/admin/catalogs';

const currentMonth = new Date().toISOString().slice(0, 7);

export default function ServiciosPage() {
  const { services, products, purchases, movements, registerService } = useAdminData();
  const { profile, role, user } = useAuth();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [query, setQuery] = useState('');
  const isSalesUser = role === 'sales';

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return services.filter((service) => {
      const materialNames = service.materials
        .map((item) => getProductById(products, item.productId)?.name ?? '')
        .join(' ');
      const content = `${serviceTypeLabels[service.serviceType]} ${service.customerName} ${service.cueReference} ${service.notes} ${materialNames}`.toLowerCase();
      return !normalizedQuery || content.includes(normalizedQuery);
    });
  }, [products, query, services]);

  const monthTotals = useMemo(
    () =>
      filteredServices.reduce(
        (accumulator, service) => {
          if (!service.performedAt.startsWith(currentMonth)) return accumulator;
          accumulator.count += 1;
          accumulator.revenue += service.totalRevenue;
          accumulator.cost += service.totalCost ?? service.totalMaterialCost;
          accumulator.profit += service.grossProfit;
          return accumulator;
        },
        { count: 0, revenue: 0, cost: 0, profit: 0 }
      ),
    [filteredServices]
  );

  const buildMaterialChips = (service: (typeof filteredServices)[number]) =>
    service.materials.map((item) => {
      const product = getProductById(products, item.productId);
      return `${product?.name ?? 'Producto'} x${formatNumber(item.quantity)}`;
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
        description={
          isSalesUser
            ? 'Registra trabajos como instalacion de casquillos, virolas, supresores y extensiones para descontar inventario y dejar trazabilidad del servicio.'
            : 'Registra trabajos como instalacion de casquillos, virolas, supresores y extensiones para descontar inventario y medir la utilidad real del torno.'
        }
        actions={
          <Button onClick={() => setOpenDialog(true)} className="w-full rounded-xl sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Registrar servicio
          </Button>
        }
      />

      <div className={`grid gap-4 sm:gap-6 ${isSalesUser ? 'sm:grid-cols-2 lg:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
          <p className="text-sm text-slate-500">Servicios registrados</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatNumber(filteredServices.length)}</p>
          <p className="mt-2 text-sm text-slate-500">Trabajos visibles con el filtro actual.</p>
        </div>
        {isSalesUser ? (
          <div className="rounded-[28px] border border-cyan-200 bg-[linear-gradient(180deg,rgba(236,254,255,0.98)_0%,rgba(207,250,254,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
            <p className="text-sm text-cyan-800">Servicios del mes</p>
            <p className="mt-3 text-3xl font-semibold text-cyan-950">{formatNumber(monthTotals.count)}</p>
            <p className="mt-2 text-sm text-cyan-900">Trabajos registrados en {currentMonth}.</p>
          </div>
        ) : (
          <>
            <div className="rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
              <p className="text-sm text-slate-500">Ingresos del mes</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(monthTotals.revenue)}</p>
              <p className="mt-2 text-sm text-slate-500">Total cobrado en {currentMonth}.</p>
            </div>
            <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
              <p className="text-sm text-amber-800">Costo del servicio</p>
              <p className="mt-3 text-3xl font-semibold text-amber-950">{formatCurrency(monthTotals.cost)}</p>
              <p className="mt-2 text-sm text-amber-900">Incluye materiales y costo operativo cuando aplique.</p>
            </div>
            <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.98)_0%,rgba(209,250,229,0.82)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
              <p className="text-sm text-emerald-800">Utilidad del torno</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-950">{formatCurrency(monthTotals.profit)}</p>
              <p className="mt-2 text-sm text-emerald-900">{formatNumber(monthTotals.count)} servicios en el mes actual.</p>
            </div>
          </>
        )}
      </div>

      <div className="space-y-4 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cliente, servicio, taco o material"
            className="rounded-2xl border-slate-200 bg-white/90 pl-9 shadow-sm"
          />
        </div>

        {filteredServices.length > 0 ? (
          <>
            <div className="space-y-3 md:hidden">
                {filteredServices.map((service) => {
                  const { materialChips, hiddenCount, isSaleAddon } = buildMaterialMeta(service);
                  const materialsSummary = materialChips.join(', ');
                  const rowHoverSummary = [
                    serviceTypeLabels[service.serviceType],
                    `Cliente: ${service.customerName}`,
                    `Referencia: ${service.cueReference}`,
                    `Categoria: ${service.serviceCategory || 'General'}`,
                    `Valor: ${formatCurrency(service.totalRevenue)}`,
                    `Costo: ${formatCurrency(service.totalCost ?? service.totalMaterialCost)}`,
                    !isSalesUser ? `Utilidad: ${formatCurrency(service.grossProfit)}` : '',
                    `Materiales: ${materialsSummary}`,
                    `Fecha: ${formatDateTime(service.performedAt)}`,
                  ]
                    .filter(Boolean)
                    .join('\n');

                  return (
                    <article
                      key={service.id}
                      className="rounded-[22px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.94)_100%)] p-4 shadow-sm"
                      title={rowHoverSummary}
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{serviceTypeLabels[service.serviceType]}</p>
                        <p className="truncate text-sm text-slate-500">{service.cueReference}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-slate-900">{formatCurrency(service.totalRevenue)}</p>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <p><span className="font-medium text-slate-800">Cliente:</span> {service.customerName}</p>
                      <p>
                        <span className="font-medium text-slate-800">Materiales:</span>{' '}
                        {isSaleAddon && hiddenCount > 0
                          ? `${materialChips[0]} + ${formatNumber(hiddenCount)} mas`
                          : materialsSummary}
                      </p>
                      <p><span className="font-medium text-slate-800">Categoria:</span> {service.serviceCategory || 'General'}</p>
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
            <div className="mb-2 text-xs text-slate-500">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
            <div className="pb-2">
            <Table className={isSalesUser ? 'min-w-[1080px]' : 'min-w-[900px]'}>
              <TableHeader>
                <TableRow>
                  <TableHead className={isSalesUser ? 'w-[200px]' : undefined}>Servicio</TableHead>
                  <TableHead className={isSalesUser ? 'w-[190px]' : undefined}>Cliente</TableHead>
                  <TableHead className={isSalesUser ? 'w-[360px]' : undefined}>Materiales</TableHead>
                  <TableHead className={isSalesUser ? 'w-[150px] whitespace-nowrap' : undefined}>Valor cobrado</TableHead>
                  {!isSalesUser ? <TableHead>Costo</TableHead> : null}
                  {!isSalesUser ? <TableHead>Utilidad</TableHead> : null}
                  <TableHead className={isSalesUser ? 'w-[160px] whitespace-nowrap' : undefined}>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServices.map((service) => {
                    const { materialChips, visibleChips, hiddenCount, detailLabel, isSaleAddon } = buildMaterialMeta(service);
                    const materialsSummary = materialChips.join(', ');
                    const rowHoverSummary = [
                      serviceTypeLabels[service.serviceType],
                      `Cliente: ${service.customerName}`,
                      `Responsable: ${service.responsibleUser}`,
                      `Referencia: ${service.cueReference}`,
                      `Categoria: ${service.serviceCategory || 'General'}`,
                      `Valor: ${formatCurrency(service.totalRevenue)}`,
                      `Costo: ${formatCurrency(service.totalCost ?? service.totalMaterialCost)}`,
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
                          <p className="font-medium text-slate-900">{serviceTypeLabels[service.serviceType]}</p>
                          <p className="text-xs text-slate-500">{service.cueReference}</p>
                        </div>
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
                        {formatCurrency(service.totalRevenue)}
                      </TableCell>
                      {!isSalesUser ? <TableCell>{formatCurrency(service.totalCost ?? service.totalMaterialCost)}</TableCell> : null}
                      {!isSalesUser ? (
                        <TableCell className="font-medium text-emerald-700">{formatCurrency(service.grossProfit)}</TableCell>
                      ) : null}
                      <TableCell className={isSalesUser ? 'align-top whitespace-nowrap' : undefined}>
                        {formatDateTime(service.performedAt)}
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
        onOpenChange={setOpenDialog}
        products={products}
        purchases={purchases}
        movements={movements}
        hideFinancialSummary={isSalesUser}
        onSubmit={async (values: ServiceFormValues) => {
          const materials = [
            values.tipProductId ? { productId: values.tipProductId, quantity: 1 } : null,
            values.serviceType === 'tip-ferrule-installation' && values.ferruleProductId
              ? { productId: values.ferruleProductId, quantity: 1 }
              : null,
            values.includeSuppressor && values.suppressorProductId
              ? { productId: values.suppressorProductId, quantity: 1 }
              : null,
            values.serviceType === 'extension-installation' && values.extensionProductId
              ? { productId: values.extensionProductId, quantity: 1 }
              : null,
            values.serviceType === 'extension-installation' && values.bumperProductId
              ? { productId: values.bumperProductId, quantity: 1 }
              : null,
          ].filter((item): item is { productId: string; quantity: number } => Boolean(item));

          await registerService({
            serviceType: values.serviceType,
            serviceCategory: values.serviceCategory,
            performedAt: values.performedAt,
            customerName: values.customerName,
            cueReference: values.cueReference,
            servicePrice: values.servicePrice,
            materials,
            notes: values.notes,
            actorRole: role ?? 'admin',
            responsibleUser:
              profile?.nombre?.trim() ||
              user?.displayName?.trim() ||
              user?.email?.trim() ||
              'Administrador',
          });

          setOpenDialog(false);
          toast({
            title: 'Servicio registrado',
            description: 'El trabajo del torno se guardo y el inventario ya fue descontado.',
          });
        }}
      />
    </div>
  );
}
