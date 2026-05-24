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

function asIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function addToMap(map, key, value) {
  if (!key) return;
  map.set(key, toNumber(map.get(key)) + toNumber(value));
}

async function main() {
  loadEnvFile(ENV_FILE);
  const term = normalize(process.argv.slice(2).join(' '));

  const db = getFirestore(getAdminApp());
  const [productsSnap, salesSnap, movementsSnap, inventoryMovementsSnap, authorizationRequestsSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('sales').get(),
    db.collection('movements').get(),
    db.collection('inventory_movements').get(),
    db.collection('authorization-requests').get(),
  ]);

  const products = productsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const sales = salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const movements = movementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const inventoryMovements = inventoryMovementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const authorizationRequests = authorizationRequestsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const productsById = new Map(products.map((product) => [product.id, product]));

  const movementStockByProduct = new Map();
  const inventoryMirrorStockByProduct = new Map();
  const purchaseUnitsByProduct = new Map();
  const saleExitUnitsByProduct = new Map();
  const giftExitUnitsByProduct = new Map();
  const saleUnitsByProduct = new Map();
  const saleRevenueByProduct = new Map();
  const saleProfitByProduct = new Map();
  const giftUnitsByProduct = new Map();
  const movementIds = new Set(movements.map((movement) => movement.id));
  const inventoryMovementIds = new Set(inventoryMovements.map((movement) => movement.id));

  movements.forEach((movement) => {
    const productId = String(movement.productId ?? '');
    addToMap(movementStockByProduct, productId, movement.quantity);
    if (movement.reason === 'purchase' || movement.type === 'purchase' || movement.reason === 'initial-load') {
      addToMap(purchaseUnitsByProduct, productId, movement.quantity);
    }
    if (movement.reason === 'sale') {
      addToMap(saleExitUnitsByProduct, productId, Math.abs(toNumber(movement.quantity)));
    }
    if (movement.reason === 'gift') {
      addToMap(giftExitUnitsByProduct, productId, Math.abs(toNumber(movement.quantity)));
    }
  });

  inventoryMovements.forEach((movement) => {
    addToMap(inventoryMirrorStockByProduct, String(movement.productId ?? ''), movement.quantity);
  });

  sales.forEach((sale) => {
    const lineItems = Array.isArray(sale.lineItems)
      ? sale.lineItems
      : [{ productId: sale.productId, quantity: sale.quantity }];
    lineItems.forEach((item) => addToMap(saleUnitsByProduct, String(item.productId ?? ''), item.quantity));
    lineItems.forEach((item) => {
      const productId = String(item.productId ?? '');
      const quantity = toNumber(item.quantity);
      const totalSale = toNumber(item.totalSale ?? quantity * toNumber(item.unitPrice));
      const totalCost = toNumber(item.totalCost ?? quantity * toNumber(item.realUnitCost));
      addToMap(saleRevenueByProduct, productId, totalSale);
      addToMap(saleProfitByProduct, productId, totalSale - totalCost);
    });
    if (Array.isArray(sale.giftItems)) {
      sale.giftItems.forEach((item) => addToMap(giftUnitsByProduct, String(item.productId ?? ''), item.quantity));
    }
  });

  const productSummaries = products.map((product) => {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variantStock = variants.reduce((sum, variant) => sum + Math.max(toNumber(variant.stock), 0), 0);
    const hasVariants = variants.length > 0 || product.saleMode === 'varianted';
    const movementStock = Math.max(toNumber(movementStockByProduct.get(product.id)), 0);
    const operationalStock = hasVariants ? variantStock : movementStock;
    const publicStock = Math.max(toNumber(product.publicStock ?? product.stock ?? product.stockOnHand), 0);
    const saleUnits = toNumber(saleUnitsByProduct.get(product.id));
    const giftUnits = toNumber(giftUnitsByProduct.get(product.id));
    const saleExitUnits = toNumber(saleExitUnitsByProduct.get(product.id));
    const giftExitUnits = toNumber(giftExitUnitsByProduct.get(product.id));
    const haystack = normalize([product.name, product.brand, product.category, product.subcategory].join(' '));

    return {
      productId: product.id,
      name: product.name ?? 'Producto',
      brand: product.brand ?? '',
      status: product.status ?? 'active',
      saleMode: product.saleMode ?? (hasVariants ? 'varianted' : 'simple'),
      publicStock,
      operationalStock,
      movementStock,
      mirrorStock: Math.max(toNumber(inventoryMirrorStockByProduct.get(product.id)), 0),
      variantStock,
      purchaseUnits: toNumber(purchaseUnitsByProduct.get(product.id)),
      saleUnits,
      saleRevenue: toNumber(saleRevenueByProduct.get(product.id)),
      saleProfit: toNumber(saleProfitByProduct.get(product.id)),
      giftUnits,
      saleExitUnits,
      giftExitUnits,
      issues: [
        publicStock !== operationalStock ? 'public_stock_mismatch' : '',
        movementStock !== Math.max(toNumber(inventoryMirrorStockByProduct.get(product.id)), 0)
          ? 'movement_mirror_mismatch'
          : '',
        saleUnits !== saleExitUnits ? 'sales_without_matching_exit_movements' : '',
        giftUnits !== giftExitUnits ? 'gifts_without_matching_exit_movements' : '',
      ].filter(Boolean),
      observations: [
        publicStock > 0 && saleUnits === 0 && giftUnits === 0 && toNumber(purchaseUnitsByProduct.get(product.id)) > 0
          ? 'stock_available_but_no_sales_for_this_product_id'
          : '',
      ].filter(Boolean),
      matchesTerm: term ? haystack.includes(term) : false,
    };
  });

  const saleProductIds = new Set([
    ...Array.from(saleUnitsByProduct.keys()),
    ...Array.from(giftUnitsByProduct.keys()),
  ]);
  const movementProductIds = new Set([
    ...movements.map((movement) => String(movement.productId ?? '')),
    ...inventoryMovements.map((movement) => String(movement.productId ?? '')),
  ]);

  const orphanSaleProductIds = Array.from(saleProductIds)
    .filter((productId) => productId && !productsById.has(productId))
    .map((productId) => ({
      productId,
      saleUnits: toNumber(saleUnitsByProduct.get(productId)),
      giftUnits: toNumber(giftUnitsByProduct.get(productId)),
    }));

  const orphanMovementProductIds = Array.from(movementProductIds)
    .filter((productId) => productId && !productsById.has(productId))
    .map((productId) => ({ productId }));

  const movementMirrorMissing = movements
    .filter((movement) => !inventoryMovementIds.has(movement.id))
    .map((movement) => ({
      id: movement.id,
      productId: movement.productId,
      productName: productsById.get(String(movement.productId ?? ''))?.name ?? null,
      reason: movement.reason,
      quantity: movement.quantity,
      occurredAt: asIso(movement.occurredAt),
    }));

  const inventoryMirrorExtra = inventoryMovements
    .filter((movement) => !movementIds.has(movement.id))
    .map((movement) => ({
      id: movement.id,
      productId: movement.productId,
      productName: productsById.get(String(movement.productId ?? ''))?.name ?? null,
      reason: movement.reason,
      quantity: movement.quantity,
      occurredAt: asIso(movement.occurredAt),
    }));

  const issueProducts = productSummaries.filter((product) => product.issues.length > 0);
  const observedProducts = productSummaries.filter((product) => product.observations.length > 0);
  const draftAuthorizationMatches = authorizationRequests
    .filter((request) => request.draftSalePayload && Array.isArray(request.draftSalePayload.items))
    .flatMap((request) =>
      request.draftSalePayload.items.map((item) => {
        const product = productsById.get(String(item.productId ?? ''));
        return {
          requestId: request.id,
          status: request.status ?? null,
          requestType: request.requestType ?? null,
          createdAt: asIso(request.createdAt),
          customerName: request.customerName ?? request.draftSalePayload.customerName ?? '',
          productId: item.productId ?? '',
          productName: product?.name ?? null,
          quantity: item.quantity ?? 0,
          unitPrice: item.unitPrice ?? 0,
          matchesTerm: term
            ? normalize([product?.name, product?.brand, product?.category, product?.subcategory].join(' ')).includes(term)
            : false,
        };
      })
    )
    .filter((item) => (term ? item.matchesTerm : true));
  const matchedProducts = term
    ? productSummaries.filter(
        (product) => product.matchesTerm || product.issues.length > 0 || product.observations.length > 0
      )
    : issueProducts;

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
        filterTerm: term || null,
        totals: {
          products: products.length,
          sales: sales.length,
          movements: movements.length,
          inventoryMovements: inventoryMovements.length,
          authorizationRequests: authorizationRequests.length,
          draftAuthorizationSaleLines: draftAuthorizationMatches.length,
          productsWithIssues: issueProducts.length,
          orphanSaleProductIds: orphanSaleProductIds.length,
          orphanMovementProductIds: orphanMovementProductIds.length,
          movementsMissingMirror: movementMirrorMissing.length,
          extraMirrorMovements: inventoryMirrorExtra.length,
          observedProducts: observedProducts.length,
        },
        matchedOrIssueProducts: matchedProducts.slice(0, 100),
        draftAuthorizationMatches: draftAuthorizationMatches.slice(0, 100),
        observedProducts: term ? [] : observedProducts.slice(0, 100),
        orphanSaleProductIds,
        orphanMovementProductIds,
        movementsMissingMirror: movementMirrorMissing.slice(0, 100),
        extraMirrorMovements: inventoryMirrorExtra.slice(0, 100),
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
