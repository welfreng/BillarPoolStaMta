import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const envFile = path.join(projectRoot, '.env.local');

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(envFile);

if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin SDK no esta configurado. Define FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL y FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const db = getFirestore();

const targets = [
  { id: 'NoPE1kzLcsSETMhOfobr', name: 'Tiza Predator', stock: 7 },
  { id: 'zbzZvxIs4SKjL8voXxRh', name: 'Fichero Plastico de 50', stock: 2 },
  {
    id: 'tKBZEHvgkCULZBfInRWw',
    name: 'Estuche Media Boca',
    stock: 1,
    variants: {
      'tKBZEHvgkCULZBfInRWw-rojo': 1,
      'tKBZEHvgkCULZBfInRWw-negro': 0,
      'tKBZEHvgkCULZBfInRWw-azul-cielo': 0,
      'tKBZEHvgkCULZBfInRWw-cafe': 0,
      'tKBZEHvgkCULZBfInRWw-azul-oscuro': 0,
      'tKBZEHvgkCULZBfInRWw-verde': 0,
    },
  },
  { id: 'x1UiyPJHNFuxY8xN3Ihj', name: 'Estuche Tula Sencillo', stock: 10 },
  { id: 'MF1Fr7KArLt4CUecQptw', name: 'Taco de Billar Ray Tricolor', stock: 25 },
  { id: 'B2b0In0VP7kP3jbD3yWC', name: 'Taco de Billar Sencillo 5707', stock: 2 },
  { id: 'zUZhBpjyesJLK4CZI3zo', name: 'Taco de Billar Sibote Flecha delgada', stock: 8 },
  { id: 'OYj4ZTE5IK3JiNF3Xe36', name: 'Taco Preoaidr Sencillo RR', stock: 3 },
  { id: 'jNPU3dKPdeQJtAdGezd4', name: 'Triangulo Nacional', stock: 2 },
  { id: 'pI3OiNlygPE2UkAdOB8I', name: 'Virola Transparente', stock: 33 },
  { id: 'csHryr5HoqX5Uw8YeZgM', name: 'Taco de Billar Ray Ra01', stock: 3 },
  { id: 'clA44uFiHsGOnAo5mNf7', name: 'Taco de Billar Ray Naylon Ra02', stock: 3 },
  { id: 'SsHj9yzXJKLKhrgn2ozc', name: 'Casquillo Americano Meilin', stock: 5 },
];

function buildStockMaps(snapshot) {
  const productStock = new Map();
  const variantStock = new Map();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const productId = data.productId;
    if (!productId) return;

    const quantity = Number(data.quantity ?? 0);
    productStock.set(productId, (productStock.get(productId) ?? 0) + quantity);

    const variantId = data.variantId;
    if (variantId) {
      variantStock.set(variantId, (variantStock.get(variantId) ?? 0) + quantity);
    }
  });

  return { productStock, variantStock };
}

const [movementsSnap, inventoryMovementsSnap] = await Promise.all([
  db.collection('movements').get(),
  db.collection('inventory_movements').get(),
]);
const primaryStock = buildStockMaps(movementsSnap);
const mirrorStock = buildStockMaps(inventoryMovementsSnap);

const results = [];

for (const target of targets) {
  const productSnap = await db.collection('products').doc(target.id).get();
  const product = productSnap.data();

  const result = {
    product: target.name,
    target: target.stock,
    publicStock: Number(product?.publicStock ?? 0),
    movementStock: primaryStock.productStock.get(target.id) ?? 0,
    mirrorStock: mirrorStock.productStock.get(target.id) ?? 0,
    ok: false,
  };

  if (target.variants) {
    result.variants = [];
    for (const [variantId, variantTarget] of Object.entries(target.variants)) {
      const variantSnap = await db.collection('product_variants').doc(variantId).get();
      const variantData = variantSnap.data();
      const productVariant = product?.variants?.find((variant) => variant.id === variantId);
      const publicStock = Number(variantData?.publicStock ?? productVariant?.publicStock ?? 0);
      const movementStock = primaryStock.variantStock.get(variantId) ?? 0;
      const inventoryMirrorStock = mirrorStock.variantStock.get(variantId) ?? 0;
      result.variants.push({
        variantId,
        target: variantTarget,
        publicStock,
        movementStock,
        mirrorStock: inventoryMirrorStock,
        ok: publicStock === variantTarget && movementStock === variantTarget && inventoryMirrorStock === variantTarget,
      });
    }
    result.ok =
      result.publicStock === target.stock &&
      result.movementStock === target.stock &&
      result.mirrorStock === target.stock &&
      result.variants.every((variant) => variant.ok);
  } else {
    result.ok =
      result.publicStock === target.stock &&
      result.movementStock === target.stock &&
      result.mirrorStock === target.stock;
  }

  results.push(result);
}

console.log(JSON.stringify(results, null, 2));
