'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CalendarDays,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  WalletCards,
} from 'lucide-react';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { AdminListPagination } from '@/components/admin/shared/admin-list-pagination';
import { ResponsiveRowActions } from '@/components/admin/shared/responsive-row-actions';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useAuth } from '@/components/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/admin/calculations';
import { getDateKeyInBogota, getTodayDateInputValue } from '@/lib/admin/date-utils';
import type {
  BusinessExpense,
  BusinessExpenseArea,
  BusinessExpenseCategory,
  BusinessExpenseStatus,
} from '@/lib/admin/types';
import { cn } from '@/lib/utils';

type ExpenseFormState = {
  expenseDate: string;
  category: BusinessExpenseCategory;
  area: BusinessExpenseArea;
  description: string;
  amount: string;
  paymentMethod: string;
  paymentReference: string;
  responsibleUser: string;
  notes: string;
};

type ExpenseFilterStatus = BusinessExpenseStatus | 'all';

const expensePageSize = 12;

const expenseCategoryOptions: Array<{ value: BusinessExpenseCategory; label: string }> = [
  { value: 'turning-supplies', label: 'Insumos de torno' },
  { value: 'utilities', label: 'Servicios publicos' },
  { value: 'transport', label: 'Transporte' },
  { value: 'rent', label: 'Arriendo' },
  { value: 'internet', label: 'Internet' },
  { value: 'packaging', label: 'Empaques' },
  { value: 'advertising', label: 'Publicidad' },
  { value: 'tools', label: 'Herramientas' },
  { value: 'payroll', label: 'Nomina' },
  { value: 'other', label: 'Otro gasto' },
];

const expenseAreaOptions: Array<{ value: BusinessExpenseArea; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'sales', label: 'Ventas' },
  { value: 'turning', label: 'Torno' },
  { value: 'web', label: 'Pagina web' },
  { value: 'administration', label: 'Administracion' },
];

const paymentMethodOptions = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

const categoryLabelMap = Object.fromEntries(
  expenseCategoryOptions.map((option) => [option.value, option.label])
) as Record<BusinessExpenseCategory, string>;
const areaLabelMap = Object.fromEntries(
  expenseAreaOptions.map((option) => [option.value, option.label])
) as Record<BusinessExpenseArea, string>;
const paymentMethodLabelMap = Object.fromEntries(
  paymentMethodOptions.map((option) => [option.value, option.label])
) as Record<string, string>;

function getInitialExpenseForm(responsibleUser: string, expense?: BusinessExpense | null): ExpenseFormState {
  return {
    expenseDate: expense ? getDateKeyInBogota(expense.expenseDate) : getTodayDateInputValue(),
    category: expense?.category ?? 'other',
    area: expense?.area ?? 'general',
    description: expense?.description ?? '',
    amount: expense ? String(expense.amount) : '',
    paymentMethod: expense?.paymentMethod ?? 'efectivo',
    paymentReference: expense?.paymentReference ?? '',
    responsibleUser: expense?.responsibleUser ?? responsibleUser,
    notes: expense?.notes ?? '',
  };
}

function getNormalizedExpenseAmount(value: string) {
  const normalizedValue = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const amount = Number(normalizedValue);
  return Number.isFinite(amount) ? amount : 0;
}

function sumActiveExpenses(expenses: BusinessExpense[]) {
  return expenses
    .filter((expense) => expense.status === 'active')
    .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
}

export default function GastosPage() {
  const { expenses, createExpense, updateExpense, voidExpense } = useAdminData();
  const { role, profile, user } = useAuth();
  const { toast } = useToast();
  const responsibleUser = profile?.nombre?.trim() || user?.displayName || user?.email || 'Administrador';
  const canManageExpenses = role === 'admin' || role === 'superadmin';
  const currentMonth = getTodayDateInputValue().slice(0, 7);
  const todayKey = getTodayDateInputValue();
  const [query, setQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedCategory, setSelectedCategory] = useState<BusinessExpenseCategory | 'all'>('all');
  const [selectedArea, setSelectedArea] = useState<BusinessExpenseArea | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<ExpenseFilterStatus>('active');
  const [expensePage, setExpensePage] = useState(1);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BusinessExpense | null>(null);
  const [formState, setFormState] = useState<ExpenseFormState>(() => getInitialExpenseForm(responsibleUser));
  const [isSaving, setIsSaving] = useState(false);

  const activeExpenses = useMemo(() => expenses.filter((expense) => expense.status === 'active'), [expenses]);
  const filteredExpenses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return expenses.filter((expense) => {
      const expenseMonth = getDateKeyInBogota(expense.expenseDate).slice(0, 7);
      const content = `${expense.description} ${expense.responsibleUser} ${expense.notes} ${expense.paymentReference ?? ''} ${categoryLabelMap[expense.category]} ${areaLabelMap[expense.area]}`.toLowerCase();

      return (
        (!normalizedQuery || content.includes(normalizedQuery)) &&
        (!selectedMonth || expenseMonth === selectedMonth) &&
        (selectedCategory === 'all' || expense.category === selectedCategory) &&
        (selectedArea === 'all' || expense.area === selectedArea) &&
        (selectedStatus === 'all' || expense.status === selectedStatus)
      );
    });
  }, [expenses, query, selectedArea, selectedCategory, selectedMonth, selectedStatus]);
  const totalPages = Math.max(Math.ceil(filteredExpenses.length / expensePageSize), 1);
  const paginatedExpenses = useMemo(
    () => filteredExpenses.slice((expensePage - 1) * expensePageSize, expensePage * expensePageSize),
    [expensePage, filteredExpenses]
  );

  const todayExpenses = useMemo(
    () => sumActiveExpenses(activeExpenses.filter((expense) => getDateKeyInBogota(expense.expenseDate) === todayKey)),
    [activeExpenses, todayKey]
  );
  const currentMonthExpenses = useMemo(
    () => sumActiveExpenses(activeExpenses.filter((expense) => getDateKeyInBogota(expense.expenseDate).startsWith(currentMonth))),
    [activeExpenses, currentMonth]
  );
  const visibleActiveTotal = useMemo(() => sumActiveExpenses(filteredExpenses), [filteredExpenses]);
  const topCategory = useMemo(() => {
    const totals = new Map<BusinessExpenseCategory, number>();
    activeExpenses.forEach((expense) => {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + Number(expense.amount ?? 0));
    });

    return Array.from(totals.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount)[0] ?? null;
  }, [activeExpenses]);

  useEffect(() => {
    setExpensePage(1);
  }, [query, selectedArea, selectedCategory, selectedMonth, selectedStatus]);

  useEffect(() => {
    setExpensePage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const openCreateDialog = () => {
    setEditingExpense(null);
    setFormState(getInitialExpenseForm(responsibleUser));
    setOpenDialog(true);
  };

  const openEditDialog = (expense: BusinessExpense) => {
    setEditingExpense(expense);
    setFormState(getInitialExpenseForm(responsibleUser, expense));
    setOpenDialog(true);
  };

  const handleSubmit = async () => {
    try {
      setIsSaving(true);
      const payload = {
        expenseDate: formState.expenseDate,
        category: formState.category,
        area: formState.area,
        description: formState.description,
        amount: getNormalizedExpenseAmount(formState.amount),
        paymentMethod: formState.paymentMethod,
        paymentReference: formState.paymentReference,
        responsibleUser: formState.responsibleUser,
        notes: formState.notes,
      };

      if (editingExpense) {
        await updateExpense(editingExpense.id, payload);
        toast({ title: 'Gasto actualizado', description: 'El historial financiero quedo corregido.' });
      } else {
        await createExpense(payload);
        toast({ title: 'Gasto registrado', description: 'Ya se descuenta en utilidad neta y reportes.' });
      }

      setOpenDialog(false);
      setEditingExpense(null);
      setFormState(getInitialExpenseForm(responsibleUser));
    } catch (error) {
      console.error('Error guardando gasto:', error);
      toast({
        title: 'No se pudo guardar el gasto',
        description: error instanceof Error ? error.message : 'Revisa los datos e intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoidExpense = async (expense: BusinessExpense) => {
    const reason = window.prompt(`Motivo para anular el gasto "${expense.description}"`);
    if (reason === null) return;

    try {
      await voidExpense(expense.id, reason);
      toast({ title: 'Gasto anulado', description: 'No se sumara en los reportes, pero queda trazabilidad.' });
    } catch (error) {
      toast({
        title: 'No se pudo anular el gasto',
        description: error instanceof Error ? error.message : 'Intenta nuevamente.',
        variant: 'destructive',
      });
    }
  };

  if (!canManageExpenses) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Costos operativos"
          title="Gastos"
          description="Este modulo esta reservado para administradores."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Costos operativos"
        title="Gastos"
        description="Registra gastos del negocio sin tocar inventario: luz, insumos, transporte, herramientas y pagos operativos."
        actions={
          <Button onClick={openCreateDialog} className="w-full rounded-xl sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo gasto
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[24px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/80">
          <p className="text-sm text-slate-500 dark:text-slate-400">Gastos de hoy</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-slate-50">{formatCurrency(todayExpenses)}</p>
        </div>
        <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.07)] dark:border-amber-900/60 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">Gastos del mes</p>
          <p className="mt-3 text-2xl font-semibold text-amber-950 dark:text-amber-50">{formatCurrency(currentMonthExpenses)}</p>
        </div>
        <div className="rounded-[24px] border border-cyan-200 bg-cyan-50/90 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.07)] dark:border-cyan-900/60 dark:bg-cyan-950/20">
          <p className="text-sm text-cyan-800 dark:text-cyan-200">Filtro actual</p>
          <p className="mt-3 text-2xl font-semibold text-cyan-950 dark:text-cyan-50">{formatCurrency(visibleActiveTotal)}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/80">
          <p className="text-sm text-slate-500 dark:text-slate-400">Rubro principal</p>
          <p className="mt-3 line-clamp-1 text-xl font-semibold text-slate-950 dark:text-slate-50">
            {topCategory ? categoryLabelMap[topCategory.category] : 'Sin gastos'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {topCategory ? formatCurrency(topCategory.amount) : 'Sin movimiento'}
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-4 rounded-[28px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_160px_180px_160px_150px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar gasto, responsable o referencia"
              className="rounded-2xl border-slate-200 bg-white/90 pl-9 shadow-sm dark:border-slate-700 dark:bg-slate-900/75"
            />
          </div>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-2xl border-slate-200 bg-white/90 shadow-sm dark:border-slate-700 dark:bg-slate-900/75"
          />
          <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as BusinessExpenseCategory | 'all')}>
            <SelectTrigger className="w-full rounded-2xl">
              <SelectValue placeholder="Rubro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los rubros</SelectItem>
              {expenseCategoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedArea} onValueChange={(value) => setSelectedArea(value as BusinessExpenseArea | 'all')}>
            <SelectTrigger className="w-full rounded-2xl">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las areas</SelectItem>
              {expenseAreaOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as ExpenseFilterStatus)}>
            <SelectTrigger className="w-full rounded-2xl">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="void">Anulados</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setSelectedMonth('')}>
            Todo
          </Button>
        </div>

        {filteredExpenses.length > 0 ? (
          <>
            <div className="space-y-3 md:hidden">
              {paginatedExpenses.map((expense) => (
                <div key={expense.id} className="rounded-[22px] border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            expense.status === 'void'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          )}
                        >
                          {expense.status === 'void' ? 'Anulado' : 'Activo'}
                        </Badge>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(expense.expenseDate)}</span>
                      </div>
                      <p className="mt-2 font-medium text-slate-950 dark:text-slate-100">{expense.description}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {categoryLabelMap[expense.category]} - {areaLabelMap[expense.area]}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">{formatCurrency(expense.amount)}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {paymentMethodLabelMap[expense.paymentMethod] ?? expense.paymentMethod} - {expense.responsibleUser}
                      </p>
                      {expense.status === 'void' && expense.voidReason ? (
                        <p className="mt-2 text-xs text-rose-700">Motivo: {expense.voidReason}</p>
                      ) : null}
                    </div>
                    <ResponsiveRowActions
                      actions={[
                        {
                          label: 'Editar',
                          icon: <Pencil className="h-4 w-4" />,
                          onClick: () => openEditDialog(expense),
                          disabled: expense.status === 'void',
                        },
                        {
                          label: 'Anular',
                          icon: <Ban className="h-4 w-4" />,
                          onClick: () => handleVoidExpense(expense),
                          disabled: expense.status === 'void',
                          destructive: true,
                        },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden rounded-2xl border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-900/40 md:block">
              <Table className="min-w-[980px] bg-white/90 dark:bg-slate-950/40">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripcion</TableHead>
                    <TableHead>Rubro</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                          {formatDateTime(expense.expenseDate)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="line-clamp-1 font-medium">{expense.description}</p>
                        {expense.notes ? <p className="line-clamp-1 text-xs text-muted-foreground">{expense.notes}</p> : null}
                      </TableCell>
                      <TableCell>{categoryLabelMap[expense.category]}</TableCell>
                      <TableCell>{areaLabelMap[expense.area]}</TableCell>
                      <TableCell>{paymentMethodLabelMap[expense.paymentMethod] ?? expense.paymentMethod}</TableCell>
                      <TableCell>{expense.responsibleUser}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(expense.amount)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            expense.status === 'void'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          )}
                        >
                          {expense.status === 'void' ? 'Anulado' : 'Activo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ResponsiveRowActions
                          actions={[
                            {
                              label: 'Editar',
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => openEditDialog(expense),
                              disabled: expense.status === 'void',
                            },
                            {
                              label: 'Anular',
                              icon: <Ban className="h-4 w-4" />,
                              onClick: () => handleVoidExpense(expense),
                              disabled: expense.status === 'void',
                              destructive: true,
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <AdminListPagination
              page={expensePage}
              totalPages={totalPages}
              totalItems={filteredExpenses.length}
              pageSize={expensePageSize}
              itemLabel="gastos"
              onPageChange={setExpensePage}
            />
          </>
        ) : (
          <Empty>
            <EmptyMedia>
              <WalletCards className="h-6 w-6" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No hay gastos con esos filtros</EmptyTitle>
              <EmptyDescription>
                Registra el primer gasto o cambia los filtros para revisar otro periodo.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <AdminResponsiveDialog
        open={openDialog}
        onOpenChange={(nextOpen) => {
          setOpenDialog(nextOpen);
          if (!nextOpen) {
            setEditingExpense(null);
            setFormState(getInitialExpenseForm(responsibleUser));
          }
        }}
        title={editingExpense ? 'Editar gasto' : 'Nuevo gasto'}
        description="Registra costos operativos del negocio sin afectar compras ni inventario."
        busy={isSaving}
        busyTitle={editingExpense ? 'Actualizando gasto...' : 'Registrando gasto...'}
        mobileFooterMode="fixed"
        desktopContentClassName="max-w-3xl"
        footer={
          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={isSaving}
              onClick={() => setOpenDialog(false)}
            >
              Cancelar
            </Button>
            <Button type="button" className="rounded-xl" disabled={isSaving} onClick={handleSubmit}>
              <ReceiptText className="mr-2 h-4 w-4" />
              {editingExpense ? 'Guardar cambios' : 'Registrar gasto'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input
              type="date"
              value={formState.expenseDate}
              onChange={(event) => setFormState((current) => ({ ...current, expenseDate: event.target.value }))}
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Valor</Label>
            <Input
              inputMode="decimal"
              value={formState.amount}
              onChange={(event) => setFormState((current) => ({ ...current, amount: event.target.value }))}
              placeholder="Ejemplo: 25000"
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Rubro</Label>
            <Select
              value={formState.category}
              onValueChange={(value) => setFormState((current) => ({ ...current, category: value as BusinessExpenseCategory }))}
            >
              <SelectTrigger className="w-full rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expenseCategoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Area</Label>
            <Select
              value={formState.area}
              onValueChange={(value) => setFormState((current) => ({ ...current, area: value as BusinessExpenseArea }))}
            >
              <SelectTrigger className="w-full rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expenseAreaOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descripcion</Label>
            <Input
              value={formState.description}
              onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
              placeholder="Ejemplo: Pegante, lijas, recibo de luz..."
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Metodo de pago</Label>
            <Select
              value={formState.paymentMethod}
              onValueChange={(value) => setFormState((current) => ({ ...current, paymentMethod: value }))}
            >
              <SelectTrigger className="w-full rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentMethodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Referencia</Label>
            <Input
              value={formState.paymentReference}
              onChange={(event) => setFormState((current) => ({ ...current, paymentReference: event.target.value }))}
              placeholder="Opcional"
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Responsable</Label>
            <Input
              value={formState.responsibleUser}
              onChange={(event) => setFormState((current) => ({ ...current, responsibleUser: event.target.value }))}
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Notas</Label>
            <Textarea
              value={formState.notes}
              onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Detalle interno opcional"
              className="min-h-24 rounded-2xl"
            />
          </div>
        </div>
      </AdminResponsiveDialog>
    </div>
  );
}
