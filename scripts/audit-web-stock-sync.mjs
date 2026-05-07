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

function toNumber(value) {
  return Math.max(Number(value ?? 0), 0);
}

function summarizeProduct(product, movementStockByProductId) {
  const productId = String(product.id ?? '');
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const hasVariants = variants.length > 0;
  const variantStock = variants.reduce((sum, variant) => sum + toNumber(variant.stock), 0);
  const variantPublicStock = variants.reduce((sum, variant) => sum + toNumber(variant.publicStock ?? variant.stock), 0);
  const movementStock = toNumber(movementStockByProductId.get(productId) ?? 0);
  const legacySimpleStock = toNumber(product.stock ?? product.stockOnHand ?? 0);
  const currentPublicStock = toNumber(product.publicStock ?? product.stock ?? product.stockOnHand ?? 0);
  const status = String(product.status ?? 'active');

  const expectedCatalogStock = hasVariants
    ? variantStock
    : Math.max(movementStock, legacySimpleStock, currentPublicStock);

  const shouldBeActive = expectedCatalogStock > 0;
  const hasMismatch =
    currentPublicStock !== expectedCatalogStock ||
    (hasVariants && variantPublicStock !== variantStock) ||
    (shouldBeActive && status !== 'active');

  return {
    id: productId,
    name: String(product.name ?? 'Producto'),
    status,
    hasVariants,
    currentPublicStock,
    expectedCatalogStock,
    movementStock,
    legacySimpleStock,
    variantStock,
    variantPublicStock,
    variantCount: variants.length,
    shouldBeActive,
    hasMismatch,
  };
}

async function main() {
  loadEnvFile(ENV_FILE);

  const db = getFirestore(getAdminApp());
  const [productsSnap, movementsSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('movements').get(),
  ]);

  const movementStockByProductId = new Map();
  movementsSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const productId = String(data.productId ?? '');
    if (!productId) return;
    movementStockByProductId.set(
      productId,
      Number(movementStockByProductId.get(productId) ?? 0) + Number(data.quantity ?? 0)
    );
  });

  const products = productsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const summaries = products.map((product) => summarizeProduct(product, movementStockByProductId));

  const mismatches = summaries.filter((item) => item.hasMismatch);
  const legacySimpleProductsWithStock = summaries.filter(
    (item) => !item.hasVariants && item.legacySimpleStock > 0 && item.movementStock === 0
  );
  const visibleButInactive = summaries.filter((item) => item.shouldBeActive && item.status !== 'active');

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
        totals: {
          products: summaries.length,
          mismatches: mismatches.length,
          legacySimpleProductsWithStock: legacySimpleProductsWithStock.length,
          visibleButInactive: visibleButInactive.length,
        },
        sampleMismatches: mismatches.slice(0, 50),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
