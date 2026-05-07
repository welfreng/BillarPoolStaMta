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

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesTerm(product, term) {
  if (!term) return false;
  const haystack = normalize([product.name, product.brand, product.subcategory, product.category].join(' '));
  return haystack.includes(normalize(term));
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

  const productTerm = process.argv[2]?.trim();
  const giftTerm = process.argv[3]?.trim();
  if (!productTerm) {
    throw new Error('Uso: node scripts/inspect-stock-case.mjs <producto> [obsequio]');
  }

  const db = getFirestore(getAdminApp());

  const [productsSnap, salesSnap, movementsSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('sales').get(),
    db.collection('movements').get(),
  ]);

  const products = productsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const sales = salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const movements = movementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const matchedProducts = products.filter((product) => matchesTerm(product, productTerm));
  if (matchedProducts.length === 0) {
    throw new Error(`No se encontro ningun producto que coincida con "${productTerm}".`);
  }

  const giftProducts = giftTerm ? products.filter((product) => matchesTerm(product, giftTerm)) : [];
  const targetIds = new Set([
    ...matchedProducts.map((product) => product.id),
    ...giftProducts.map((product) => product.id),
  ]);

  const relevantSales = sales
    .filter((sale) => {
      const lineHit = Array.isArray(sale.lineItems)
        ? sale.lineItems.some((item) => targetIds.has(String(item.productId ?? '')))
        : targetIds.has(String(sale.productId ?? ''));
      const giftHit = Array.isArray(sale.giftItems)
        ? sale.giftItems.some((item) => targetIds.has(String(item.productId ?? '')))
        : false;
      return lineHit || giftHit;
    })
    .sort((left, right) => {
      const leftDate = new Date(asIso(left.soldAt) ?? 0).getTime();
      const rightDate = new Date(asIso(right.soldAt) ?? 0).getTime();
      return rightDate - leftDate;
    });

  const relevantMovements = movements
    .filter((movement) => targetIds.has(String(movement.productId ?? '')))
    .sort((left, right) => {
      const leftDate = new Date(asIso(left.occurredAt) ?? 0).getTime();
      const rightDate = new Date(asIso(right.occurredAt) ?? 0).getTime();
      return rightDate - leftDate;
    });

  const payload = {
    productTerm,
    giftTerm: giftTerm ?? null,
    matchedProducts: matchedProducts.map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      saleMode: product.saleMode,
      publicStock: product.publicStock,
      variants: Array.isArray(product.variants)
        ? product.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            stock: variant.stock,
            publicStock: variant.publicStock,
          }))
        : [],
    })),
    giftProducts: giftProducts.map((product) => ({
      id: product.id,
      name: product.name,
      publicStock: product.publicStock,
    })),
    recentSales: relevantSales.slice(0, 25).map((sale) => ({
      id: sale.id,
      saleBatchId: sale.saleBatchId ?? null,
      soldAt: asIso(sale.soldAt),
      customerName: sale.customerName ?? '',
      quantity: sale.quantity,
      productId: sale.productId,
      lineItems: Array.isArray(sale.lineItems)
        ? sale.lineItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            variantName: item.variantName ?? null,
            quantity: item.quantity,
          }))
        : [],
      giftItems: Array.isArray(sale.giftItems)
        ? sale.giftItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            kind: item.kind ?? 'gift',
          }))
        : [],
    })),
    recentMovements: relevantMovements.slice(0, 60).map((movement) => ({
      id: movement.id,
      saleId: movement.saleId ?? null,
      productId: movement.productId,
      variantId: movement.variantId ?? null,
      variantName: movement.variantName ?? null,
      type: movement.type,
      reason: movement.reason,
      quantity: movement.quantity,
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
