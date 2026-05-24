import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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

function sourceTypeForMovement(movement) {
  if (movement.purchaseBatchId || movement.reason === 'purchase' || movement.type === 'purchase') return 'purchase';
  if (movement.reason === 'initial-load') return 'initial-load';
  if (movement.saleId && movement.reason === 'gift') return 'sale-gift';
  if (movement.saleId && movement.reason === 'return') return 'sale-return';
  if (movement.saleId) return 'sale';
  if (movement.serviceOrderId) return 'service';
  return 'manual-adjustment';
}

function sourceIdForMovement(movement) {
  return (
    movement.purchaseBatchId ??
    movement.purchaseId ??
    movement.saleId ??
    movement.serviceOrderId ??
    movement.id
  );
}

function serializeMirror(movement) {
  return {
    ...movement,
    variantId: movement.variantId ?? null,
    variantName: movement.variantName ?? null,
    purchaseId: movement.purchaseId ?? null,
    purchaseBatchId: movement.purchaseBatchId ?? null,
    saleId: movement.saleId ?? null,
    serviceOrderId: movement.serviceOrderId ?? null,
    sourceType: sourceTypeForMovement(movement),
    sourceId: sourceIdForMovement(movement),
    syncedAt: FieldValue.serverTimestamp(),
  };
}

async function main() {
  loadEnvFile(ENV_FILE);
  const execute = process.argv.includes('--execute');
  const db = getFirestore(getAdminApp());

  const [movementsSnap, mirrorsSnap] = await Promise.all([
    db.collection('movements').get(),
    db.collection('inventory_movements').get(),
  ]);

  const movements = new Map(movementsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
  const mirrors = new Map(mirrorsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));

  const missingMirrors = Array.from(movements.values()).filter((movement) => !mirrors.has(movement.id));
  const extraMirrors = Array.from(mirrors.values()).filter((movement) => !movements.has(movement.id));

  if (execute && (missingMirrors.length > 0 || extraMirrors.length > 0)) {
    let batch = db.batch();
    let operationCount = 0;

    const commitIfNeeded = async (force = false) => {
      if (operationCount === 0) return;
      if (!force && operationCount < 450) return;
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    };

    for (const movement of missingMirrors) {
      batch.set(db.collection('inventory_movements').doc(movement.id), serializeMirror(movement), { merge: true });
      operationCount += 1;
      await commitIfNeeded();
    }

    for (const movement of extraMirrors) {
      batch.delete(db.collection('inventory_movements').doc(movement.id));
      operationCount += 1;
      await commitIfNeeded();
    }

    await commitIfNeeded(true);
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
        execute,
        totals: {
          movements: movements.size,
          inventoryMovements: mirrors.size,
          missingMirrors: missingMirrors.length,
          extraMirrors: extraMirrors.length,
        },
        missingMirrors: missingMirrors.slice(0, 100).map((movement) => ({
          id: movement.id,
          productId: movement.productId ?? null,
          reason: movement.reason ?? null,
          quantity: movement.quantity ?? 0,
        })),
        extraMirrors: extraMirrors.slice(0, 100).map((movement) => ({
          id: movement.id,
          productId: movement.productId ?? null,
          reason: movement.reason ?? null,
          quantity: movement.quantity ?? 0,
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
