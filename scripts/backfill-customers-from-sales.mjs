import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const ANONYMOUS_CUSTOMER_NAME = 'Cliente NN';

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

function asDate(value) {
  if (!value) return new Date(0);
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeCustomerName(value) {
  const trimmedValue = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmedValue) return ANONYMOUS_CUSTOMER_NAME;
  if (trimmedValue.toLowerCase() === 'cliente mostrador') return ANONYMOUS_CUSTOMER_NAME;
  return trimmedValue;
}

function isAnonymousCustomerName(value) {
  return normalizeCustomerName(value).toLowerCase() === ANONYMOUS_CUSTOMER_NAME.toLowerCase();
}

function buildCustomerId(name, phone, documentNumber) {
  const normalizedDocument = String(documentNumber ?? '').replace(/\D/g, '');
  const normalizedPhone = String(phone ?? '').replace(/\D/g, '');
  const normalizedName = normalizeSearchText(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalizedDocument) return `doc-${normalizedDocument}`;
  return normalizedPhone ? `phone-${normalizedPhone}` : `name-${normalizedName || 'cliente'}`;
}

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

loadEnvFile(ENV_FILE);
const app = getAdminApp();
const db = getFirestore(app);

const salesSnapshot = await db.collection('sales').get();
const customersById = new Map();

salesSnapshot.docs.forEach((document) => {
  const sale = document.data();
  const fullName = normalizeCustomerName(sale.customerName);
  if (isAnonymousCustomerName(fullName)) return;

  const phone = String(sale.customerPhone ?? '').trim();
  const documentNumber = String(sale.customerDocument ?? '').trim();
  const customerId = buildCustomerId(fullName, phone, documentNumber);
  const saleDate = asDate(sale.soldAt);
  const existing = customersById.get(customerId);
  const totalSale = toNumber(sale.totalSale) - toNumber(sale.returnedSaleAmount);

  if (!existing) {
    customersById.set(customerId, {
      id: customerId,
      fullName,
      normalizedName: normalizeSearchText(fullName),
      phone,
      documentNumber,
      lastSaleAt: saleDate,
      lastSaleBatchId: String(sale.saleBatchId ?? document.id),
      saleCount: 1,
      totalRevenue: totalSale,
    });
    return;
  }

  existing.saleCount += 1;
  existing.totalRevenue += totalSale;
  if (saleDate.getTime() > existing.lastSaleAt.getTime()) {
    existing.lastSaleAt = saleDate;
    existing.lastSaleBatchId = String(sale.saleBatchId ?? document.id);
  }
  if (!existing.phone && phone) existing.phone = phone;
  if (!existing.documentNumber && documentNumber) existing.documentNumber = documentNumber;
});

const batch = db.batch();
customersById.forEach((customer) => {
  batch.set(
    db.collection('customers').doc(customer.id),
    {
      id: customer.id,
      fullName: customer.fullName,
      normalizedName: customer.normalizedName,
      phone: customer.phone || null,
      documentNumber: customer.documentNumber || null,
      lastSaleAt: Timestamp.fromDate(customer.lastSaleAt),
      lastSaleBatchId: customer.lastSaleBatchId,
      saleCount: customer.saleCount,
      totalRevenue: Number(customer.totalRevenue.toFixed(2)),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
});

if (customersById.size > 0) {
  await batch.commit();
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      salesRead: salesSnapshot.size,
      customersUpserted: customersById.size,
    },
    null,
    2
  )
);
