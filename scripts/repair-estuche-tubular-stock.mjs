import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const PRODUCT_ID = 'HuQduq7pEIjFMV9tNKzb';
const PRODUCT_NAME = 'Estuche Tubular';
const ADJUSTMENT_QUANTITY = -9;
const EXPECTED_NEXT_STOCK = 12;
const REPAIR_NOTE = 'Correccion por conteo fisico. Se revierte ajuste manual +9 del 10/07/2026.';

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

async function main() {
  loadEnvFile(ENV_FILE);

  const db = getFirestore(getAdminApp());
  const [productSnap, movementsSnap] = await Promise.all([
    db.collection('products').doc(PRODUCT_ID).get(),
    db.collection('movements').where('productId', '==', PRODUCT_ID).get(),
  ]);

  if (!productSnap.exists) {
    throw new Error(`No se encontro ${PRODUCT_NAME}.`);
  }

  const movements = movementsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const duplicateRepair = movements.find(
    (movement) =>
      toNumber(movement.quantity) === ADJUSTMENT_QUANTITY &&
      String(movement.reason ?? '') === 'manual-adjustment' &&
      String(movement.notes ?? '') === REPAIR_NOTE
  );

  const movementStock = movements.reduce((total, movement) => total + toNumber(movement.quantity), 0);
  if (duplicateRepair) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'repair_already_exists',
          productId: PRODUCT_ID,
          productName: PRODUCT_NAME,
          currentMovementStock: movementStock,
          existingRepairMovementId: duplicateRepair.id,
        },
        null,
        2
      )
    );
    return;
  }

  const nextStock = movementStock + ADJUSTMENT_QUANTITY;
  if (Math.abs(nextStock - EXPECTED_NEXT_STOCK) > 0.000001) {
    throw new Error(
      `El ajuste no deja el stock esperado. Stock actual por movimientos: ${movementStock}. ` +
        `Con ajuste ${ADJUSTMENT_QUANTITY} quedaria ${nextStock}, no ${EXPECTED_NEXT_STOCK}.`
    );
  }

  const latestCostMovement = movements
    .filter((movement) => toNumber(movement.relatedUnitCost) > 0)
    .sort((left, right) => {
      const leftDate = typeof left.occurredAt?.toDate === 'function' ? left.occurredAt.toDate().getTime() : 0;
      const rightDate = typeof right.occurredAt?.toDate === 'function' ? right.occurredAt.toDate().getTime() : 0;
      return rightDate - leftDate;
    })[0];
  const relatedUnitCost = toNumber(latestCostMovement?.relatedUnitCost);
  const occurredAt = Timestamp.fromDate(new Date());
  const movementRef = db.collection('movements').doc();
  const movementPayload = {
    id: movementRef.id,
    productId: PRODUCT_ID,
    variantId: null,
    variantName: null,
    type: 'adjustment',
    reason: 'manual-adjustment',
    quantity: ADJUSTMENT_QUANTITY,
    notes: REPAIR_NOTE,
    occurredAt,
    responsibleUser: 'Administrador',
    relatedUnitCost,
  };

  const batch = db.batch();
  batch.set(movementRef, movementPayload);
  batch.set(db.collection('inventory_movements').doc(movementRef.id), {
    ...movementPayload,
    sourceType: 'manual-adjustment',
    sourceId: movementRef.id,
  });
  batch.set(
    db.collection('products').doc(PRODUCT_ID),
    {
      publicStock: EXPECTED_NEXT_STOCK,
      stock: EXPECTED_NEXT_STOCK,
      stockOnHand: EXPECTED_NEXT_STOCK,
      status: 'active',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  console.log(
    JSON.stringify(
      {
        repaired: true,
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
        previousMovementStock: movementStock,
        adjustmentQuantity: ADJUSTMENT_QUANTITY,
        nextStock,
        movementId: movementRef.id,
        note: REPAIR_NOTE,
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
