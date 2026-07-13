import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const envFile = path.join(process.cwd(), '.env.local');
const productId = 'vdEWqd6ea1GSEykVKaUf';
const variantId = 'vdEWqd6ea1GSEykVKaUf-rojo';
const repairTag = 'Correccion por conteo fisico 2026-07-13. Taco de Billar VanQs Solidos vendido/no disponible fisicamente.';

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

loadEnvFile(envFile);
const db = getFirestore(getAdminApp());

const [productSnap, movementsSnap] = await Promise.all([
  db.collection('products').doc(productId).get(),
  db.collection('movements').where('productId', '==', productId).get(),
]);

if (!productSnap.exists) {
  throw new Error(`No existe el producto ${productId}.`);
}

const product = productSnap.data();
const variants = Array.isArray(product.variants) ? product.variants : [];
const variantIndex = variants.findIndex((variant) => variant.id === variantId);

if (variantIndex < 0) {
  throw new Error(`No existe la variante ${variantId}.`);
}

const movementStock = movementsSnap.docs.reduce((sum, docSnap) => sum + toNumber(docSnap.data().quantity), 0);
const variantStock = variants.reduce((sum, variant) => {
  if (variant.id !== variantId) return sum;
  return sum + toNumber(variant.stock ?? variant.publicStock);
}, 0);
const alreadyRepaired = movementsSnap.docs.some((docSnap) => String(docSnap.data().notes ?? '').includes(repairTag));
const delta = 0 - movementStock;

const nextVariants = variants.map((variant) =>
  variant.id === variantId
    ? {
        ...variant,
        stock: 0,
        publicStock: 0,
      }
    : variant
);
const nextTotalStock = nextVariants.reduce((sum, variant) => sum + Math.max(toNumber(variant.stock ?? variant.publicStock), 0), 0);

const batch = db.batch();
let writes = 0;

if (delta !== 0 && !alreadyRepaired) {
  const movementRef = db.collection('movements').doc();
  const movementPayload = {
    id: movementRef.id,
    productId,
    variantId,
    variantName: 'Rojo',
    type: 'adjustment',
    reason: 'manual-adjustment',
    quantity: delta,
    notes: `${repairTag} Ajuste ${delta > 0 ? '+' : ''}${delta}.`,
    occurredAt: Timestamp.fromDate(new Date()),
    responsibleUser: 'Administrador',
    relatedUnitCost: toNumber(product.cost ?? product.unitCost ?? product.averageCost),
  };
  batch.set(movementRef, movementPayload);
  batch.set(db.collection('inventory_movements').doc(movementRef.id), {
    ...movementPayload,
    sourceType: 'manual-adjustment',
    sourceId: movementRef.id,
  });
  writes += 2;
}

batch.set(
  db.collection('products').doc(productId),
  {
    variants: nextVariants,
    publicStock: nextTotalStock,
    stock: nextTotalStock,
    stockOnHand: nextTotalStock,
    status: nextTotalStock > 0 ? product.status ?? 'active' : 'active',
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);
batch.set(
  db.collection('product_variants').doc(variantId),
  {
    ...nextVariants[variantIndex],
    productId,
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);
writes += 2;

await batch.commit();

console.log(
  JSON.stringify(
    {
      productId,
      variantId,
      previousMovementStock: movementStock,
      previousVariantStock: variantStock,
      targetStock: 0,
      delta,
      alreadyRepaired,
      writes,
    },
    null,
    2
  )
);
