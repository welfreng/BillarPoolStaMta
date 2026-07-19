'use client';

import { useMemo, useState } from 'react';
import { BadgeCheck, Phone, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Customer } from '@/lib/admin/types';
import { cn } from '@/lib/utils';

interface CustomerAutocompleteProps {
  customers?: Customer[];
  name: string;
  phone: string;
  documentNumber: string;
  onChange: (values: { name: string; phone: string; documentNumber: string }) => void;
  nameError?: string;
  phoneError?: string;
  documentError?: string;
  requiredName?: boolean;
  className?: string;
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getCustomerSearchText(customer: Customer) {
  return normalizeSearch(
    [
      customer.fullName,
      customer.phone ?? '',
      customer.documentNumber ?? '',
      customer.saleCount ? `${customer.saleCount} compras` : '',
      customer.serviceCount ? `${customer.serviceCount} servicios` : '',
    ].join(' ')
  );
}

function getCustomerRecentTime(customer: Customer) {
  const recentTimes = [customer.lastSaleAt, customer.lastServiceAt].map((value) => {
    const recentTime = value ? new Date(value).getTime() : 0;
    return Number.isFinite(recentTime) ? recentTime : 0;
  });
  return Math.max(...recentTimes);
}

export function CustomerAutocomplete({
  customers,
  name,
  phone,
  documentNumber,
  onChange,
  nameError,
  phoneError,
  documentError,
  requiredName = false,
  className,
}: CustomerAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const normalizedName = normalizeSearch(name);
  const normalizedPhone = normalizeSearch(phone);
  const normalizedDocument = normalizeSearch(documentNumber);

  const customerOptions = useMemo(
    () =>
      [...(customers ?? [])]
        .filter((customer) => customer.fullName.trim())
        .sort((left, right) => {
          const leftRecent = getCustomerRecentTime(left);
          const rightRecent = getCustomerRecentTime(right);
          if (leftRecent !== rightRecent) return rightRecent - leftRecent;
          return (
            (right.saleCount + Number(right.serviceCount ?? 0)) -
              (left.saleCount + Number(left.serviceCount ?? 0)) ||
            left.fullName.localeCompare(right.fullName, 'es')
          );
        }),
    [customers]
  );

  const matchedCustomer = useMemo(
    () =>
      customerOptions.find((customer) => {
        const customerName = normalizeSearch(customer.fullName);
        const customerPhone = normalizeSearch(customer.phone ?? '');
        const customerDocument = normalizeSearch(customer.documentNumber ?? '');
        return (
          (normalizedName && customerName === normalizedName) ||
          (normalizedPhone && customerPhone === normalizedPhone) ||
          (normalizedDocument && customerDocument === normalizedDocument)
        );
      }) ?? null,
    [customerOptions, normalizedDocument, normalizedName, normalizedPhone]
  );

  const visibleOptions = useMemo(() => {
    const query = normalizeSearch([name, phone, documentNumber].filter(Boolean).join(' '));
    if (!query) return customerOptions.slice(0, 6);

    return customerOptions
      .filter((customer) => getCustomerSearchText(customer).includes(query))
      .slice(0, 8);
  }, [customerOptions, documentNumber, name, phone]);

  const selectCustomer = (customer: Customer) => {
    onChange({
      name: customer.fullName,
      phone: customer.phone ?? '',
      documentNumber: customer.documentNumber ?? '',
    });
    setOpen(false);
  };

  const applyExactMatch = (value: string) => {
    const normalizedValue = normalizeSearch(value);
    if (!normalizedValue) return;
    const exactCustomer = customerOptions.find((customer) =>
      [customer.fullName, customer.phone ?? '', customer.documentNumber ?? '']
        .map(normalizeSearch)
        .some((item) => item === normalizedValue)
    );
    if (exactCustomer) selectCustomer(exactCustomer);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.72fr)]">
        <div className="relative min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Cliente{requiredName ? '' : ' (opcional)'}</Label>
            {matchedCustomer ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900">
                <BadgeCheck className="h-3 w-3" />
                Cargado
              </span>
            ) : null}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={name}
              onFocus={() => setOpen(true)}
              onBlur={(event) => {
                window.setTimeout(() => setOpen(false), 140);
                applyExactMatch(event.target.value);
              }}
              onChange={(event) => {
                onChange({ name: event.target.value, phone, documentNumber });
                setOpen(true);
              }}
              placeholder={requiredName ? 'Busca o escribe el cliente' : 'Cliente NN o busca historial'}
              autoComplete="off"
              className="pl-9"
            />

            {open ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-72 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl dark:border-slate-800">
                {visibleOptions.length > 0 ? (
                  visibleOptions.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCustomer(customer)}
                    >
                      <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{customer.fullName}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[customer.phone, customer.documentNumber].filter(Boolean).join(' - ') || 'Sin telefono ni documento'}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {[
                            customer.saleCount > 0 ? `${customer.saleCount} compras` : '',
                            Number(customer.serviceCount ?? 0) > 0 ? `${customer.serviceCount} servicios` : '',
                          ].filter(Boolean).join(' - ') || 'Cliente guardado'}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">
                    Cliente nuevo. Al guardar, queda registrado para proximas ventas o servicios.
                  </div>
                )}
              </div>
            ) : null}
          </div>
          {nameError ? <p className="text-xs font-medium text-destructive">{nameError}</p> : null}
        </div>

        <div className="min-w-0 space-y-2">
          <Label>Telefono</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={phone}
              inputMode="numeric"
              placeholder="3002565865"
              onBlur={(event) => applyExactMatch(event.target.value)}
              onChange={(event) => onChange({ name, phone: event.target.value, documentNumber })}
              className="pl-9"
            />
          </div>
          {phoneError ? <p className="text-xs font-medium text-destructive">{phoneError}</p> : null}
        </div>

        <div className="min-w-0 space-y-2">
          <Label>Cedula o NIT</Label>
          <Input
            value={documentNumber}
            inputMode="numeric"
            placeholder="Opcional"
            onBlur={(event) => applyExactMatch(event.target.value)}
            onChange={(event) => onChange({ name, phone, documentNumber: event.target.value })}
          />
          {documentError ? <p className="text-xs font-medium text-destructive">{documentError}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Busca por nombre, telefono o documento. Al seleccionar, el sistema rellena los datos.
        </span>
        {name || phone || documentNumber ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-lg px-2 text-xs"
            onClick={() => onChange({ name: '', phone: '', documentNumber: '' })}
          >
            Limpiar cliente
          </Button>
        ) : null}
      </div>
    </div>
  );
}
