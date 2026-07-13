import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

function asIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

loadEnvFile(envFile);
const db = getFirestore(getAdminApp());
const limit = Number(process.argv[2] ?? 25);
const salesSnap = await db.collection('sales').get();
const sales = salesSnap.docs
  .map((doc) => ({ id: doc.id, ...doc.data() }))
  .sort((left, right) => new Date(asIso(right.soldAt) ?? 0).getTime() - new Date(asIso(left.soldAt) ?? 0).getTime())
  .slice(0, limit)
  .map((sale) => ({
    id: sale.id,
    saleBatchId: sale.saleBatchId ?? null,
    soldAt: asIso(sale.soldAt),
    customerName: sale.customerName ?? '',
    productId: sale.productId ?? null,
    productName: sale.productName ?? null,
    variantId: sale.variantId ?? null,
    variantName: sale.variantName ?? null,
    quantity: sale.quantity ?? null,
    total: sale.total ?? sale.totalSale ?? sale.totalPrice ?? null,
    lineItems: Array.isArray(sale.lineItems)
      ? sale.lineItems.map((item) => ({
          productId: item.productId ?? null,
          productName: item.productName ?? item.name ?? null,
          variantId: item.variantId ?? null,
          variantName: item.variantName ?? null,
          quantity: item.quantity ?? null,
        }))
      : [],
  }));

console.log(JSON.stringify(sales, null, 2));
