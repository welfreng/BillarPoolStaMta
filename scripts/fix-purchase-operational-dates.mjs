import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const LOG_DIR = path.join(PROJECT_ROOT, 'cleanup-logs');
const DRY_RUN = !process.argv.includes('--execute');
const UTC_MIDNIGHT_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?Z$/;

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

function getAdminDb() {
  if (getApps().length > 0) {
    return getFirestore(getApps()[0]);
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Faltan variables FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL o FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return getFirestore(app);
}

function toOperationalIsoFromLegacyUtcMidnight(value) {
  const match = String(value).match(UTC_MIDNIGHT_ISO_PATTERN);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0)).toISOString();
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function createLogFilePath(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(LOG_DIR, `${prefix}-${stamp}.json`);
}

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function main() {
  loadEnvFile(ENV_FILE);
  ensureLogDir();
  const db = getAdminDb();

  const [purchasesSnapshot, purchaseItemsSnapshot, movementsSnapshot, inventoryMovementsSnapshot] = await Promise.all([
    db.collection('purchases').get(),
    db.collection('purchase_items').get(),
    db.collection('movements').get(),
    db.collection('inventory_movements').get(),
  ]);

  const impactedPurchases = [];
  const purchaseIds = new Set();
  const purchaseBatchIds = new Set();

  purchasesSnapshot.forEach((doc) => {
    const data = doc.data();
    const currentPurchasedAt =
      data.purchasedAt instanceof Timestamp ? data.purchasedAt.toDate().toISOString() : String(data.purchasedAt ?? '');
    const nextPurchasedAt = toOperationalIsoFromLegacyUtcMidnight(currentPurchasedAt);
    if (!nextPurchasedAt) return;

    const record = {
      id: doc.id,
      purchaseId: String(data.purchaseId ?? ''),
      purchaseBatchId: String(data.purchaseBatchId ?? ''),
      currentPurchasedAt,
      nextPurchasedAt,
    };
    impactedPurchases.push(record);
    purchaseIds.add(doc.id);
    if (record.purchaseId) purchaseIds.add(record.purchaseId);
    if (record.purchaseBatchId) purchaseBatchIds.add(record.purchaseBatchId);
  });

  const impactedPurchaseItems = [];
  purchaseItemsSnapshot.forEach((doc) => {
    const data = doc.data();
    const purchaseId = String(data.purchaseId ?? '');
    if (!purchaseIds.has(doc.id) && !purchaseIds.has(purchaseId)) return;
    const currentPurchasedAt =
      data.purchasedAt instanceof Timestamp ? data.purchasedAt.toDate().toISOString() : String(data.purchasedAt ?? '');
    const nextPurchasedAt = toOperationalIsoFromLegacyUtcMidnight(currentPurchasedAt);
    if (!nextPurchasedAt) return;

    impactedPurchaseItems.push({
      id: doc.id,
      purchaseId,
      currentPurchasedAt,
      nextPurchasedAt,
    });
  });

  const impactedMovements = [];
  movementsSnapshot.forEach((doc) => {
    const data = doc.data();
    const purchaseId = String(data.purchaseId ?? '');
    const purchaseBatchId = String(data.purchaseBatchId ?? '');
    if (!purchaseIds.has(purchaseId) && !purchaseBatchIds.has(purchaseBatchId)) return;
    const currentOccurredAt =
      data.occurredAt instanceof Timestamp ? data.occurredAt.toDate().toISOString() : String(data.occurredAt ?? '');
    const nextOccurredAt = toOperationalIsoFromLegacyUtcMidnight(currentOccurredAt);
    if (!nextOccurredAt) return;

    impactedMovements.push({
      id: doc.id,
      purchaseId,
      purchaseBatchId,
      currentOccurredAt,
      nextOccurredAt,
    });
  });

  const impactedInventoryMovements = [];
  inventoryMovementsSnapshot.forEach((doc) => {
    const data = doc.data();
    const purchaseId = String(data.purchaseId ?? '');
    const purchaseBatchId = String(data.purchaseBatchId ?? '');
    if (!purchaseIds.has(purchaseId) && !purchaseBatchIds.has(purchaseBatchId)) return;
    const currentOccurredAt =
      data.occurredAt instanceof Timestamp ? data.occurredAt.toDate().toISOString() : String(data.occurredAt ?? '');
    const nextOccurredAt = toOperationalIsoFromLegacyUtcMidnight(currentOccurredAt);
    if (!nextOccurredAt) return;

    impactedInventoryMovements.push({
      id: doc.id,
      purchaseId,
      purchaseBatchId,
      currentOccurredAt,
      nextOccurredAt,
    });
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'execute',
    counts: {
      purchases: impactedPurchases.length,
      purchaseItems: impactedPurchaseItems.length,
      movements: impactedMovements.length,
      inventoryMovements: impactedInventoryMovements.length,
    },
    impactedPurchases,
    impactedPurchaseItems,
    impactedMovements,
    impactedInventoryMovements,
  };

  const reportPath = createLogFilePath(DRY_RUN ? 'purchase-date-fix-dry-run' : 'purchase-date-fix-executed');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (DRY_RUN) {
    console.log(JSON.stringify({ ok: true, dryRun: true, reportPath, counts: report.counts }, null, 2));
    return;
  }

  const operations = [
    ...impactedPurchases.map((item) => ({
      collection: 'purchases',
      id: item.id,
      field: 'purchasedAt',
      value: Timestamp.fromDate(new Date(item.nextPurchasedAt)),
    })),
    ...impactedPurchaseItems.map((item) => ({
      collection: 'purchase_items',
      id: item.id,
      field: 'purchasedAt',
      value: Timestamp.fromDate(new Date(item.nextPurchasedAt)),
    })),
    ...impactedMovements.map((item) => ({
      collection: 'movements',
      id: item.id,
      field: 'occurredAt',
      value: Timestamp.fromDate(new Date(item.nextOccurredAt)),
    })),
    ...impactedInventoryMovements.map((item) => ({
      collection: 'inventory_movements',
      id: item.id,
      field: 'occurredAt',
      value: Timestamp.fromDate(new Date(item.nextOccurredAt)),
    })),
  ];

  for (const group of chunk(operations, 400)) {
    const batch = db.batch();
    for (const operation of group) {
      batch.update(db.collection(operation.collection).doc(operation.id), {
        [operation.field]: operation.value,
      });
    }
    await batch.commit();
  }

  console.log(JSON.stringify({ ok: true, dryRun: false, reportPath, counts: report.counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
