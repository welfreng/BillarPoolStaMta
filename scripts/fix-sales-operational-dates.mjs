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

  const [salesSnapshot, movementsSnapshot, inventoryMovementsSnapshot, servicesSnapshot] = await Promise.all([
    db.collection('sales').get(),
    db.collection('movements').get(),
    db.collection('inventory_movements').get(),
    db.collection('services').get(),
  ]);

  const impactedSales = [];
  const salesById = new Map();
  salesSnapshot.forEach((doc) => {
    const data = doc.data();
    const currentSoldAt = data.soldAt instanceof Timestamp ? data.soldAt.toDate().toISOString() : String(data.soldAt ?? '');
    const nextSoldAt = toOperationalIsoFromLegacyUtcMidnight(currentSoldAt);
    if (!nextSoldAt) return;

    const saleRecord = {
      id: doc.id,
      saleBatchId: String(data.saleBatchId ?? doc.id),
      currentSoldAt,
      nextSoldAt,
    };
    impactedSales.push(saleRecord);
    salesById.set(doc.id, saleRecord);
  });

  const impactedSaleIds = new Set(impactedSales.map((item) => item.id));
  const impactedSaleBatchIds = new Set(impactedSales.map((item) => item.saleBatchId));

  const impactedMovements = [];
  movementsSnapshot.forEach((doc) => {
    const data = doc.data();
    const saleId = String(data.saleId ?? '');
    if (!impactedSaleIds.has(saleId)) return;
    const currentOccurredAt =
      data.occurredAt instanceof Timestamp ? data.occurredAt.toDate().toISOString() : String(data.occurredAt ?? '');
    const nextOccurredAt = toOperationalIsoFromLegacyUtcMidnight(currentOccurredAt);
    if (!nextOccurredAt) return;

    impactedMovements.push({
      id: doc.id,
      saleId,
      currentOccurredAt,
      nextOccurredAt,
    });
  });

  const impactedInventoryMovements = [];
  inventoryMovementsSnapshot.forEach((doc) => {
    const data = doc.data();
    const saleId = String(data.saleId ?? '');
    if (!impactedSaleIds.has(saleId)) return;
    const currentOccurredAt =
      data.occurredAt instanceof Timestamp ? data.occurredAt.toDate().toISOString() : String(data.occurredAt ?? '');
    const nextOccurredAt = toOperationalIsoFromLegacyUtcMidnight(currentOccurredAt);
    if (!nextOccurredAt) return;

    impactedInventoryMovements.push({
      id: doc.id,
      saleId,
      currentOccurredAt,
      nextOccurredAt,
    });
  });

  const impactedServices = [];
  servicesSnapshot.forEach((doc) => {
    const data = doc.data();
    const saleId = String(data.saleId ?? '');
    const saleBatchId = String(data.saleBatchId ?? '');
    if (!impactedSaleIds.has(saleId) && !impactedSaleBatchIds.has(saleBatchId)) return;
    const currentPerformedAt =
      data.performedAt instanceof Timestamp ? data.performedAt.toDate().toISOString() : String(data.performedAt ?? '');
    const nextPerformedAt = toOperationalIsoFromLegacyUtcMidnight(currentPerformedAt);
    if (!nextPerformedAt) return;

    impactedServices.push({
      id: doc.id,
      saleId,
      saleBatchId,
      currentPerformedAt,
      nextPerformedAt,
    });
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'execute',
    counts: {
      sales: impactedSales.length,
      movements: impactedMovements.length,
      inventoryMovements: impactedInventoryMovements.length,
      services: impactedServices.length,
    },
    impactedSales,
    impactedMovements,
    impactedInventoryMovements,
    impactedServices,
  };

  const reportPath = createLogFilePath(DRY_RUN ? 'sales-date-fix-dry-run' : 'sales-date-fix-executed');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (DRY_RUN) {
    console.log(JSON.stringify({ ok: true, dryRun: true, reportPath, counts: report.counts }, null, 2));
    return;
  }

  const operations = [
    ...impactedSales.map((item) => ({
      collection: 'sales',
      id: item.id,
      field: 'soldAt',
      value: Timestamp.fromDate(new Date(item.nextSoldAt)),
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
    ...impactedServices.map((item) => ({
      collection: 'services',
      id: item.id,
      field: 'performedAt',
      value: Timestamp.fromDate(new Date(item.nextPerformedAt)),
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
