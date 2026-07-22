import { jsPDF } from 'jspdf';
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  getProductById,
} from '@/lib/admin/calculations';
import { serviceTypeLabels } from '@/lib/admin/catalogs';
import {
  getSaleLineDisplayName,
  getSaleLineResolvedVariant,
  getSaleLineVariantLabel,
  getSaleLineVariantSku,
} from '@/lib/admin/sale-line-display';
import type { Product, Sale, ServiceOrder } from '@/lib/admin/types';

export interface ReportDetailRow {
  transactionKey: string;
  saleDate: string;
  saleId: string;
  customer: string;
  customerPhone: string;
  seller: string;
  paymentMethod: string;
  saleStatus: string;
  saleTotal: number;
  itemType: 'product' | 'service';
  itemName: string;
  category: string;
  subcategory: string;
  variant: string;
  sku: string;
  reference: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  utility: number;
  observations: string;
}

export interface ReportSummaryRow {
  transactionKey: string;
  saleDate: string;
  saleId: string;
  customer: string;
  customerPhone: string;
  seller: string;
  paymentMethod: string;
  saleStatus: string;
  itemCount: number;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  observations: string;
}

export interface SalesReportDataset {
  detailRows: ReportDetailRow[];
  summaryRows: ReportSummaryRow[];
}

function normalizeSheetValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inferSaleStatus(items: Sale[]) {
  const totalQuantity = items.reduce((sum, sale) => sum + sale.quantity, 0);
  const returnedQuantity = items.reduce((sum, sale) => sum + (sale.returnedQuantity ?? 0), 0);

  if (totalQuantity > 0 && returnedQuantity >= totalQuantity) return 'Devuelta total';
  if (returnedQuantity > 0) return 'Devuelta parcial';
  return 'Completada';
}

function paymentMethodLabel(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'No registrado';
  if (normalized === 'nequi') return 'Nequi';
  if (normalized === 'bancolombia') return 'Bancolombia';
  if (normalized === 'daviplata') return 'Daviplata';
  if (normalized === 'transferencia') return 'Transferencia';
  if (normalized === 'mixto') return 'Mixto';
  if (normalized === 'efectivo') return 'Efectivo';
  return value ?? 'No registrado';
}

function getSaleGroupTotals(groupSales: Sale[]) {
  const grossRevenue = groupSales.reduce((sum, sale) => sum + sale.totalSale, 0);
  const returnedRevenue = groupSales.reduce((sum, sale) => sum + (sale.returnedSaleAmount ?? 0), 0);
  const netRevenue = grossRevenue - returnedRevenue;
  const netCost = groupSales.reduce(
    (sum, sale) => sum + sale.totalCost - (sale.returnedCostAmount ?? 0),
    0
  );
  const netProfit = groupSales.reduce(
    (sum, sale) => sum + sale.grossProfit - ((sale.returnedSaleAmount ?? 0) - (sale.returnedCostAmount ?? 0)),
    0
  );
  const totalQuantity = groupSales.reduce((sum, sale) => sum + sale.quantity, 0);
  return { netRevenue, netCost, netProfit, totalQuantity };
}

export function buildSalesReportDataset(input: {
  products: Product[];
  sales: Sale[];
  services: ServiceOrder[];
  selectedMonth: string;
}): SalesReportDataset {
  const salesInMonth = input.sales.filter((sale) => sale.soldAt.slice(0, 7) === input.selectedMonth);
  const servicesInMonth = input.services.filter(
    (service) => (service.status ?? 'delivered') === 'delivered' && service.performedAt.slice(0, 7) === input.selectedMonth
  );

  const saleGroups = new Map<string, Sale[]>();
  salesInMonth.forEach((sale) => {
    const key = sale.saleBatchId ?? sale.id;
    const existing = saleGroups.get(key) ?? [];
    existing.push(sale);
    saleGroups.set(key, existing);
  });

  const serviceGroups = new Map<string, ServiceOrder[]>();
  servicesInMonth.forEach((service) => {
    const key = service.saleBatchId ?? service.saleId ?? `service-${service.id}`;
    const existing = serviceGroups.get(key) ?? [];
    existing.push(service);
    serviceGroups.set(key, existing);
  });

  const detailRows: ReportDetailRow[] = [];
  const summaryRows: ReportSummaryRow[] = [];
  const transactionKeys = Array.from(new Set([...saleGroups.keys(), ...serviceGroups.keys()]));

  transactionKeys.forEach((transactionKey) => {
    const groupedSales = (saleGroups.get(transactionKey) ?? []).sort((left, right) =>
      new Date(left.soldAt).getTime() - new Date(right.soldAt).getTime()
    );
    const groupedServices = (serviceGroups.get(transactionKey) ?? []).sort((left, right) =>
      new Date(left.performedAt).getTime() - new Date(right.performedAt).getTime()
    );

    const baseSale = groupedSales[0];
    const baseService = groupedServices[0];
    const baseDate = baseSale?.soldAt ?? baseService?.performedAt ?? new Date().toISOString();
    const saleId = baseSale?.saleBatchId ?? baseSale?.id ?? baseService?.saleBatchId ?? baseService?.id ?? transactionKey;
    const customer = baseSale?.customerName || baseService?.customerName || 'Cliente no registrado';
    const customerPhone = baseSale?.customerPhone ?? '';
    const seller = baseSale?.responsibleUser || baseService?.responsibleUser || 'Usuario no registrado';
    const saleStatus = groupedSales.length > 0 ? inferSaleStatus(groupedSales) : 'Completada';
    const paymentMethod = paymentMethodLabel(baseSale?.paymentMethod ?? baseService?.paymentMethod);
    const saleTotals = getSaleGroupTotals(groupedSales);
    const serviceRevenue = groupedServices.reduce((sum, service) => sum + service.totalRevenue, 0);
    const serviceCost = groupedServices.reduce((sum, service) => sum + Number(service.totalCost ?? service.totalMaterialCost ?? 0), 0);
    const serviceProfit = groupedServices.reduce((sum, service) => sum + service.grossProfit, 0);

    groupedSales.forEach((sale) => {
      sale.lineItems.forEach((item) => {
        const product = getProductById(input.products, item.productId);
        const variant = getSaleLineResolvedVariant(product, item);
        const observations = [
          sale.notes?.trim() || '',
          (sale.returnedQuantity ?? 0) > 0
            ? `Venta con devolucion registrada: ${formatNumber(sale.returnedQuantity ?? 0)} unidad(es).`
            : '',
        ]
          .filter(Boolean)
          .join(' | ');

        detailRows.push({
          transactionKey,
          saleDate: sale.soldAt,
          saleId,
          customer,
          customerPhone,
          seller,
          paymentMethod,
          saleStatus,
          saleTotal: saleTotals.netRevenue + serviceRevenue,
          itemType: 'product',
          itemName: getSaleLineDisplayName(product, item),
          category: product?.category ?? '',
          subcategory: product?.subcategory ?? '',
          variant: getSaleLineVariantLabel(product, item),
          sku: getSaleLineVariantSku(variant),
          reference: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.realUnitCost,
          subtotal: item.totalSale,
          utility: item.totalSale - item.totalCost,
          observations,
        });
      });
    });

    groupedServices.forEach((service) => {
      detailRows.push({
        transactionKey,
        saleDate: service.performedAt,
        saleId,
        customer,
        customerPhone,
        seller,
        paymentMethod,
        saleStatus,
        saleTotal: saleTotals.netRevenue + serviceRevenue,
        itemType: 'service',
        itemName: service.serviceLabel?.trim() || serviceTypeLabels[service.serviceType],
        category: 'servicios',
        subcategory: service.serviceCategory ?? '',
        variant: '',
        sku: '',
        reference: service.cueReference || service.id,
        quantity: 1,
        unitPrice: service.totalRevenue,
        unitCost: Number(service.totalCost ?? service.totalMaterialCost ?? 0),
        subtotal: service.totalRevenue,
        utility: service.grossProfit,
        observations: service.notes?.trim() || '',
      });
    });

    summaryRows.push({
      transactionKey,
      saleDate: baseDate,
      saleId,
      customer,
      customerPhone,
      seller,
      paymentMethod,
      saleStatus,
      itemCount: detailRows.filter((row) => row.transactionKey === transactionKey).length,
      totalQuantity:
        groupedSales.reduce((sum, sale) => sum + sale.quantity - (sale.returnedQuantity ?? 0), 0) +
        groupedServices.length,
      totalRevenue: saleTotals.netRevenue + serviceRevenue,
      totalCost: saleTotals.netCost + serviceCost,
      totalProfit: saleTotals.netProfit + serviceProfit,
      observations: [baseSale?.notes?.trim() || '', ...groupedServices.map((service) => service.notes?.trim() || '')]
        .filter(Boolean)
        .join(' | '),
    });
  });

  detailRows.sort((left, right) => new Date(right.saleDate).getTime() - new Date(left.saleDate).getTime());
  summaryRows.sort((left, right) => new Date(right.saleDate).getTime() - new Date(left.saleDate).getTime());

  return { detailRows, summaryRows };
}

function createWorksheetXml(name: string, headers: string[], rows: string[][]) {
  const headerRow = headers
    .map((header) => `<Cell><Data ss:Type="String">${normalizeSheetValue(header)}</Data></Cell>`)
    .join('');
  const bodyRows = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${normalizeSheetValue(cell)}</Data></Cell>`)
          .join('')}</Row>`
    )
    .join('');

  return `<Worksheet ss:Name="${normalizeSheetValue(name)}"><Table><Row>${headerRow}</Row>${bodyRows}</Table></Worksheet>`;
}

export function buildSalesReportExcelContent(dataset: SalesReportDataset) {
  const detailHeaders = [
    'Fecha',
    'Venta ID',
    'Cliente',
    'Telefono',
    'Vendedor',
    'Metodo de pago',
    'Estado',
    'Total venta',
    'Tipo item',
    'Nombre item',
    'Categoria',
    'Subcategoria',
    'Variante',
    'SKU',
    'Referencia',
    'Cantidad',
    'Precio unitario',
    'Costo unitario',
    'Subtotal',
    'Utilidad',
    'Observaciones',
  ];
  const summaryHeaders = [
    'Fecha',
    'Venta ID',
    'Cliente',
    'Telefono',
    'Vendedor',
    'Metodo de pago',
    'Estado',
    'Items',
    'Cantidad total',
    'Ingreso total',
    'Costo total',
    'Utilidad total',
    'Observaciones',
  ];

  const detailRows = dataset.detailRows.map((row) => [
    formatDateTime(row.saleDate),
    row.saleId,
    row.customer,
    row.customerPhone,
    row.seller,
    row.paymentMethod,
    row.saleStatus,
    formatCurrency(row.saleTotal),
    row.itemType === 'product' ? 'Producto' : 'Servicio',
    row.itemName,
    row.category,
    row.subcategory,
    row.variant,
    row.sku,
    row.reference,
    formatNumber(row.quantity),
    formatCurrency(row.unitPrice),
    formatCurrency(row.unitCost),
    formatCurrency(row.subtotal),
    formatCurrency(row.utility),
    row.observations,
  ]);

  const summaryRows = dataset.summaryRows.map((row) => [
    formatDateTime(row.saleDate),
    row.saleId,
    row.customer,
    row.customerPhone,
    row.seller,
    row.paymentMethod,
    row.saleStatus,
    formatNumber(row.itemCount),
    formatNumber(row.totalQuantity),
    formatCurrency(row.totalRevenue),
    formatCurrency(row.totalCost),
    formatCurrency(row.totalProfit),
    row.observations,
  ]);

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${createWorksheetXml('Detalle por item', detailHeaders, detailRows)}
${createWorksheetXml('Resumen por venta', summaryHeaders, summaryRows)}
</Workbook>`;
}

function writePdfTableRow(doc: jsPDF, values: string[], positions: number[], y: number) {
  values.forEach((value, index) => {
    doc.text(value, positions[index], y);
  });
}

export function buildSalesReportPdf(dataset: SalesReportDataset, monthLabel: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const bottomY = pageHeight - 12;
  let y = 15;

  const ensureSpace = (needed = 8) => {
    if (y + needed <= bottomY) return;
    doc.addPage();
    y = 15;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Reporte detallado de ventas', marginX, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Periodo: ${monthLabel}`, marginX, y);
  y += 5;
  doc.text(
    'Metodo de pago: no registrado en la estructura actual. Estado: inferido desde devoluciones o marcado como completado.',
    marginX,
    y,
    { maxWidth: pageWidth - marginX * 2 }
  );
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Resumen por venta', marginX, y);
  y += 6;
  doc.setFontSize(8.5);
  writePdfTableRow(
    doc,
    ['Fecha', 'Venta', 'Cliente', 'Vendedor', 'Estado', 'Total', 'Utilidad'],
    [marginX, 38, 65, 125, 180, 220, 255],
    y
  );
  y += 4;
  doc.setDrawColor(180, 180, 180);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5;
  doc.setFont('helvetica', 'normal');

  dataset.summaryRows.forEach((row) => {
    ensureSpace(7);
    writePdfTableRow(
      doc,
      [
        row.saleDate.slice(0, 10),
        row.saleId.slice(0, 18),
        row.customer.slice(0, 28),
        row.seller.slice(0, 22),
        row.saleStatus.slice(0, 18),
        formatCurrency(row.totalRevenue),
        formatCurrency(row.totalProfit),
      ],
      [marginX, 38, 65, 125, 180, 220, 255],
      y
    );
    y += 6;
  });

  y += 4;
  ensureSpace(12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Detalle por item vendido', marginX, y);
  y += 6;
  doc.setFontSize(7.5);
  writePdfTableRow(
    doc,
    ['Fecha', 'Venta', 'Cliente', 'Tipo', 'Item', 'Cant.', 'P. unit', 'Costo', 'Subtotal', 'Utilidad'],
    [marginX, 28, 52, 103, 118, 182, 198, 223, 246, 272],
    y
  );
  y += 4;
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5;
  doc.setFont('helvetica', 'normal');

  dataset.detailRows.forEach((row) => {
    ensureSpace(7);
    writePdfTableRow(
      doc,
      [
        row.saleDate.slice(0, 10),
        row.saleId.slice(0, 12),
        row.customer.slice(0, 24),
        row.itemType === 'product' ? 'Prod.' : 'Serv.',
        row.itemName.slice(0, 32),
        formatNumber(row.quantity),
        formatCurrency(row.unitPrice),
        formatCurrency(row.unitCost),
        formatCurrency(row.subtotal),
        formatCurrency(row.utility),
      ],
      [marginX, 28, 52, 103, 118, 182, 198, 223, 246, 272],
      y
    );
    y += 6;
  });

  return doc;
}
