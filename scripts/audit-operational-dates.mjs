import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const LOG_DIR = path.join(PROJECT_ROOT, 'cleanup-logs');
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

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function createLogFilePath(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(LOG_DIR, `${prefix}-${stamp}.json`);
}

function normalizeTimestampValue(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return String(value ?? '');
}

function auditCollection(snapshot, fieldName, extraFields = []) {
  const impacted = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const fieldValue = normalizeTimestampValue(data[fieldName]);
    if (!UTC_MIDNIGHT_ISO_PATTERN.test(fieldValue)) return;
    impacted.push({
      id: doc.id,
      [fieldName]: fieldValue,
      ...Object.fromEntries(extraFields.map((field) => [field, data[field] ?? null])),
    });
  });
  return impacted;
}

async function main() {
  loadEnvFile(ENV_FILE);
  ensureLogDir();
  const db = getAdminDb();

  const [sales, purchases, services, movements, inventoryMovements] = await Promise.all([
    db.collection('sales').get(),
    db.collection('purchases').get(),
    db.collection('services').get(),
    db.collection('movements').get(),
    db.collection('inventory_movements').get(),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      sales: 0,
      purchases: 0,
      services: 0,
      movements: 0,
      inventoryMovements: 0,
    },
    impactedSales: auditCollection(sales, 'soldAt', ['saleBatchId', 'productId']),
    impactedPurchases: auditCollection(purchases, 'purchasedAt', ['purchaseBatchId', 'productId']),
    impactedServices: auditCollection(services, 'performedAt', ['saleBatchId', 'saleId']),
    impactedMovements: auditCollection(movements, 'occurredAt', ['saleId', 'purchaseId', 'reason']),
    impactedInventoryMovements: auditCollection(inventoryMovements, 'occurredAt', ['saleId', 'purchaseId', 'reason']),
  };

  report.counts.sales = report.impactedSales.length;
  report.counts.purchases = report.impactedPurchases.length;
  report.counts.services = report.impactedServices.length;
  report.counts.movements = report.impactedMovements.length;
  report.counts.inventoryMovements = report.impactedInventoryMovements.length;

  const reportPath = createLogFilePath('operational-date-audit');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, reportPath, counts: report.counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
