import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envFile = path.join(process.cwd(), '.env.local');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function sum(items, selector) {
  return items.reduce((total, item) => total + toNumber(selector(item)), 0);
}

function getStoredProductStock(product) {
  return Math.max(toNumber(product.publicStock ?? product.stock ?? product.stockOnHand), 0);
}

function getStoredVariantStock(variant) {
  return Math.max(toNumber(variant?.publicStock ?? variant?.stock), 0);
}

function getVariantOperationalStock(product, productMovements, variant) {
  const hasUnassignedVariantHistory = productMovements.some((movement) => !movement.variantId);
  const variantMovements = productMovements.filter((movement) => movement.variantId === variant.id);
  if (variantMovements.length > 0 && !hasUnassignedVariantHistory) {
    return Math.max(sum(variantMovements, (movement) => movement.quantity), 0);
  }
  return getStoredVariantStock(variant);
}

loadEnvFile(envFile);
const db = getFirestore(getAdminApp());

const [productsSnap, movementsSnap, salesSnap, inventoryMovementsSnap] = await Promise.all([
  db.collection('products').get(),
  db.collection('movements').get(),
  db.collection('sales').get(),
  db.collection('inventory_movements').get(),
]);

const products = productsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const movements = movementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const sales = salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const inventoryMovements = inventoryMovementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

const movementsByProduct = new Map();
const inventoryMovementsByProduct = new Map();

movements.forEach((movement) => {
  const productId = String(movement.productId ?? '');
  if (!productId) return;
  movementsByProduct.set(productId, [...(movementsByProduct.get(productId) ?? []), movement]);
});

inventoryMovements.forEach((movement) => {
  const productId = String(movement.productId ?? '');
  if (!productId) return;
  inventoryMovementsByProduct.set(productId, [...(inventoryMovementsByProduct.get(productId) ?? []), movement]);
});

const movementIds = new Set(movements.map((movement) => movement.id));
const inventoryMovementIds = new Set(inventoryMovements.map((movement) => movement.id));
const saleUnitsByProduct = new Map();
const saleExitUnitsByProduct = new Map();

sales.forEach((sale) => {
  const lineItems = Array.isArray(sale.lineItems)
    ? sale.lineItems
    : [{ productId: sale.productId, quantity: sale.quantity }];
  lineItems.forEach((item) => {
    const productId = String(item.productId ?? '');
    if (!productId) return;
    saleUnitsByProduct.set(productId, toNumber(saleUnitsByProduct.get(productId)) + toNumber(item.quantity));
  });
});

movements
  .filter((movement) => movement.reason === 'sale')
  .forEach((movement) => {
    const productId = String(movement.productId ?? '');
    if (!productId) return;
    saleExitUnitsByProduct.set(productId, toNumber(saleExitUnitsByProduct.get(productId)) + Math.abs(toNumber(movement.quantity)));
  });

const productIssues = products
  .map((product) => {
    const productMovements = movementsByProduct.get(product.id) ?? [];
    const mirrorMovements = inventoryMovementsByProduct.get(product.id) ?? [];
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const isVarianted = product.saleMode === 'varianted' || variants.length > 0;
    const movementStock = Math.max(sum(productMovements, (movement) => movement.quantity), 0);
    const mirrorStock = Math.max(sum(mirrorMovements, (movement) => movement.quantity), 0);
    const operationalStock = isVarianted
      ? variants.reduce((total, variant) => total + getVariantOperationalStock(product, productMovements, variant), 0)
      : productMovements.length > 0
        ? movementStock
        : getStoredProductStock(product);
    const publicStock = getStoredProductStock(product);
    const saleUnits = toNumber(saleUnitsByProduct.get(product.id));
    const saleExitUnits = toNumber(saleExitUnitsByProduct.get(product.id));
    const issues = [
      publicStock !== operationalStock ? 'public_stock_mismatch' : '',
      movementStock !== mirrorStock ? 'movement_mirror_mismatch' : '',
      saleUnits !== saleExitUnits ? 'sale_record_mismatch' : '',
    ].filter(Boolean);

    return {
      id: product.id,
      name: product.name ?? '',
      saleMode: isVarianted ? 'varianted' : 'simple',
      publicStock,
      operationalStock,
      movementStock,
      mirrorStock,
      saleUnits,
      saleExitUnits,
      variantsWithLegacyHistory: isVarianted && productMovements.some((movement) => !movement.variantId),
      issues,
    };
  })
  .filter((product) => product.issues.length > 0);

const missingMirrors = movements.filter((movement) => !inventoryMovementIds.has(movement.id)).length;
const extraMirrors = inventoryMovements.filter((movement) => !movementIds.has(movement.id)).length;

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totals: {
        products: products.length,
        movements: movements.length,
        inventoryMovements: inventoryMovements.length,
        sales: sales.length,
        productsWithIssues: productIssues.length,
        movementsMissingInventoryMirror: missingMirrors,
        extraInventoryMirrors: extraMirrors,
      },
      firstIssues: productIssues.slice(0, 30),
    },
    null,
    2
  )
);
