import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const SHOULD_EXECUTE = process.argv.includes('--execute');

const PRODUCT_ID = '2yuDG5E7ETmvFZtZZwzz';
const SALE_ID = '4eab78VnpJkmQeK41mXY';

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

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function asIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function main() {
  loadEnvFile(ENV_FILE);

  const db = getFirestore(getAdminApp());
  const [saleDoc, movementsSnap, inventoryMovementsSnap] = await Promise.all([
    db.collection('sales').doc(SALE_ID).get(),
    db.collection('movements').where('saleId', '==', SALE_ID).get(),
    db.collection('inventory_movements').where('saleId', '==', SALE_ID).get(),
  ]);

  if (!saleDoc.exists) {
    console.log(JSON.stringify({ execute: SHOULD_EXECUTE, deleted: false, reason: 'sale_not_found' }, null, 2));
    return;
  }

  const sale = { id: saleDoc.id, ...saleDoc.data() };
  const lineItems = Array.isArray(sale.lineItems) ? sale.lineItems : [];
  const belongsToProduct = sale.productId === PRODUCT_ID || lineItems.some((item) => item.productId === PRODUCT_ID);
  const isZeroSale =
    toNumber(sale.quantity) === 0 &&
    toNumber(sale.totalSale) === 0 &&
    lineItems.every((item) => item.productId !== PRODUCT_ID || toNumber(item.quantity) === 0);

  if (!belongsToProduct || !isZeroSale) {
    throw new Error('La venta no coincide con el caso seguro para borrar: Taco Enterizo en cantidad cero.');
  }

  const movementIds = movementsSnap.docs.map((doc) => doc.id);
  const inventoryMovementIds = inventoryMovementsSnap.docs.map((doc) => doc.id);

  const plan = {
    execute: SHOULD_EXECUTE,
    sale: {
      id: sale.id,
      saleBatchId: sale.saleBatchId ?? null,
      soldAt: asIso(sale.soldAt),
      customerName: sale.customerName ?? '',
      quantity: toNumber(sale.quantity),
      totalSale: toNumber(sale.totalSale),
      totalCost: toNumber(sale.totalCost),
      lineItems: lineItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        variantName: item.variantName ?? null,
        quantity: toNumber(item.quantity),
      })),
    },
    deletedMovementIds: movementIds,
    deletedInventoryMovementIds: inventoryMovementIds,
  };

  if (SHOULD_EXECUTE) {
    const batch = db.batch();
    batch.delete(db.collection('sales').doc(SALE_ID));
    movementIds.forEach((id) => batch.delete(db.collection('movements').doc(id)));
    inventoryMovementIds.forEach((id) => batch.delete(db.collection('inventory_movements').doc(id)));
    await batch.commit();
  }

  console.log(JSON.stringify(plan, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
