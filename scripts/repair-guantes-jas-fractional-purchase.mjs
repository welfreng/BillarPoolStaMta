import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const envFile = path.join(process.cwd(), '.env.local');
const productId = 'jFLPkHveC2g1ThK0Fs8Y';
const purchaseId = 'JyYn301t0t6tidwYgZ8s';
const movementId = 'HbU6SwhMakqDCJ9hkIKw';
const correctedQuantity = 83;

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

const movementsSnap = await db.collection('movements').where('productId', '==', productId).get();
const currentMovementStock = movementsSnap.docs.reduce((sum, docSnap) => sum + toNumber(docSnap.data().quantity), 0);
const targetStock = Math.round(currentMovementStock - 0.33);

const batch = db.batch();
for (const collectionName of ['purchases', 'purchase_items']) {
  batch.set(
    db.collection(collectionName).doc(purchaseId),
    {
      presentationQuantity: correctedQuantity,
      quantityPurchased: correctedQuantity,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
for (const collectionName of ['movements', 'inventory_movements']) {
  batch.set(
    db.collection(collectionName).doc(movementId),
    {
      quantity: correctedQuantity,
      notes: 'Compra grupal registrada a proveedor Guantes JAS Sencillos. Cantidad corregida de 83.33 a 83 por unidad entera.',
    },
    { merge: true }
  );
}
batch.set(
  db.collection('products').doc(productId),
  {
    publicStock: targetStock,
    stock: targetStock,
    stockOnHand: targetStock,
    status: targetStock > 0 ? 'active' : 'active',
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);

await batch.commit();

console.log(
  JSON.stringify(
    {
      productId,
      purchaseId,
      movementId,
      previousMovementStock: currentMovementStock,
      targetStock,
      correctedQuantity,
    },
    null,
    2
  )
);
