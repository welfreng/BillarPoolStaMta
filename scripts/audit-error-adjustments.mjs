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

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getProductStock(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length > 0 || product?.saleMode === 'varianted') {
    return variants.reduce((sum, variant) => sum + Math.max(toNumber(variant.stock ?? variant.publicStock), 0), 0);
  }
  return Math.max(toNumber(product?.publicStock ?? product?.stock ?? product?.stockOnHand), 0);
}

async function main() {
  loadEnvFile(ENV_FILE);
  const db = getFirestore(getAdminApp());

  const [productsSnap, movementsSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('movements').get(),
  ]);

  const products = productsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const productsById = new Map(products.map((product) => [product.id, product]));
  const movements = movementsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  const errorMovements = movements.filter((movement) => normalize(movement.notes).includes('error'));
  const movementStockByProduct = new Map();
  movements.forEach((movement) => {
    const productId = String(movement.productId ?? '');
    if (!productId) return;
    movementStockByProduct.set(productId, toNumber(movementStockByProduct.get(productId)) + toNumber(movement.quantity));
  });

  const grouped = new Map();
  errorMovements.forEach((movement) => {
    const productId = String(movement.productId ?? '');
    if (!productId) return;
    const current = grouped.get(productId) ?? {
      productId,
      productName: productsById.get(productId)?.name ?? 'Producto no encontrado',
      brand: productsById.get(productId)?.brand ?? '',
      productPublicStock: getProductStock(productsById.get(productId)),
      movementStock: Math.max(toNumber(movementStockByProduct.get(productId)), 0),
      errorMovementCount: 0,
      errorNetQuantity: 0,
      errorMovements: [],
    };

    current.errorMovementCount += 1;
    current.errorNetQuantity += toNumber(movement.quantity);
    current.errorMovements.push({
      id: movement.id,
      type: movement.type ?? '',
      reason: movement.reason ?? '',
      quantity: toNumber(movement.quantity),
      occurredAt: asIso(movement.occurredAt),
      notes: String(movement.notes ?? ''),
    });
    grouped.set(productId, current);
  });

  const productsWithErrorMovements = Array.from(grouped.values()).sort((left, right) =>
    left.productName.localeCompare(right.productName, 'es')
  );

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
        totalErrorMovements: errorMovements.length,
        totalProductsWithErrorMovements: productsWithErrorMovements.length,
        products: productsWithErrorMovements,
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
