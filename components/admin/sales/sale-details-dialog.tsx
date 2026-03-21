'use client';

import { BarChart3, Printer, ReceiptText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDateTime, formatNumber, getProductById } from '@/lib/admin/calculations';
import type { Product, Sale } from '@/lib/admin/types';

export function SaleDetailsDialog({
  open,
  onOpenChange,
  sale,
  sales,
  products,
  showAdminView = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
  sales: Sale[];
  products: Product[];
  showAdminView?: boolean;
}) {
  if (!sale) return null;

  const groupedSales = sales.filter((item) => (item.saleBatchId ?? item.id) === (sale.saleBatchId ?? sale.id));
  const baseSale = groupedSales[0] ?? sale;
  const lineItems = groupedSales.flatMap((item) => item.lineItems);
  const netRevenue = groupedSales.reduce((sum, item) => sum + item.totalSale - (item.returnedSaleAmount ?? 0), 0);
  const totalCost = groupedSales.reduce((sum, item) => sum + item.totalCost, 0);
  const netCost = groupedSales.reduce((sum, item) => sum + item.totalCost - (item.returnedCostAmount ?? 0), 0);
  const netProfit = groupedSales.reduce(
    (sum, item) => sum + item.grossProfit - ((item.returnedSaleAmount ?? 0) - (item.returnedCostAmount ?? 0)),
    0
  );
  const netUnits = groupedSales.reduce((sum, item) => sum + item.quantity - (item.returnedQuantity ?? 0), 0);
  const subtotal = lineItems.reduce((sum, item) => sum + item.totalSale, 0);
  const returnedUnits = groupedSales.reduce((sum, item) => sum + (item.returnedQuantity ?? 0), 0);
  const returnedAmount = groupedSales.reduce((sum, item) => sum + (item.returnedSaleAmount ?? 0), 0);
  const returnedCost = groupedSales.reduce((sum, item) => sum + (item.returnedCostAmount ?? 0), 0);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=950,height=760');
    if (!printWindow) return;

    const rows = lineItems
      .map((item) => {
        const product = getProductById(products, item.productId);
        return `
          <tr>
            <td>${formatNumber(item.quantity)}</td>
            <td>${product?.name ?? 'Producto'}</td>
            <td>${formatCurrency(item.unitPrice)}</td>
            <td>${formatCurrency(item.totalSale)}</td>
          </tr>
        `;
      })
      .join('');

    const giftRows =
      baseSale.giftItems.length > 0
        ? baseSale.giftItems
            .map((item) => {
              const product = getProductById(products, item.productId);
              return `<p>${formatNumber(item.quantity)} x ${product?.name ?? 'Producto obsequiado'}</p>`;
            })
            .join('')
        : '<p>Sin obsequios</p>';

    const returnsHtml =
      returnedUnits > 0
        ? `
          <div class="box">
            <h3>Devoluciones registradas</h3>
            <div class="totals">
              <div class="total-row"><span>Unidades devueltas</span><strong>${formatNumber(returnedUnits)}</strong></div>
              <div class="total-row"><span>Valor devuelto</span><strong>${formatCurrency(returnedAmount)}</strong></div>
              <div class="total-row"><span>Total neto actual</span><strong>${formatCurrency(netRevenue)}</strong></div>
            </div>
          </div>
        `
        : '';

    const receiptHtml = `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Factura de venta</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; }
            h1, h2, h3, p { margin: 0; }
            .header { display:flex; justify-content:space-between; gap:24px; margin-bottom:24px; }
            .brand h1 { font-size: 28px; margin-bottom: 6px; }
            .muted { color:#475569; font-size:14px; }
            .box { border:1px solid #cbd5e1; border-radius:16px; padding:16px; margin-bottom:16px; }
            table { width:100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border-bottom:1px solid #e2e8f0; padding:10px 8px; text-align:left; font-size:14px; }
            th { background:#f8fafc; }
            .totals { margin-top:16px; display:grid; gap:8px; justify-content:end; }
            .total-row { display:flex; justify-content:space-between; gap:24px; min-width:280px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">
              <h1>Billar Pool Santa Marta</h1>
              <p class="muted">Factura / comprobante de venta</p>
              <p class="muted">Fecha: ${formatDateTime(baseSale.soldAt)}</p>
            </div>
            <div class="box" style="min-width:280px;">
              <p class="muted">Cliente</p>
              <p style="font-weight:700; margin-top:6px;">${baseSale.customerName}</p>
              <p class="muted" style="margin-top:8px;">Responsable: ${baseSale.responsibleUser}</p>
            </div>
          </div>

          <div class="box">
            <h3>Detalle de productos</h3>
            <table>
              <thead>
                <tr>
                  <th>Cantidad</th>
                  <th>Producto</th>
                  <th>Valor unitario</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            <div class="totals">
              <div class="total-row"><span>Subtotal</span><strong>${formatCurrency(subtotal)}</strong></div>
              <div class="total-row"><span>Total factura</span><strong>${formatCurrency(netRevenue)}</strong></div>
            </div>
          </div>

          ${returnsHtml}

          <div class="box">
            <h3>Obsequios</h3>
            <div style="margin-top:10px;" class="muted">${giftRows}</div>
          </div>

          <div class="box">
            <h3>Notas</h3>
            <p class="muted" style="margin-top:10px;">${baseSale.notes?.trim() ? baseSale.notes : 'Sin observaciones registradas.'}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto px-4 sm:w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Detalle de la venta</DialogTitle>
          <DialogDescription>
            Revisa la utilidad en vista administrativa o cambia a la factura del cliente para imprimir.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={showAdminView ? 'admin' : 'invoice'} className="space-y-4">
          {showAdminView ? (
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <TabsTrigger value="admin" className="rounded-xl">
                <BarChart3 className="mr-2 h-4 w-4" />
                Administracion
              </TabsTrigger>
              <TabsTrigger value="invoice" className="rounded-xl">
                <ReceiptText className="mr-2 h-4 w-4" />
                Factura cliente
              </TabsTrigger>
            </TabsList>
          ) : null}

          {showAdminView ? (
            <TabsContent value="admin" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Cliente</p>
                <p className="mt-1 font-semibold text-slate-950">{baseSale.customerName}</p>
                <p className="mt-1 text-sm text-slate-500">{formatDateTime(baseSale.soldAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Responsable</p>
                <p className="mt-1 font-semibold text-slate-950">{baseSale.responsibleUser}</p>
                <p className="mt-1 text-sm text-slate-500">Lineas vendidas: {formatNumber(lineItems.length)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
                <p className="text-xs text-slate-500">Cantidad neta</p>
                <p className="mt-1 font-semibold text-slate-950">{formatNumber(netUnits)} uds</p>
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
                <p className="text-xs text-slate-500">Ingreso neto</p>
                <p className="mt-1 font-semibold text-slate-950">{formatCurrency(netRevenue)}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4">
                <p className="text-xs text-slate-500">Costo neto</p>
                <p className="mt-1 font-semibold text-amber-800">{formatCurrency(netCost)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-xs text-slate-500">Utilidad neta</p>
                <p className="mt-1 font-semibold text-emerald-800">{formatCurrency(netProfit)}</p>
              </div>
            </div>

            {(returnedUnits > 0 || returnedAmount > 0) && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                  <p className="text-xs text-slate-500">Unidades devueltas</p>
                  <p className="mt-1 font-semibold text-rose-700">{formatNumber(returnedUnits)} uds</p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                  <p className="text-xs text-slate-500">Valor devuelto</p>
                  <p className="mt-1 font-semibold text-rose-700">{formatCurrency(returnedAmount)}</p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                  <p className="text-xs text-slate-500">Costo devuelto</p>
                  <p className="mt-1 font-semibold text-rose-700">{formatCurrency(returnedCost)}</p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-950">Detalle interno de productos</h3>
              <div className="mt-4 space-y-3">
                {lineItems.map((item, index) => {
                  const product = getProductById(products, item.productId);
                  return (
                    <div
                      key={`${item.productId}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-900">
                            {formatNumber(item.quantity)} x {product?.name ?? 'Producto'}
                          </p>
                          <p className="text-sm text-slate-500">Precio unitario: {formatCurrency(item.unitPrice)}</p>
                          <p className="text-sm text-slate-500">Costo unitario: {formatCurrency(item.realUnitCost)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Venta</p>
                          <p className="font-medium text-slate-900">{formatCurrency(item.totalSale)}</p>
                          <p className="mt-2 text-xs text-slate-500">Costo</p>
                          <p className="font-medium text-amber-800">{formatCurrency(item.totalCost)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-950">Obsequios de la venta</h3>
                {baseSale.giftItems.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {baseSale.giftItems.map((giftItem, index) => {
                      const giftProduct = getProductById(products, giftItem.productId);
                      return (
                        <div
                          key={`${giftItem.productId}-${index}`}
                          className="flex items-center justify-between rounded-2xl bg-violet-50 p-4"
                        >
                          <div>
                            <p className="font-medium text-slate-900">
                              {formatNumber(giftItem.quantity)} x {giftProduct?.name ?? 'Producto obsequiado'}
                            </p>
                            <p className="text-sm text-slate-500">Registrado como obsequio</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Costo obsequio</p>
                            <p className="font-medium text-violet-700">{formatCurrency(giftItem.totalCost)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Esta venta no tuvo productos obsequiados.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-950">Resumen interno</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-slate-500">Subtotal productos</span>
                    <span className="font-medium text-slate-900">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-slate-500">Costo total original</span>
                    <span className="font-medium text-slate-900">{formatCurrency(totalCost)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-slate-500">Ingreso neto actual</span>
                    <span className="font-medium text-slate-900">{formatCurrency(netRevenue)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2">
                    <span className="text-emerald-700">Utilidad neta</span>
                    <span className="font-semibold text-emerald-800">{formatCurrency(netProfit)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-950">Notas</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {baseSale.notes?.trim() ? baseSale.notes : 'Sin observaciones registradas.'}
              </p>
            </div>
            </TabsContent>
          ) : null}

          <TabsContent value="invoice" className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir factura
              </Button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Factura de venta</p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">Billar Pool Santa Marta</h3>
                  <p className="mt-2 text-sm text-slate-500">Fecha: {formatDateTime(baseSale.soldAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="text-slate-500">Cliente</p>
                  <p className="mt-1 font-semibold text-slate-950">{baseSale.customerName}</p>
                  <p className="mt-2 text-slate-500">Atendido por: {baseSale.responsibleUser}</p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[0.8fr_2fr_1fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <p>Cantidad</p>
                  <p>Producto</p>
                  <p>Valor unitario</p>
                  <p>Total</p>
                </div>
                <div className="divide-y divide-slate-200">
                  {lineItems.map((item, index) => {
                    const product = getProductById(products, item.productId);
                    return (
                      <div
                        key={`${item.productId}-${index}`}
                        className="grid grid-cols-[0.8fr_2fr_1fr_1fr] gap-3 px-4 py-4 text-sm text-slate-700"
                      >
                        <p className="font-medium text-slate-900">{formatNumber(item.quantity)}</p>
                        <p>{product?.name ?? 'Producto'}</p>
                        <p>{formatCurrency(item.unitPrice)}</p>
                        <p className="font-medium text-slate-900">{formatCurrency(item.totalSale)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-semibold text-slate-950">Obsequios</h4>
                  {baseSale.giftItems.length > 0 ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {baseSale.giftItems.map((giftItem, index) => {
                        const giftProduct = getProductById(products, giftItem.productId);
                        return (
                          <p key={`${giftItem.productId}-${index}`}>
                            {formatNumber(giftItem.quantity)} x {giftProduct?.name ?? 'Producto obsequiado'}
                          </p>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Sin obsequios en esta venta.</p>
                  )}

                  {baseSale.notes?.trim() ? (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <h4 className="text-sm font-semibold text-slate-950">Notas</h4>
                      <p className="mt-2 text-sm text-slate-600">{baseSale.notes}</p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Subtotal productos</span>
                      <span className="font-medium text-slate-900">{formatCurrency(subtotal)}</span>
                    </div>
                    {returnedAmount > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Devoluciones</span>
                        <span className="font-medium text-rose-700">- {formatCurrency(returnedAmount)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base">
                      <span className="font-semibold text-slate-950">Total factura</span>
                      <span className="font-semibold text-slate-950">{formatCurrency(netRevenue)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
