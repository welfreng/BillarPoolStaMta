import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const REPAIR_TAG = 'Correccion por conteo fisico 2026-07-13. Ajuste solicitado por inventario fisico.';

const TARGETS = [
  { productId: 'NoPE1kzLcsSETMhOfobr', name: 'Tiza Predator', targetStock: 7 },
  { productId: 'zbzZvxIs4SKjL8voXxRh', name: 'Fichero Plastico de 50', targetStock: 2 },
  {
    productId: 'tKBZEHvgkCULZBfInRWw',
    name: 'Estuche Media Boca',
    targetStock: 1,
    variantTargets: [{ variantId: 'tKBZEHvgkCULZBfInRWw-azul-cielo', variantName: 'Azul Cielo', targetStock: 0 }],
  },
  { productId: 'x1UiyPJHNFuxY8xN3Ihj', name: 'Estuche Tula Sencillo', targetStock: 10 },
  { productId: 'MF1Fr7KArLt4CUecQptw', name: 'Taco de Billar Ray Tricolor', targetStock: 25 },
  { productId: 'B2b0In0VP7kP3jbD3yWC', name: 'Taco de Billar Sencillo 5707', targetStock: 2 },
  { productId: 'zUZhBpjyesJLK4CZI3zo', name: 'Taco de Billar Sibote Flecha delgada', targetStock: 8 },
  { productId: 'OYj4ZTE5IK3JiNF3Xe36', name: 'Taco Preoaidr Sencillo RR', targetStock: 3 },
  { productId: 'jNPU3dKPdeQJtAdGezd4', name: 'Triangulo Nacional', targetStock: 2 },
  { productId: 'pI3OiNlygPE2UkAdOB8I', name: 'Virola Transparente', targetStock: 33 },
  { productId: 'csHryr5HoqX5Uw8YeZgM', name: 'Taco de Billar Ray Ra01', targetStock: 3 },
  { productId: 'clA44uFiHsGOnAo5mNf7', name: 'Taco de Billar Ray Naylon Ra02', targetStock: 3 },
  { productId: 'SsHj9yzXJKLKhrgn2ozc', name: 'Casquillo Americano Meilin', targetStock: 5 },
];

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

function getSimpleMovementStock(movements, productId) {
  return movements
    .filter((movement) => String(movement.productId ?? '') === productId)
    .reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
}

function buildMovementPayload(ref, target, quantity, occurredAt, relatedUnitCost, variant) {
  const notes = `${REPAIR_TAG} ${target.name}: ajuste ${quantity > 0 ? '+' : ''}${quantity}.`;
  return {
    id: ref.id,
    productId: target.productId,
    variantId: variant?.variantId ?? null,
    variantName: variant?.variantName ?? null,
    type: 'adjustment',
    reason: 'manual-adjustment',
    quantity,
    notes,
    occurredAt,
    responsibleUser: 'Administrador',
    relatedUnitCost,
  };
}

function getLatestUnitCost(movements, productId, variantId) {
  const candidates = movements
    .filter((movement) => {
      if (String(movement.productId ?? '') !== productId) return false;
      if (variantId && String(movement.variantId ?? '') !== variantId) return false;
      return toNumber(movement.relatedUnitCost) > 0;
    })
    .sort((left, right) => {
      const leftDate = typeof left.occurredAt?.toDate === 'function' ? left.occurredAt.toDate().getTime() : 0;
      const rightDate = typeof right.occurredAt?.toDate === 'function' ? right.occurredAt.toDate().getTime() : 0;
      return rightDate - leftDate;
    });
  return toNumber(candidates[0]?.relatedUnitCost);
}

async function main() {
  loadEnvFile(ENV_FILE);
  const db = getFirestore(getAdminApp());
  const productIds = TARGETS.map((target) => target.productId);
  const productDocs = await Promise.all(productIds.map((productId) => db.collection('products').doc(productId).get()));
  const movementsSnap = await db.collection('movements').get();
  const movements = movementsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  const productsById = new Map(productDocs.filter((docSnap) => docSnap.exists).map((docSnap) => [docSnap.id, { id: docSnap.id, ...docSnap.data() }]));

  const existingRepairMovements = movements.filter((movement) => String(movement.notes ?? '').includes(REPAIR_TAG));
  const batch = db.batch();
  const occurredAt = Timestamp.fromDate(new Date());
  const results = [];
  let writes = 0;

  for (const target of TARGETS) {
    const product = productsById.get(target.productId);
    if (!product) {
      results.push({ productId: target.productId, name: target.name, skipped: true, reason: 'product_not_found' });
      continue;
    }

    if (target.variantTargets?.length) {
      const nextVariants = [...(Array.isArray(product.variants) ? product.variants : [])];
      const variantResults = [];

      for (const variantTarget of target.variantTargets) {
        const variantIndex = nextVariants.findIndex((variant) => variant.id === variantTarget.variantId);
        if (variantIndex < 0) {
          variantResults.push({ ...variantTarget, skipped: true, reason: 'variant_not_found' });
          continue;
        }
        const variant = nextVariants[variantIndex];
        const currentStock = Math.max(toNumber(variant.stock ?? variant.publicStock), 0);
        const delta = variantTarget.targetStock - currentStock;
        const alreadyExists = existingRepairMovements.some(
          (movement) =>
            String(movement.productId ?? '') === target.productId &&
            String(movement.variantId ?? '') === variantTarget.variantId &&
            String(movement.notes ?? '').includes(`${target.name}: ajuste ${delta > 0 ? '+' : ''}${delta}.`)
        );

        if (delta !== 0 && !alreadyExists) {
          const movementRef = db.collection('movements').doc();
          const movementPayload = buildMovementPayload(
            movementRef,
            target,
            delta,
            occurredAt,
            getLatestUnitCost(movements, target.productId, variantTarget.variantId),
            variantTarget
          );
          batch.set(movementRef, movementPayload);
          batch.set(db.collection('inventory_movements').doc(movementRef.id), {
            ...movementPayload,
            sourceType: 'manual-adjustment',
            sourceId: movementRef.id,
          });
          writes += 2;
        }

        nextVariants[variantIndex] = {
          ...variant,
          stock: variantTarget.targetStock,
          publicStock: variantTarget.targetStock,
        };
        variantResults.push({
          variantId: variantTarget.variantId,
          variantName: variantTarget.variantName,
          previousStock: currentStock,
          targetStock: variantTarget.targetStock,
          delta,
          skipped: delta === 0 || alreadyExists,
          reason: delta === 0 ? 'already_at_target' : alreadyExists ? 'repair_already_exists' : undefined,
        });
      }

      const totalStock = nextVariants.reduce((sum, variant) => sum + Math.max(toNumber(variant.stock), 0), 0);
      batch.set(
        db.collection('products').doc(target.productId),
        {
          variants: nextVariants,
          publicStock: totalStock,
          status: totalStock > 0 ? 'active' : product.status ?? 'active',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      writes += 1;
      nextVariants.forEach((variant) => {
        batch.set(
          db.collection('product_variants').doc(variant.id),
          {
            ...variant,
            productId: target.productId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        writes += 1;
      });
      results.push({
        productId: target.productId,
        name: target.name,
        targetStock: target.targetStock,
        nextStock: totalStock,
        variants: variantResults,
      });
      continue;
    }

    const currentStock = Math.max(getSimpleMovementStock(movements, target.productId), 0);
    const delta = target.targetStock - currentStock;
    const alreadyExists = existingRepairMovements.some(
      (movement) =>
        String(movement.productId ?? '') === target.productId &&
        String(movement.notes ?? '').includes(`${target.name}: ajuste ${delta > 0 ? '+' : ''}${delta}.`)
    );

    if (delta !== 0 && !alreadyExists) {
      const movementRef = db.collection('movements').doc();
      const movementPayload = buildMovementPayload(
        movementRef,
        target,
        delta,
        occurredAt,
        getLatestUnitCost(movements, target.productId)
      );
      batch.set(movementRef, movementPayload);
      batch.set(db.collection('inventory_movements').doc(movementRef.id), {
        ...movementPayload,
        sourceType: 'manual-adjustment',
        sourceId: movementRef.id,
      });
      writes += 2;
    }

    batch.set(
      db.collection('products').doc(target.productId),
      {
        publicStock: target.targetStock,
        stock: target.targetStock,
        stockOnHand: target.targetStock,
        status: target.targetStock > 0 ? 'active' : product.status ?? 'active',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    writes += 1;
    results.push({
      productId: target.productId,
      name: target.name,
      previousStock: currentStock,
      targetStock: target.targetStock,
      delta,
      skipped: delta === 0 || alreadyExists,
      reason: delta === 0 ? 'already_at_target' : alreadyExists ? 'repair_already_exists' : undefined,
    });
  }

  if (writes > 0) {
    await batch.commit();
  }

  console.log(
    JSON.stringify(
      {
        repairedAt: new Date().toISOString(),
        repairTag: REPAIR_TAG,
        writes,
        results,
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
