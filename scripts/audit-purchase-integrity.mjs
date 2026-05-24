import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const SHOULD_EXECUTE = process.argv.includes('--execute');

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

function toPlainDoc(document) {
  return {
    id: document.id,
    ...document.data(),
  };
}

loadEnvFile(ENV_FILE);
const app = getAdminApp();
const db = getFirestore(app);

const [purchaseSnapshot, purchaseItemSnapshot, movementSnapshot, inventoryMovementSnapshot] = await Promise.all([
  db.collection('purchases').get(),
  db.collection('purchase_items').get(),
  db.collection('movements').get(),
  db.collection('inventory_movements').get(),
]);

const purchases = purchaseSnapshot.docs.map(toPlainDoc);
const purchaseItems = purchaseItemSnapshot.docs.map(toPlainDoc);
const movements = movementSnapshot.docs.map(toPlainDoc);
const inventoryMovements = inventoryMovementSnapshot.docs.map(toPlainDoc);

const purchaseMap = new Map(purchases.map((purchase) => [purchase.id, purchase]));
const purchaseItemMap = new Map(purchaseItems.map((item) => [item.id, item]));
const movementMap = new Map(movements.map((movement) => [movement.id, movement]));
const inventoryMovementMap = new Map(inventoryMovements.map((movement) => [movement.id, movement]));

const purchaseLinkedMovements = movements.filter((movement) => movement.purchaseId);
const purchaseLinkedInventoryMovements = inventoryMovements.filter((movement) => movement.purchaseId);

const purchasesMissingMirror = purchases
  .filter((purchase) => !purchaseItemMap.has(purchase.id))
  .map((purchase) => ({
    id: purchase.id,
    productId: purchase.productId,
    purchaseBatchId: purchase.purchaseBatchId ?? null,
    quantityPurchased: toNumber(purchase.quantityPurchased),
  }));

const extraPurchaseItems = purchaseItems
  .filter((item) => !purchaseMap.has(item.id))
  .map((item) => ({
    id: item.id,
    productId: item.productId,
    purchaseBatchId: item.purchaseBatchId ?? item.purchaseId ?? null,
    quantityPurchased: toNumber(item.quantityPurchased),
  }));

const purchasesMissingMovement = purchases
  .filter((purchase) => !purchaseLinkedMovements.some((movement) => movement.purchaseId === purchase.id))
  .map((purchase) => ({
    id: purchase.id,
    source: purchase.source ?? null,
    productId: purchase.productId,
    purchaseBatchId: purchase.purchaseBatchId ?? null,
    quantityPurchased: toNumber(purchase.quantityPurchased),
  }));

const purchaseMovementsMissingInventoryMirror = purchaseLinkedMovements
  .filter((movement) => !inventoryMovementMap.has(movement.id))
  .map((movement) => ({
    id: movement.id,
    purchaseId: movement.purchaseId ?? null,
    productId: movement.productId,
    quantity: toNumber(movement.quantity),
  }));

const extraPurchaseInventoryMirrors = purchaseLinkedInventoryMovements
  .filter((movement) => !movementMap.has(movement.id))
  .map((movement) => ({
    id: movement.id,
    purchaseId: movement.purchaseId ?? null,
    productId: movement.productId,
    quantity: toNumber(movement.quantity),
  }));

const purchaseUnits = purchases.reduce((sum, purchase) => sum + toNumber(purchase.quantityPurchased), 0);
const movementUnits = purchaseLinkedMovements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
const mirrorUnits = purchaseLinkedInventoryMovements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0);

if (SHOULD_EXECUTE && (purchasesMissingMirror.length > 0 || extraPurchaseItems.length > 0)) {
  const batch = db.batch();
  purchasesMissingMirror.forEach((item) => {
    const purchase = purchaseMap.get(item.id);
    if (!purchase) return;
    batch.set(db.collection('purchase_items').doc(item.id), {
      ...purchase,
      purchaseId: purchase.purchaseBatchId ?? purchase.purchaseId ?? purchase.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  extraPurchaseItems.forEach((item) => {
    batch.delete(db.collection('purchase_items').doc(item.id));
  });
  await batch.commit();
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      execute: SHOULD_EXECUTE,
      totals: {
        purchases: purchases.length,
        purchaseItems: purchaseItems.length,
        purchaseLinkedMovements: purchaseLinkedMovements.length,
        purchaseLinkedInventoryMovements: purchaseLinkedInventoryMovements.length,
        purchaseUnits,
        movementUnits,
        mirrorUnits,
        purchasesMissingMirror: purchasesMissingMirror.length,
        extraPurchaseItems: extraPurchaseItems.length,
        purchasesMissingMovement: purchasesMissingMovement.length,
        purchaseMovementsMissingInventoryMirror: purchaseMovementsMissingInventoryMirror.length,
        extraPurchaseInventoryMirrors: extraPurchaseInventoryMirrors.length,
      },
      purchasesMissingMirror,
      extraPurchaseItems,
      purchasesMissingMovement,
      purchaseMovementsMissingInventoryMirror,
      extraPurchaseInventoryMirrors,
    },
    null,
    2
  )
);
