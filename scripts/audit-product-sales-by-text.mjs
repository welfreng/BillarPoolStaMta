import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectRoot = process.cwd();
const envFile = path.join(projectRoot, '.env.local');

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
    throw new Error('Firebase Admin SDK no esta configurado.');
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

function compactSale(sale) {
  return {
    id: sale.id,
    saleBatchId: sale.saleBatchId ?? null,
    soldAt: asIso(sale.soldAt),
    customerName: sale.customerName ?? '',
    productId: sale.productId ?? null,
    productName: sale.productName ?? null,
    variantId: sale.variantId ?? null,
    variantName: sale.variantName ?? null,
    quantity: sale.quantity ?? null,
    lineItems: Array.isArray(sale.lineItems)
      ? sale.lineItems.map((item) => ({
          productId: item.productId ?? null,
          productName: item.productName ?? item.name ?? null,
          variantId: item.variantId ?? null,
          variantName: item.variantName ?? null,
          quantity: item.quantity ?? null,
        }))
      : [],
    giftItems: Array.isArray(sale.giftItems)
      ? sale.giftItems.map((item) => ({
          productId: item.productId ?? null,
          productName: item.productName ?? item.name ?? null,
          variantId: item.variantId ?? null,
          variantName: item.variantName ?? null,
          quantity: item.quantity ?? null,
        }))
      : [],
  };
}

loadEnvFile(envFile);
const term = normalize(process.argv.slice(2).join(' '));
if (!term) throw new Error('Uso: node scripts/audit-product-sales-by-text.mjs <texto producto>');

const db = getFirestore(getAdminApp());
const [salesSnap, movementsSnap, mirrorSnap] = await Promise.all([
  db.collection('sales').get(),
  db.collection('movements').get(),
  db.collection('inventory_movements').get(),
]);

const sales = salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const matchedSales = sales.filter((sale) => normalize(JSON.stringify(compactSale(sale))).includes(term));

const movementDocs = movementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const mirrorDocs = mirrorSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const matchedMovements = [...movementDocs, ...mirrorDocs].filter((movement) =>
  normalize(JSON.stringify(movement)).includes(term)
);

console.log(
  JSON.stringify(
    {
      term: process.argv.slice(2).join(' '),
      matchedSales: matchedSales.map(compactSale),
      matchedMovements: matchedMovements.map((movement) => ({
        id: movement.id,
        productId: movement.productId ?? null,
        productName: movement.productName ?? null,
        variantId: movement.variantId ?? null,
        variantName: movement.variantName ?? null,
        type: movement.type ?? null,
        reason: movement.reason ?? null,
        quantity: movement.quantity ?? null,
        occurredAt: asIso(movement.occurredAt),
        notes: movement.notes ?? '',
      })),
    },
    null,
    2
  )
);
