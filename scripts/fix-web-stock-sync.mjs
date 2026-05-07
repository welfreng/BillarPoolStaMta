import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

function buildProductFix(product, movementStockByProductId) {
  const productId = String(product.id ?? '');
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const hasVariants = variants.length > 0;
  const movementStock = toNumber(movementStockByProductId.get(productId) ?? 0);
  const variantStock = variants.reduce((sum, variant) => sum + toNumber(variant.stock), 0);
  const currentPublicStock = toNumber(product.publicStock ?? product.stock ?? product.stockOnHand ?? 0);
  const expectedPublicStock = hasVariants ? variantStock : movementStock;
  const nextStatus = expectedPublicStock > 0 ? 'active' : String(product.status ?? 'active');

  const nextVariants = hasVariants
    ? variants.map((variant) => ({
        ...variant,
        publicStock: toNumber(variant.stock),
      }))
    : null;

  const hasVariantMismatch = hasVariants
    ? variants.some((variant) => toNumber(variant.publicStock ?? variant.stock) !== toNumber(variant.stock))
    : false;

  const needsUpdate =
    currentPublicStock !== expectedPublicStock ||
    hasVariantMismatch ||
    (expectedPublicStock > 0 && String(product.status ?? 'active') !== 'active');

  return {
    productId,
    name: String(product.name ?? 'Producto'),
    expectedPublicStock,
    currentPublicStock,
    currentStatus: String(product.status ?? 'active'),
    nextStatus,
    hasVariants,
    hasVariantMismatch,
    nextVariants,
    needsUpdate,
  };
}

async function main() {
  loadEnvFile(ENV_FILE);
  const execute = process.argv.includes('--execute');

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

  const fixes = productsSnap.docs
    .map((docSnap) => buildProductFix({ id: docSnap.id, ...docSnap.data() }, movementStockByProductId))
    .filter((item) => item.needsUpdate);

  if (execute && fixes.length > 0) {
    let batch = db.batch();
    let operationCount = 0;

    for (const fix of fixes) {
      const productRef = db.collection('products').doc(fix.productId);
      batch.set(
        productRef,
        {
          publicStock: fix.expectedPublicStock,
          ...(fix.expectedPublicStock > 0 ? { status: 'active' } : {}),
          ...(fix.nextVariants ? { variants: fix.nextVariants } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      operationCount += 1;

      if (operationCount === 450) {
        await batch.commit();
        batch = db.batch();
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
        execute,
        totalProductsToFix: fixes.length,
        products: fixes.map((fix) => ({
          productId: fix.productId,
          name: fix.name,
          currentPublicStock: fix.currentPublicStock,
          expectedPublicStock: fix.expectedPublicStock,
          currentStatus: fix.currentStatus,
          nextStatus: fix.nextStatus,
          hasVariants: fix.hasVariants,
          hasVariantMismatch: fix.hasVariantMismatch,
        })),
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
