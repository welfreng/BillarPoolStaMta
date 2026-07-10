import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const SHOULD_EXECUTE = process.argv.includes('--execute');

const PRODUCT_ID = '2yuDG5E7ETmvFZtZZwzz';
const VARIANT_ID = '2yuDG5E7ETmvFZtZZwzz-perillas';
const SALE_ID = '4eab78VnpJkmQeK41mXY';

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

function getAdminApp() {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin SDK no esta configurado en .env.local.');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function asIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function serializeDoc(doc) {
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

function buildZeroedSale(sale) {
  const lineItems = Array.isArray(sale.lineItems)
    ? sale.lineItems.map((item) =>
        item.productId === PRODUCT_ID
          ? {
              ...item,
              quantity: 0,
              unitPrice: toNumber(item.unitPrice),
              realUnitCost: toNumber(item.realUnitCost),
              totalSale: 0,
              totalCost: 0,
              profit: 0,
            }
          : item
      )
    : [];

  return {
    quantity: 0,
    returnedQuantity: 0,
    returnedSaleAmount: 0,
    returnedCostAmount: 0,
    unitPrice: toNumber(sale.unitPrice),
    realUnitCost: toNumber(sale.realUnitCost),
    totalSale: 0,
    totalCost: 0,
    profit: 0,
    lineItems,
    notes: `${String(sale.notes ?? '').trim()} | Venta anulada por correccion de inventario Taco Enterizo. Rehacer compra y ventas reales.`.trim(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function main() {
  loadEnvFile(ENV_FILE);

  const db = getFirestore(getAdminApp());
  const [productDoc, productVariantDoc, saleDoc, movementsSnap, inventoryMovementsSnap] = await Promise.all([
    db.collection('products').doc(PRODUCT_ID).get(),
    db.collection('product_variants').doc(VARIANT_ID).get(),
    db.collection('sales').doc(SALE_ID).get(),
    db.collection('movements').where('productId', '==', PRODUCT_ID).get(),
    db.collection('inventory_movements').where('productId', '==', PRODUCT_ID).get(),
  ]);

  const product = serializeDoc(productDoc);
  const productVariant = serializeDoc(productVariantDoc);
  const sale = serializeDoc(saleDoc);
  const movements = movementsSnap.docs.map(serializeDoc).filter(Boolean);
  const inventoryMovements = inventoryMovementsSnap.docs.map(serializeDoc).filter(Boolean);

  if (!product) throw new Error(`No existe el producto ${PRODUCT_ID}.`);
  if (product.name !== 'Taco Enterizo') {
    throw new Error(`El producto esperado era Taco Enterizo, pero se encontro "${product.name}".`);
  }
  if (!sale) throw new Error(`No existe la venta ${SALE_ID}.`);

  const targetMovements = movements.filter((movement) => movement.saleId === SALE_ID);
  const targetInventoryMovements = inventoryMovements.filter((movement) => movement.saleId === SALE_ID);
  const nextVariants = (Array.isArray(product.variants) ? product.variants : []).map((variant) =>
    variant.id === VARIANT_ID
      ? {
          ...variant,
          stock: 0,
          publicStock: 0,
        }
      : variant
  );
  const nextPublicStock = nextVariants.reduce((sum, variant) => sum + Math.max(toNumber(variant.publicStock ?? variant.stock), 0), 0);

  const plan = {
    execute: SHOULD_EXECUTE,
    product: {
      id: product.id,
      name: product.name,
      currentPublicStock: toNumber(product.publicStock ?? product.stock ?? product.stockOnHand),
      nextPublicStock,
      variant: {
        id: VARIANT_ID,
        currentEmbeddedStock: toNumber((product.variants ?? []).find((variant) => variant.id === VARIANT_ID)?.stock),
        currentVariantDocStock: toNumber(productVariant?.stock),
        nextStock: 0,
      },
    },
    sale: {
      id: sale.id,
      saleBatchId: sale.saleBatchId ?? null,
      soldAt: asIso(sale.soldAt),
      currentQuantity: toNumber(sale.quantity),
      currentReturnedQuantity: toNumber(sale.returnedQuantity),
      nextQuantity: 0,
      nextReturnedQuantity: 0,
    },
    deletedMovements: targetMovements.map((movement) => ({
      id: movement.id,
      reason: movement.reason,
      type: movement.type,
      quantity: toNumber(movement.quantity),
      occurredAt: asIso(movement.occurredAt),
    })),
    deletedInventoryMovements: targetInventoryMovements.map((movement) => ({
      id: movement.id,
      reason: movement.reason,
      type: movement.type,
      quantity: toNumber(movement.quantity),
      occurredAt: asIso(movement.occurredAt),
    })),
  };

  if (SHOULD_EXECUTE) {
    const batch = db.batch();

    batch.update(db.collection('products').doc(PRODUCT_ID), {
      variants: nextVariants,
      publicStock: nextPublicStock,
      stock: nextPublicStock,
      stockOnHand: nextPublicStock,
      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(
      db.collection('product_variants').doc(VARIANT_ID),
      {
        id: VARIANT_ID,
        productId: PRODUCT_ID,
        stock: 0,
        publicStock: 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.update(db.collection('sales').doc(SALE_ID), buildZeroedSale(sale));
    targetMovements.forEach((movement) => batch.delete(db.collection('movements').doc(movement.id)));
    targetInventoryMovements.forEach((movement) => batch.delete(db.collection('inventory_movements').doc(movement.id)));

    await batch.commit();
  }

  console.log(JSON.stringify(plan, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
