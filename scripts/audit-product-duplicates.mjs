import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function signature(product) {
  return normalize([product.name, product.brand].filter(Boolean).join(' '));
}

function tokenSet(value) {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function overlapScore(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const shared = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

async function main() {
  loadEnvFile(ENV_FILE);
  const term = normalize(process.argv.slice(2).join(' '));
  const db = getFirestore(getAdminApp());
  const productsSnap = await db.collection('products').get();
  const products = productsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const exactGroups = new Map();
  products.forEach((product) => {
    const key = signature(product);
    if (!key) return;
    const group = exactGroups.get(key) ?? [];
    group.push(product);
    exactGroups.set(key, group);
  });

  const exactDuplicates = Array.from(exactGroups.values())
    .filter((group) => group.length > 1)
    .map((group) =>
      group.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        status: product.status ?? 'active',
        publicStock: product.publicStock ?? 0,
      }))
    );

  const termMatches = term
    ? products
        .map((product) => ({
          id: product.id,
          name: product.name,
          brand: product.brand,
          status: product.status ?? 'active',
          publicStock: product.publicStock ?? 0,
          score: Math.max(overlapScore(term, product.name), overlapScore(term, `${product.name} ${product.brand}`)),
        }))
        .filter((product) => product.score >= 0.45 || normalize(`${product.name} ${product.brand}`).includes(term))
        .sort((left, right) => right.score - left.score || String(left.name).localeCompare(String(right.name)))
    : [];

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
        filterTerm: term || null,
        totals: {
          products: products.length,
          exactDuplicateGroups: exactDuplicates.length,
          termMatches: termMatches.length,
        },
        exactDuplicates,
        termMatches,
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
