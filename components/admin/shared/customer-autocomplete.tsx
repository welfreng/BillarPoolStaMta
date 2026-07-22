'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [activeField, setActiveField] = useState<'name' | 'phone' | 'document' | null>(null);
  const normalizedName = normalizeSearch(name);
  const normalizedPhone = normalizeSearch(phone);
  const normalizedDocument = normalizeSearch(documentNumber);
  const compactPhone = normalizedPhone.replace(/[^a-z0-9]/g, '');
  const compactDocument = normalizedDocument.replace(/[^a-z0-9]/g, '');

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
        const customerCompactPhone = customerPhone.replace(/[^a-z0-9]/g, '');
        const customerCompactDocument = customerDocument.replace(/[^a-z0-9]/g, '');
        return (
          (normalizedName && customerName === normalizedName) ||
          (normalizedPhone && customerPhone === normalizedPhone) ||
          (normalizedDocument && customerDocument === normalizedDocument) ||
          (compactPhone.length >= 7 && customerCompactPhone === compactPhone) ||
          (compactDocument.length >= 5 && customerCompactDocument === compactDocument)
        );
      }) ?? null,
    [compactDocument, compactPhone, customerOptions, normalizedDocument, normalizedName, normalizedPhone]
  );

  const activeQuery =
    activeField === 'phone'
      ? phone
      : activeField === 'document'
        ? documentNumber
        : activeField === 'name'
          ? name
          : [name, phone, documentNumber].filter(Boolean).join(' ');

  const visibleOptions = useMemo(() => {
    const query = normalizeSearch(activeQuery);
    const compactQuery = query.replace(/[^a-z0-9]/g, '');
    if (!query) return customerOptions.slice(0, 6);

    return customerOptions
      .filter((customer) => {
        const customerText = getCustomerSearchText(customer);
        const customerCompactPhone = normalizeSearch(customer.phone ?? '').replace(/[^a-z0-9]/g, '');
        const customerCompactDocument = normalizeSearch(customer.documentNumber ?? '').replace(/[^a-z0-9]/g, '');
        return (
          customerText.includes(query) ||
          (compactQuery.length >= 3 &&
            (customerCompactPhone.includes(compactQuery) || customerCompactDocument.includes(compactQuery)))
        );
      })
      .slice(0, 8);
  }, [activeQuery, customerOptions]);

  const selectCustomer = (customer: Customer) => {
    onChange({
      name: customer.fullName,
      phone: customer.phone ?? '',
      documentNumber: customer.documentNumber ?? '',
    });
    setOpen(false);
    setActiveField(null);
  };

  const findExactNameCustomer = (value: string) => {
    const normalizedValue = normalizeSearch(value);
    if (!normalizedValue) return null;
    return customerOptions.find((customer) => normalizeSearch(customer.fullName) === normalizedValue) ?? null;
  };

  const findExactCustomer = (value: string) => {
    const normalizedValue = normalizeSearch(value);
    const compactValue = normalizedValue.replace(/[^a-z0-9]/g, '');
    if (!normalizedValue) return null;
    return (
      customerOptions.find((customer) => {
        const customerName = normalizeSearch(customer.fullName);
        const customerPhone = normalizeSearch(customer.phone ?? '');
        const customerDocument = normalizeSearch(customer.documentNumber ?? '');
        return (
          customerName === normalizedValue ||
          customerPhone === normalizedValue ||
          customerDocument === normalizedValue ||
          (compactValue.length >= 7 && customerPhone.replace(/[^a-z0-9]/g, '') === compactValue) ||
          (compactValue.length >= 5 && customerDocument.replace(/[^a-z0-9]/g, '') === compactValue)
        );
      }) ?? null
    );
  };

  const applyExactMatch = (value: string) => {
    const exactCustomer = findExactCustomer(value);
    if (exactCustomer) selectCustomer(exactCustomer);
  };

  useEffect(() => {
    if (!matchedCustomer) return;
    if (normalizeSearch(name) !== normalizeSearch(matchedCustomer.fullName)) return;

    const matchedPhone = matchedCustomer.phone ?? '';
    const matchedDocument = matchedCustomer.documentNumber ?? '';
    const shouldFillPhone = !phone.trim() && Boolean(matchedPhone);
    const shouldFillDocument = !documentNumber.trim() && Boolean(matchedDocument);

    if (!shouldFillPhone && !shouldFillDocument) return;

    onChange({
      name: matchedCustomer.fullName,
      phone: shouldFillPhone ? matchedPhone : phone,
      documentNumber: shouldFillDocument ? matchedDocument : documentNumber,
    });
  }, [documentNumber, matchedCustomer, name, onChange, phone]);

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
              onFocus={() => {
                setActiveField('name');
                setOpen(true);
              }}
              onBlur={(event) => {
                window.setTimeout(() => setOpen(false), 140);
                applyExactMatch(event.target.value);
              }}
              onChange={(event) => {
                const nextName = event.target.value;
                const exactCustomer = findExactNameCustomer(nextName);
                if (exactCustomer) {
                  selectCustomer(exactCustomer);
                  return;
                }
                onChange({ name: nextName, phone, documentNumber });
                setActiveField('name');
                setOpen(true);
              }}
              placeholder={requiredName ? 'Busca o escribe el cliente' : 'Cliente NN o busca historial'}
              autoComplete="off"
              className="pl-9"
            />
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
              onFocus={() => {
                setActiveField('phone');
                setOpen(true);
              }}
              onBlur={(event) => {
                window.setTimeout(() => setOpen(false), 140);
                applyExactMatch(event.target.value);
              }}
              onChange={(event) => {
                const nextPhone = event.target.value;
                const exactCustomer = findExactCustomer(nextPhone);
                if (exactCustomer) {
                  selectCustomer(exactCustomer);
                  return;
                }
                onChange({ name, phone: nextPhone, documentNumber });
                setActiveField('phone');
                setOpen(true);
              }}
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
            onFocus={() => {
              setActiveField('document');
              setOpen(true);
            }}
            onBlur={(event) => {
              window.setTimeout(() => setOpen(false), 140);
              applyExactMatch(event.target.value);
            }}
            onChange={(event) => {
              const nextDocument = event.target.value;
              const exactCustomer = findExactCustomer(nextDocument);
              if (exactCustomer) {
                selectCustomer(exactCustomer);
                return;
              }
              onChange({ name, phone, documentNumber: nextDocument });
              setActiveField('document');
              setOpen(true);
            }}
          />
          {documentError ? <p className="text-xs font-medium text-destructive">{documentError}</p> : null}
        </div>
      </div>

      {open ? (
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl dark:border-slate-800">
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

      {name || phone || documentNumber ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-lg px-2 text-xs"
            onClick={() => onChange({ name: '', phone: '', documentNumber: '' })}
          >
            Limpiar cliente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
