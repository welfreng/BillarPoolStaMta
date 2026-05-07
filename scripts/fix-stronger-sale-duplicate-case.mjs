import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const LOGS_DIR = path.join(PROJECT_ROOT, 'cleanup-logs');

const CUE_PRODUCT_ID = 'iVEAfvh2LyoqWdSAyTzH';
const GIFT_PRODUCT_ID = 'x1UiyPJHNFuxY8xN3Ihj';
const SOLD_AT_ISO = '2026-05-06T12:00:00.000Z';
const RESPONSIBLE_USER = 'liceth campo';
const CUSTOMER_NAMES = new Set(['manuel gutierrez', 'manuelgutierrez']);
const TARGET_BATCH_ID = 'corrected-stronger-manuel-20260506';
const UNIT_PRICE = 200000;
const REAL_UNIT_COST = 95209.17;
const GIFT_UNIT_COST = 7129.17;

const TARGET_LINES = [
  {
    variantId: 'iVEAfvh2LyoqWdSAyTzH-blanconegro',
    variantName: 'BlancoNegro',
    quantity: 8,
    giftQuantity: 8,
  },
  {
    variantId: 'iVEAfvh2LyoqWdSAyTzH-blancoazul',
    variantName: 'BlancoAzul',
    quantity: 1,
    giftQuantity: 1,
  },
  {
    variantId: 'iVEAfvh2LyoqWdSAyTzH-negronaranja',
    variantName: 'NegroNaranja',
    quantity: 6,
    giftQuantity: 6,
  },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getAdminApp() {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin SDK no esta configurado. Define FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL y FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function asIso(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function safeFileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function fetchDocsByFieldChunks(collectionRef, fieldName, values) {
  if (values.length === 0) return [];
  const results = [];
  for (const group of chunk(values, 10)) {
    const snapshot = await collectionRef.where(fieldName, 'in', group).get();
    snapshot.docs.forEach((doc) => results.push(doc));
  }
  return results;
}

async function main() {
  loadEnvFile(ENV_FILE);
  ensureLogsDir();

  const execute = process.argv.includes('--execute');
  const db = getFirestore(getAdminApp());
  const soldAt = Timestamp.fromDate(new Date(SOLD_AT_ISO));
  const now = Timestamp.fromDate(new Date());

  const [salesSnap, cueProductSnap, giftProductSnap, variantDocsSnap] = await Promise.all([
    db.collection('sales').where('productId', '==', CUE_PRODUCT_ID).get(),
    db.collection('products').doc(CUE_PRODUCT_ID).get(),
    db.collection('products').doc(GIFT_PRODUCT_ID).get(),
    db.collection('product_variants').where('productId', '==', CUE_PRODUCT_ID).get(),
  ]);

  const matchedSales = salesSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((sale) => {
      return (
        asIso(sale.soldAt) === SOLD_AT_ISO &&
        normalizeText(sale.responsibleUser) === normalizeText(RESPONSIBLE_USER) &&
        CUSTOMER_NAMES.has(normalizeText(sale.customerName))
      );
    });

  if (matchedSales.length === 0) {
    throw new Error('No se encontraron ventas duplicadas del caso Stronger para corregir.');
  }

  const saleIds = matchedSales.map((sale) => sale.id);
  const saleBatchIds = Array.from(new Set(matchedSales.map((sale) => String(sale.saleBatchId ?? sale.id))));

  const [movementDocs, inventoryMovementDocs, serviceDocs, allMovementsSnap] = await Promise.all([
    fetchDocsByFieldChunks(db.collection('movements'), 'saleId', saleIds),
    fetchDocsByFieldChunks(db.collection('inventory_movements'), 'saleId', saleIds),
    fetchDocsByFieldChunks(db.collection('services'), 'saleBatchId', saleBatchIds),
    db.collection('movements').get(),
  ]);

  const allMovements = allMovementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const saleIdsToDelete = new Set(saleIds);
  const movementIdsToDelete = new Set(movementDocs.map((doc) => doc.id));
  const inventoryMovementIdsToDelete = new Set(inventoryMovementDocs.map((doc) => doc.id));
  const serviceIdsToDelete = new Set(serviceDocs.map((doc) => doc.id));

  const cueProduct = cueProductSnap.data();
  const giftProduct = giftProductSnap.data();
  if (!cueProduct || !giftProduct) {
    throw new Error('No se encontraron los productos del taco o del estuche para hacer la correccion.');
  }

  const currentVariants = Array.isArray(cueProduct.variants) ? cueProduct.variants : [];
  const currentVariantDocs = variantDocsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const createdSales = TARGET_LINES.map((line) => {
    const saleRef = db.collection('sales').doc();
    const giftItems =
      line.giftQuantity > 0
        ? [
            {
              productId: GIFT_PRODUCT_ID,
              quantity: line.giftQuantity,
              unitCost: GIFT_UNIT_COST,
              totalCost: line.giftQuantity * GIFT_UNIT_COST,
              kind: 'gift',
            },
          ]
        : [];
    const lineItem = {
      productId: CUE_PRODUCT_ID,
      variantId: line.variantId,
      variantName: line.variantName,
      quantity: line.quantity,
      unitPrice: UNIT_PRICE,
      realUnitCost: REAL_UNIT_COST,
      totalSale: line.quantity * UNIT_PRICE,
      totalCost: line.quantity * REAL_UNIT_COST,
    };
    const giftedTotalCost = giftItems.reduce((sum, item) => sum + item.totalCost, 0);

    return {
      id: saleRef.id,
      saleBatchId: TARGET_BATCH_ID,
      productId: CUE_PRODUCT_ID,
      soldAt: soldAt,
      quantity: line.quantity,
      unitPrice: UNIT_PRICE,
      totalSale: line.quantity * UNIT_PRICE,
      realUnitCost: REAL_UNIT_COST,
      totalCost: line.quantity * REAL_UNIT_COST + giftedTotalCost,
      grossProfit: line.quantity * UNIT_PRICE - line.quantity * REAL_UNIT_COST - giftedTotalCost,
      lineItems: [lineItem],
      giftItems,
      giftedProductId: giftItems[0]?.productId ?? null,
      giftedQuantity: giftItems[0]?.quantity ?? 0,
      giftedUnitCost: giftItems[0]?.unitCost ?? 0,
      giftedTotalCost,
      returnedQuantity: 0,
      returnedSaleAmount: 0,
      returnedCostAmount: 0,
      customerName: 'MANUEL GUTIERREZ',
      customerPhone: '',
      paymentMethod: 'efectivo',
      paymentReference: '',
      notes: 'Correccion administrativa de venta duplicada Stronger del 2026-05-06.',
      responsibleUser: RESPONSIBLE_USER,
    };
  });

  const createdMovementEntries = createdSales.flatMap((sale) => {
    const lineItem = sale.lineItems[0];
    const saleMovementId = db.collection('movements').doc().id;
    const saleMovement = {
      id: saleMovementId,
      saleId: sale.id,
      productId: lineItem.productId,
      variantId: lineItem.variantId,
      variantName: lineItem.variantName,
      type: 'exit',
      reason: 'sale',
      quantity: -Math.abs(lineItem.quantity),
      occurredAt: soldAt,
      notes: sale.notes,
      responsibleUser: RESPONSIBLE_USER,
      relatedUnitCost: REAL_UNIT_COST,
      inventorySourceType: 'sale',
      inventorySourceId: TARGET_BATCH_ID,
    };

    const giftMovements = sale.giftItems.map((giftItem) => {
      const movementId = db.collection('movements').doc().id;
      return {
        id: movementId,
        saleId: sale.id,
        productId: giftItem.productId,
        variantId: null,
        variantName: null,
        type: 'exit',
        reason: 'gift',
        quantity: -Math.abs(giftItem.quantity),
        occurredAt: soldAt,
        notes: sale.notes,
        responsibleUser: RESPONSIBLE_USER,
        relatedUnitCost: giftItem.unitCost,
        inventorySourceType: 'sale-gift',
        inventorySourceId: sale.id,
      };
    });

    return [saleMovement, ...giftMovements];
  });

  const deletedMovementIdSet = new Set([...movementIdsToDelete, ...inventoryMovementIdsToDelete]);
  const projectedMovements = allMovements
    .filter((movement) => !deletedMovementIdSet.has(movement.id))
    .concat(
      createdMovementEntries.map((movement) => ({
        id: movement.id,
        saleId: movement.saleId,
        productId: movement.productId,
        variantId: movement.variantId ?? undefined,
        variantName: movement.variantName ?? undefined,
        type: movement.type,
        reason: movement.reason,
        quantity: movement.quantity,
        occurredAt: movement.occurredAt,
        notes: movement.notes,
        responsibleUser: movement.responsibleUser,
        relatedUnitCost: movement.relatedUnitCost,
      }))
    );

  const cueVariantStockMap = new Map(
    currentVariants.map((variant) => {
      const stock = projectedMovements
        .filter((movement) => movement.productId === CUE_PRODUCT_ID && movement.variantId === variant.id)
        .reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);
      return [variant.id, Math.max(stock, 0)];
    })
  );

  const cuePublicStock = Array.from(cueVariantStockMap.values()).reduce((sum, value) => sum + value, 0);
  const giftPublicStock = Math.max(
    projectedMovements
      .filter((movement) => movement.productId === GIFT_PRODUCT_ID)
      .reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0),
    0
  );

  const nextCueVariants = currentVariants.map((variant) => ({
    ...variant,
    stock: Math.max(Number(cueVariantStockMap.get(variant.id) ?? variant.stock ?? 0), 0),
    publicStock: Math.max(Number(cueVariantStockMap.get(variant.id) ?? variant.publicStock ?? 0), 0),
  }));

  const nextCueVariantDocs = currentVariantDocs.map((variant) => ({
    ...variant,
    stock: Math.max(Number(cueVariantStockMap.get(variant.id) ?? variant.stock ?? 0), 0),
    publicStock: Math.max(Number(cueVariantStockMap.get(variant.id) ?? variant.publicStock ?? 0), 0),
  }));

  const summary = {
    execute,
    matchedSales: {
      count: matchedSales.length,
      totalQuantity: matchedSales.reduce((sum, sale) => sum + Number(sale.quantity ?? 0), 0),
      totalGiftQuantity: matchedSales.reduce(
        (sum, sale) =>
          sum +
          (Array.isArray(sale.giftItems)
            ? sale.giftItems
                .filter((item) => item.productId === GIFT_PRODUCT_ID)
                .reduce((giftSum, item) => giftSum + Number(item.quantity ?? 0), 0)
            : 0),
        0
      ),
      saleIds,
      saleBatchIds,
    },
    deletedArtifacts: {
      movementCount: movementIdsToDelete.size,
      inventoryMovementCount: inventoryMovementIdsToDelete.size,
      serviceCount: serviceIdsToDelete.size,
    },
    replacement: {
      saleBatchId: TARGET_BATCH_ID,
      totalQuantity: TARGET_LINES.reduce((sum, line) => sum + line.quantity, 0),
      totalGiftQuantity: TARGET_LINES.reduce((sum, line) => sum + line.giftQuantity, 0),
      lines: TARGET_LINES,
    },
    projectedStock: {
      cueProductId: CUE_PRODUCT_ID,
      cuePublicStock,
      cueVariants: Object.fromEntries(nextCueVariants.map((variant) => [variant.name, variant.stock])),
      giftProductId: GIFT_PRODUCT_ID,
      giftPublicStock,
    },
  };

  const reportPath = path.join(
    LOGS_DIR,
    `stronger-sale-fix-${execute ? 'executed' : 'dry-run'}-${safeFileTimestamp()}.json`
  );

  if (!execute) {
    fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ok: true, reportPath, summary }, null, 2));
    return;
  }

  const batch = db.batch();

  saleIds.forEach((saleId) => {
    batch.delete(db.collection('sales').doc(saleId));
  });
  movementIdsToDelete.forEach((movementId) => {
    batch.delete(db.collection('movements').doc(movementId));
  });
  inventoryMovementIdsToDelete.forEach((movementId) => {
    batch.delete(db.collection('inventory_movements').doc(movementId));
  });
  serviceIdsToDelete.forEach((serviceId) => {
    batch.delete(db.collection('services').doc(serviceId));
  });

  createdSales.forEach((sale) => {
    batch.set(db.collection('sales').doc(sale.id), {
      ...sale,
      lineItems: sale.lineItems.map((item) => ({
        ...item,
        variantId: item.variantId ?? null,
        variantName: item.variantName ?? null,
      })),
      giftItems: sale.giftItems.map((item) => ({
        ...item,
        kind: item.kind ?? 'gift',
      })),
      variantId: sale.lineItems[0]?.variantId ?? null,
      variantName: sale.lineItems[0]?.variantName ?? null,
      paymentReference: sale.paymentReference || null,
      giftedProductId: sale.giftedProductId ?? null,
      soldAt,
    });
  });

  createdMovementEntries.forEach((movement) => {
    batch.set(db.collection('movements').doc(movement.id), {
      id: movement.id,
      saleId: movement.saleId,
      productId: movement.productId,
      variantId: movement.variantId ?? null,
      variantName: movement.variantName ?? null,
      type: movement.type,
      reason: movement.reason,
      quantity: movement.quantity,
      notes: movement.notes,
      occurredAt: soldAt,
      responsibleUser: movement.responsibleUser,
      relatedUnitCost: movement.relatedUnitCost,
    });
    batch.set(db.collection('inventory_movements').doc(movement.id), {
      id: movement.id,
      saleId: movement.saleId,
      productId: movement.productId,
      variantId: movement.variantId ?? null,
      variantName: movement.variantName ?? null,
      sourceType: movement.inventorySourceType,
      sourceId: movement.inventorySourceId,
      type: movement.type,
      reason: movement.reason,
      quantity: movement.quantity,
      notes: movement.notes,
      occurredAt: soldAt,
      responsibleUser: movement.responsibleUser,
      relatedUnitCost: movement.relatedUnitCost,
    });
  });

  batch.set(
    db.collection('products').doc(CUE_PRODUCT_ID),
    {
      variants: nextCueVariants,
      publicStock: cuePublicStock,
      updatedAt: now,
    },
    { merge: true }
  );

  nextCueVariantDocs.forEach((variant) => {
    batch.set(
      db.collection('product_variants').doc(variant.id),
      {
        ...variant,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  batch.set(
    db.collection('products').doc(GIFT_PRODUCT_ID),
    {
      publicStock: giftPublicStock,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    db.collection('admin_audit_logs').doc(),
    {
      actor: 'codex-script',
      action: 'fix-stronger-sale-duplicate-case',
      targetProductId: CUE_PRODUCT_ID,
      soldAt,
      createdAt: now,
      summary,
    },
    { merge: true }
  );

  await batch.commit();

  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, reportPath, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
