import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function getAdminApp() {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin SDK no esta configurado en .env.local.');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function asIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function sortByDate(left, right) {
  return new Date(asIso(left.occurredAt ?? left.purchasedAt ?? left.soldAt) ?? 0).getTime()
    - new Date(asIso(right.occurredAt ?? right.purchasedAt ?? right.soldAt) ?? 0).getTime();
}

async function main() {
  loadEnvFile(ENV_FILE);
  const term = process.argv.slice(2).join(' ').trim();
  if (!term) throw new Error('Uso: node scripts/audit-product-ledger.mjs <producto>');

  const db = getFirestore(getAdminApp());
  const [productsSnap, purchasesSnap, purchaseItemsSnap, salesSnap, movementsSnap, inventoryMovementsSnap] =
    await Promise.all([
      db.collection('products').get(),
      db.collection('purchases').get(),
      db.collection('purchase_items').get(),
      db.collection('sales').get(),
      db.collection('movements').get(),
      db.collection('inventory_movements').get(),
    ]);

  const products = productsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const purchases = purchasesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const purchaseItems = purchaseItemsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const sales = salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const movements = movementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const inventoryMovements = inventoryMovementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const matchedProducts = products.filter((product) =>
    normalize([product.name, product.brand, product.category, product.subcategory].join(' ')).includes(normalize(term))
  );
  const productIds = new Set(matchedProducts.map((product) => product.id));

  const relatedPurchases = purchases.filter((purchase) => productIds.has(String(purchase.productId ?? '')));
  const relatedPurchaseItems = purchaseItems.filter((purchase) => productIds.has(String(purchase.productId ?? '')));
  const relatedSales = sales.filter((sale) => {
    if (productIds.has(String(sale.productId ?? ''))) return true;
    return Array.isArray(sale.lineItems) && sale.lineItems.some((item) => productIds.has(String(item.productId ?? '')));
  });
  const relatedMovements = movements.filter((movement) => productIds.has(String(movement.productId ?? '')));
  const relatedInventoryMovements = inventoryMovements.filter((movement) => productIds.has(String(movement.productId ?? '')));

  const movementTotal = relatedMovements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
  const purchaseTotal = relatedPurchases.reduce((sum, purchase) => sum + toNumber(purchase.quantityPurchased ?? purchase.presentationQuantity), 0);
  const saleExitTotal = relatedMovements
    .filter((movement) => movement.reason === 'sale')
    .reduce((sum, movement) => sum + Math.abs(toNumber(movement.quantity)), 0);
  const returnTotal = relatedMovements
    .filter((movement) => movement.reason === 'return')
    .reduce((sum, movement) => sum + Math.abs(toNumber(movement.quantity)), 0);

  const payload = {
    generatedAt: new Date().toISOString(),
    term,
    products: matchedProducts.map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand ?? '',
      saleMode: product.saleMode ?? null,
      publicStock: toNumber(product.publicStock ?? product.stock ?? product.stockOnHand),
      variants: Array.isArray(product.variants)
        ? product.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            stock: toNumber(variant.stock),
            publicStock: toNumber(variant.publicStock),
          }))
        : [],
    })),
    totals: {
      purchaseDocs: relatedPurchases.length,
      purchaseItemDocs: relatedPurchaseItems.length,
      saleDocs: relatedSales.length,
      movementDocs: relatedMovements.length,
      inventoryMovementDocs: relatedInventoryMovements.length,
      purchaseTotal,
      saleExitTotal,
      returnTotal,
      movementTotal,
    },
    purchases: relatedPurchases.sort(sortByDate).map((purchase) => ({
      id: purchase.id,
      purchaseBatchId: purchase.purchaseBatchId ?? purchase.purchaseId ?? null,
      productId: purchase.productId,
      variantId: purchase.variantId ?? null,
      variantName: purchase.variantName ?? null,
      purchasedAt: asIso(purchase.purchasedAt),
      presentationQuantity: toNumber(purchase.presentationQuantity),
      quantityPurchased: toNumber(purchase.quantityPurchased),
      purchasePresentation: purchase.purchasePresentation ?? null,
      purchaseUnitValue: toNumber(purchase.purchaseUnitValue),
    })),
    sales: relatedSales.sort(sortByDate).map((sale) => ({
      id: sale.id,
      saleBatchId: sale.saleBatchId ?? null,
      soldAt: asIso(sale.soldAt),
      customerName: sale.customerName ?? '',
      quantity: toNumber(sale.quantity),
      returnedQuantity: toNumber(sale.returnedQuantity),
      productId: sale.productId ?? null,
      lineItems: Array.isArray(sale.lineItems)
        ? sale.lineItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            variantName: item.variantName ?? null,
            quantity: toNumber(item.quantity),
            unitPrice: toNumber(item.unitPrice),
          }))
        : [],
    })),
    movements: relatedMovements.sort(sortByDate).map((movement) => ({
      id: movement.id,
      productId: movement.productId,
      variantId: movement.variantId ?? null,
      variantName: movement.variantName ?? null,
      purchaseId: movement.purchaseId ?? null,
      purchaseBatchId: movement.purchaseBatchId ?? null,
      saleId: movement.saleId ?? null,
      type: movement.type,
      reason: movement.reason,
      quantity: toNumber(movement.quantity),
      occurredAt: asIso(movement.occurredAt),
      notes: movement.notes ?? '',
    })),
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
