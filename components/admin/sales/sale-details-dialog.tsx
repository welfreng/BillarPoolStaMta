'use client';

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { BarChart3, Download, Printer, ReceiptText, Share2 } from 'lucide-react';
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
import { SITE_LOGO } from '@/lib/branding';
import type { Product, Sale } from '@/lib/admin/types';

type InvoiceLine = {
  quantity: number;
  name: string;
  unitPrice: number;
  total: number;
};

type InvoiceGift = {
  quantity: number;
  name: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fileNameFromSale(sale: Sale) {
  const date = sale.soldAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const customer = (sale.customerName || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `factura-${date}-${customer || 'venta'}.pdf`;
}

async function loadImageAsDataUrl(src: string) {
  const response = await fetch(src);
  const blob = await response.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('No se pudo convertir el logo.'));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el logo.'));
    reader.readAsDataURL(blob);
  });
}

async function buildInvoicePdf({
  sale,
  logoUrl,
  lineItems,
  giftItems,
  subtotal,
  netRevenue,
  returnedUnits,
  returnedAmount,
  notes,
  responsibleUser,
}: {
  sale: Sale;
  logoUrl: string;
  lineItems: InvoiceLine[];
  giftItems: InvoiceGift[];
  subtotal: number;
  netRevenue: number;
  returnedUnits: number;
  returnedAmount: number;
  notes: string;
  responsibleUser: string;
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  let cursorY = 18;

  const logoDataUrl = await loadImageAsDataUrl(logoUrl);
  doc.setFillColor(10, 37, 64);
  doc.roundedRect(marginX, cursorY - 2, pageWidth - marginX * 2, 30, 6, 6, 'F');
  doc.addImage(logoDataUrl, 'PNG', marginX + 4, cursorY, 22, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Billar Pool Santa Marta', 44, cursorY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Factura / comprobante de venta', 44, cursorY + 15);
  doc.text(`Fecha: ${formatDateTime(sale.soldAt)}`, 44, cursorY + 21.5);

  cursorY += 38;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, 24, 4, 4, 'FD');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.text('Cliente', marginX + 4, cursorY + 7);
  doc.text('Atendido por', marginX + 110, cursorY + 7);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(sale.customerName || 'Cliente mostrador', marginX + 4, cursorY + 15);
  doc.text(responsibleUser, marginX + 110, cursorY + 15);

  cursorY += 34;

  doc.setFillColor(226, 232, 240);
  doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text('Cant.', marginX + 4, cursorY + 6.5);
  doc.text('Producto', marginX + 22, cursorY + 6.5);
  doc.text('Vr. unitario', marginX + 120, cursorY + 6.5);
  doc.text('Total', marginX + 165, cursorY + 6.5);

  cursorY += 14;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  lineItems.forEach((item) => {
    if (cursorY > pageHeight - 42) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, cursorY + 6, pageWidth - marginX, cursorY + 6);
    doc.text(String(item.quantity), marginX + 4, cursorY);
    doc.text(item.name.slice(0, 55), marginX + 22, cursorY);
    doc.text(formatCurrency(item.unitPrice), marginX + 120, cursorY, { align: 'left' });
    doc.text(formatCurrency(item.total), pageWidth - marginX - 2, cursorY, { align: 'right' });
    cursorY += 10;
  });

  cursorY += 4;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(116, cursorY, pageWidth - 132, returnedAmount > 0 ? 25 : 17, 4, 4, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal', 122, cursorY + 7);
  doc.text(formatCurrency(subtotal), pageWidth - marginX - 2, cursorY + 7, { align: 'right' });
  if (returnedAmount > 0) {
    doc.text('Devoluciones', 122, cursorY + 14);
    doc.text(`- ${formatCurrency(returnedAmount)}`, pageWidth - marginX - 2, cursorY + 14, { align: 'right' });
  }
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Total factura', 122, cursorY + (returnedAmount > 0 ? 21 : 14));
  doc.text(formatCurrency(netRevenue), pageWidth - marginX - 2, cursorY + (returnedAmount > 0 ? 21 : 14), {
    align: 'right',
  });

  cursorY += returnedAmount > 0 ? 33 : 25;

  if (giftItems.length > 0 || returnedUnits > 0 || notes.trim()) {
    const extrasHeight =
      16 +
      (giftItems.length > 0 ? giftItems.length * 6 + 8 : 8) +
      (returnedUnits > 0 ? 10 : 0) +
      (notes.trim() ? 12 : 0);

    if (cursorY + extrasHeight > pageHeight - 20) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, extrasHeight, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Complementos de la factura', marginX + 4, cursorY + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);

    let extrasY = cursorY + 16;

    if (giftItems.length > 0) {
      doc.text('Obsequios:', marginX + 4, extrasY);
      extrasY += 6;
      giftItems.forEach((item) => {
        doc.text(`- ${formatNumber(item.quantity)} x ${item.name}`, marginX + 8, extrasY);
        extrasY += 6;
      });
    } else {
      doc.text('Obsequios: Sin obsequios registrados.', marginX + 4, extrasY);
      extrasY += 8;
    }

    if (returnedUnits > 0) {
      doc.text(
        `Devoluciones registradas: ${formatNumber(returnedUnits)} uds por ${formatCurrency(returnedAmount)}`,
        marginX + 4,
        extrasY
      );
      extrasY += 10;
    }

    if (notes.trim()) {
      doc.text(`Notas: ${notes}`, marginX + 4, extrasY, {
        maxWidth: pageWidth - marginX * 2 - 8,
      });
    }
  }

  return doc;
}

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
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  if (!sale) return null;

  const groupedSales = sales.filter((item) => (item.saleBatchId ?? item.id) === (sale.saleBatchId ?? sale.id));
  const baseSale = groupedSales[0] ?? sale;
  const lineItems = groupedSales.flatMap((item) => item.lineItems);
  const giftItems = groupedSales.flatMap((item) => item.giftItems);
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
  const invoiceLogoUrl = typeof window !== 'undefined' ? `${window.location.origin}${SITE_LOGO}` : SITE_LOGO;
  const invoiceLines: InvoiceLine[] = lineItems.map((item) => {
    const product = getProductById(products, item.productId);
    return {
      quantity: item.quantity,
      name: product?.name ?? 'Producto',
      unitPrice: item.unitPrice,
      total: item.totalSale,
    };
  });
  const invoiceGifts: InvoiceGift[] = giftItems.map((item) => {
    const product = getProductById(products, item.productId);
    return {
      quantity: item.quantity,
      name: product?.name ?? 'Producto obsequiado',
    };
  });

  const getReceiptHtml = () => {
    const rows = invoiceLines
      .map(
        (item) => `
          <tr>
            <td>${formatNumber(item.quantity)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${formatCurrency(item.unitPrice)}</td>
            <td>${formatCurrency(item.total)}</td>
          </tr>
        `
      )
      .join('');

    const giftRows =
      invoiceGifts.length > 0
        ? invoiceGifts
            .map((item) => `<p>${formatNumber(item.quantity)} x ${escapeHtml(item.name)}</p>`)
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

    return `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Factura de venta</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; background: #f8fafc; }
            h1, h2, h3, p { margin: 0; }
            .sheet { background:#fff; border:1px solid #cbd5e1; border-radius:24px; padding:24px; }
            .header { display:flex; justify-content:space-between; gap:24px; margin-bottom:24px; align-items:flex-start; }
            .brand-card { display:flex; align-items:center; gap:16px; background:linear-gradient(135deg, #082f49, #0f766e); color:#fff; border-radius:20px; padding:16px 18px; min-width:430px; }
            .brand-copy { display:flex; flex-direction:column; justify-content:center; }
            .brand-logo { width:86px; height:86px; display:flex; align-items:center; justify-content:center; border-radius:18px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.16); padding:6px; flex-shrink:0; }
            .brand-logo img { width:100%; height:100%; object-fit:contain; }
            .brand-card h1 { font-size: 28px; margin-bottom: 6px; }
            .muted { color:#475569; font-size:14px; }
            .brand-card .muted { color:#dbeafe; }
            .box { border:1px solid #cbd5e1; border-radius:16px; padding:16px; margin-bottom:16px; }
            table { width:100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border-bottom:1px solid #e2e8f0; padding:10px 8px; text-align:left; font-size:14px; }
            th { background:#f8fafc; }
            .totals { margin-top:16px; display:grid; gap:8px; justify-content:end; }
            .total-row { display:flex; justify-content:space-between; gap:24px; min-width:280px; }
            .hero { background:linear-gradient(135deg, rgba(8,47,73,.08), rgba(15,118,110,.08)); border:1px solid #bae6fd; border-radius:18px; padding:16px; margin-bottom:16px; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="header">
              <div class="brand-card">
                <div class="brand-logo">
                  <img src="${invoiceLogoUrl}" alt="Logo Billar Pool Santa Marta" />
                </div>
                <div class="brand-copy">
                  <h1>Billar Pool Santa Marta</h1>
                  <p class="muted">Factura / comprobante de venta</p>
                  <p class="muted">Fecha: ${formatDateTime(baseSale.soldAt)}</p>
                </div>
              </div>
              <div class="box" style="min-width:280px;">
                <p class="muted">Cliente</p>
                <p style="font-weight:700; margin-top:6px;">${escapeHtml(baseSale.customerName)}</p>
                <p class="muted" style="margin-top:8px;">Responsable: ${escapeHtml(baseSale.responsibleUser)}</p>
              </div>
            </div>

            <div class="hero">
              <p style="font-size:13px; color:#155e75;">Gracias por tu compra. Este comprobante resume la venta registrada en el sistema.</p>
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
                ${
                  returnedAmount > 0
                    ? `<div class="total-row"><span>Devoluciones</span><strong>- ${formatCurrency(returnedAmount)}</strong></div>`
                    : ''
                }
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
              <p class="muted" style="margin-top:10px;">${escapeHtml(
                baseSale.notes?.trim() ? baseSale.notes : 'Sin observaciones registradas.'
              )}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const exportPdf = async () =>
    buildInvoicePdf({
      sale: baseSale,
      logoUrl: invoiceLogoUrl,
      lineItems: invoiceLines,
      giftItems: invoiceGifts,
      subtotal,
      netRevenue,
      returnedUnits,
      returnedAmount,
      notes: baseSale.notes?.trim() ? baseSale.notes : '',
      responsibleUser: baseSale.responsibleUser,
    });

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=950,height=760');
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(getReceiptHtml());
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setIsExportingPdf(true);
      const doc = await exportPdf();
      doc.save(fileNameFromSale(baseSale));
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSharePdf = async () => {
    try {
      setIsExportingPdf(true);
      const doc = await exportPdf();
      const pdfBlob = doc.output('blob');
      const pdfFile = new File([pdfBlob], fileNameFromSale(baseSale), { type: 'application/pdf' });
      const shareMessage = `Factura de ${baseSale.customerName} - ${formatCurrency(netRevenue)}`;

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({
          files: [pdfFile],
        })
      ) {
        await navigator.share({
          title: 'Factura de venta',
          text: shareMessage,
          files: [pdfFile],
        });
        return;
      }

      doc.save(pdfFile.name);
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareMessage}. Adjunto el PDF descargado.`)}`, '_blank');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[96vw] overflow-y-auto px-4 sm:w-[calc(100vw-2rem)] lg:max-w-[900px] lg:px-5 xl:max-w-[980px] xl:px-6">
        <DialogHeader>
          <DialogTitle>Detalle de la venta</DialogTitle>
          <DialogDescription>
            Revisa la utilidad en vista administrativa o cambia a la factura del cliente para imprimir, descargar o compartir el PDF.
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
                {giftItems.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {giftItems.map((giftItem, index) => {
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
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir factura
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => void handleDownloadPdf()}
                disabled={isExportingPdf}
              >
                <Download className="mr-2 h-4 w-4" />
                {isExportingPdf ? 'Generando PDF...' : 'Descargar PDF'}
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => void handleSharePdf()} disabled={isExportingPdf}>
                <Share2 className="mr-2 h-4 w-4" />
                {isExportingPdf ? 'Preparando...' : 'Compartir PDF por WhatsApp'}
              </Button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="rounded-3xl bg-gradient-to-br from-[#082f49] to-[#0f766e] p-3 text-white shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-[70px] w-[70px] items-center justify-center rounded-2xl border border-white/20 bg-white/8 p-2">
                      <img src={invoiceLogoUrl} alt="Logo Billar Pool Santa Marta" className="h-full w-full object-contain" />
                    </div>
                    <div className="flex min-w-0 flex-col justify-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">Factura de venta</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">Billar Pool Santa Marta</h3>
                      <p className="mt-1 text-xs text-cyan-100 sm:text-sm">Fecha: {formatDateTime(baseSale.soldAt)}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="text-slate-500">Cliente</p>
                  <p className="mt-1 font-semibold text-slate-950">{baseSale.customerName}</p>
                  <p className="mt-2 text-slate-500">Atendido por: {baseSale.responsibleUser}</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-teal-50 p-4">
                <p className="text-sm text-cyan-900">
                  Gracias por tu compra. Puedes imprimir esta factura o compartirla como PDF por WhatsApp.
                </p>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <div className="hidden grid-cols-[0.8fr_2.2fr_1fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
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
                        className="grid gap-3 px-4 py-4 text-sm text-slate-700 md:grid-cols-[0.8fr_2.2fr_1fr_1fr] md:items-center"
                      >
                        <div className="grid grid-cols-2 gap-3 md:contents">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">Cantidad</p>
                          <p className="font-medium text-slate-900">{formatNumber(item.quantity)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:contents">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">Producto</p>
                          <p>{product?.name ?? 'Producto'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:contents">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">Valor unitario</p>
                          <p>{formatCurrency(item.unitPrice)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:contents">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">Total</p>
                          <p className="font-medium text-slate-900">{formatCurrency(item.totalSale)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-semibold text-slate-950">Obsequios</h4>
                  {giftItems.length > 0 ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {giftItems.map((giftItem, index) => {
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
