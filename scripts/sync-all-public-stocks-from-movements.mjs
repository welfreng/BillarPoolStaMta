import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin SDK no esta configurado.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function isVarianted(product) {
  return product.saleMode === 'varianted' || (Array.isArray(product.variants) && product.variants.length > 0);
}

function sumMovements(movements) {
  return movements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
}

loadEnvFile(envFile);
const db = getFirestore(getAdminApp());

const [productsSnap, movementsSnap] = await Promise.all([
  db.collection('products').get(),
  db.collection('movements').get(),
]);

const movementsByProduct = new Map();
const movementsByVariant = new Map();

movementsSnap.docs.forEach((docSnap) => {
  const movement = docSnap.data();
  const productId = String(movement.productId ?? '');
  if (!productId) return;
  const productMovements = movementsByProduct.get(productId) ?? [];
  productMovements.push(movement);
  movementsByProduct.set(productId, productMovements);

  const variantId = movement.variantId ? String(movement.variantId) : '';
  if (!variantId) return;
  const variantMovements = movementsByVariant.get(variantId) ?? [];
  variantMovements.push(movement);
  movementsByVariant.set(variantId, variantMovements);
});

const batch = db.batch();
const changes = [];
let writes = 0;

productsSnap.docs.forEach((docSnap) => {
  const product = docSnap.data();
  const productRef = db.collection('products').doc(docSnap.id);

  if (!isVarianted(product)) {
    const productMovements = movementsByProduct.get(docSnap.id) ?? [];
    if (productMovements.length === 0) return;

    const movementStock = Math.max(sumMovements(productMovements), 0);
    const currentPublicStock = Math.max(toNumber(product.publicStock ?? product.stock ?? product.stockOnHand), 0);
    const shouldForcePublicStatus = movementStock > 0 && product.status !== 'active';
    if (movementStock === currentPublicStock && !shouldForcePublicStatus) return;

    batch.set(
      productRef,
      {
        publicStock: movementStock,
        stock: movementStock,
        stockOnHand: movementStock,
        ...(shouldForcePublicStatus ? { status: 'active' } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    writes += 1;
    changes.push({
      productId: docSnap.id,
      name: product.name ?? '',
      type: 'simple',
      previousPublicStock: currentPublicStock,
      movementStock,
    });
    return;
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const nextVariants = variants.map((variant, index) => {
    const variantId = String(variant.id ?? '');
    const variantMovements = movementsByVariant.get(variantId) ?? [];
    const stock =
      variantMovements.length > 0
        ? Math.max(sumMovements(variantMovements), 0)
        : Math.max(toNumber(variant.publicStock ?? variant.stock), 0);
    return {
      ...variant,
      stock,
      publicStock: stock,
      sortOrder: toNumber(variant.sortOrder ?? index),
    };
  });
  const publicStock = nextVariants.reduce((sum, variant) => sum + Math.max(toNumber(variant.publicStock), 0), 0);
  const currentPublicStock = Math.max(toNumber(product.publicStock), 0);
  const variantsChanged = nextVariants.some((variant, index) => {
    const current = variants[index] ?? {};
    return (
      Math.max(toNumber(current.stock ?? current.publicStock), 0) !== Math.max(toNumber(variant.stock), 0) ||
      Math.max(toNumber(current.publicStock ?? current.stock), 0) !== Math.max(toNumber(variant.publicStock), 0)
    );
  });
  const shouldForcePublicStatus = publicStock > 0 && product.status !== 'active';

  if (publicStock === currentPublicStock && !variantsChanged && !shouldForcePublicStatus) return;

  batch.set(
    productRef,
    {
      variants: nextVariants,
      publicStock,
      ...(shouldForcePublicStatus ? { status: 'active' } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  writes += 1;
  nextVariants.forEach((variant) => {
    batch.set(
      db.collection('product_variants').doc(variant.id),
      {
        ...variant,
        productId: docSnap.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    writes += 1;
  });
  changes.push({
    productId: docSnap.id,
    name: product.name ?? '',
    type: 'varianted',
    previousPublicStock: currentPublicStock,
    movementStock: publicStock,
    variants: nextVariants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      stock: variant.stock,
    })),
  });
});

if (writes > 0) {
  await batch.commit();
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      writes,
      changes,
    },
    null,
    2
  )
);
