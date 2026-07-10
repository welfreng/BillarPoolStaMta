import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const SHOULD_EXECUTE = process.argv.includes('--execute');
const SHOULD_AUDIT = process.argv.includes('--audit');
const SHOULD_AUDIT_RECENT_SALES = process.argv.includes('--audit-recent-sales');
const SHOULD_BACKFILL_STOCK = process.argv.includes('--backfill-stock');
const SHOULD_REPAIR_PURCHASES_DATE_STOCK = process.argv.includes('--repair-purchases-date-stock');
const auditPurchasesDateArgument = process.argv.find((argument) => argument.startsWith('--audit-purchases-date='));
const AUDIT_PURCHASES_DATE = auditPurchasesDateArgument
  ? auditPurchasesDateArgument.slice('--audit-purchases-date='.length).trim()
  : '';
const searchProductsArgument = process.argv.find((argument) => argument.startsWith('--search-products='));
const SEARCH_PRODUCTS_TEXT = searchProductsArgument
  ? searchProductsArgument.slice('--search-products='.length).trim()
  : '';
const TARGET_CUSTOMER = 'babidi pool';
const TARGET_PRODUCT_NAME = 'Casquillo Fujian';
const auditProductArgument = process.argv.find((argument) => argument.startsWith('--product='));
const AUDIT_PRODUCT_NAME = auditProductArgument
  ? auditProductArgument.slice('--product='.length).trim()
  : TARGET_PRODUCT_NAME;
const RETURN_QUANTITY = 1;
const movementIdArgument = process.argv.find((argument) => argument.startsWith('--movement-id='));
const TARGET_MOVEMENT_ID = movementIdArgument ? movementIdArgument.slice('--movement-id='.length).trim() : '';

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

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
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

function getDateKeyInBogota(value) {
  const isoValue = asIso(value);
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function serializeDoc(doc) {
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

function buildCandidateSummary(movement, product, sale) {
  return {
    movementId: movement.id,
    saleId: movement.saleId ?? null,
    occurredAt: asIso(movement.occurredAt),
    customerName: movement.customerName ?? null,
    saleCustomerName: sale?.customerName ?? null,
    productId: movement.productId,
    productName: product?.name ?? null,
    variantId: movement.variantId ?? null,
    variantName: movement.variantName ?? null,
    quantity: toNumber(movement.quantity),
    relatedUnitCost: toNumber(movement.relatedUnitCost),
    notes: movement.notes ?? null,
  };
}

function getTimeValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getVariantStockKey(movement) {
  return String(movement.variantId ?? '');
}

function buildStockFromMovements(product, movements) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) {
    return {
      publicStock: Math.max(
        movements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0),
        0
      ),
      variants: null,
      variantStocks: [],
    };
  }

  const stockByVariantId = new Map();
  movements.forEach((movement) => {
    const variantId = getVariantStockKey(movement);
    if (!variantId) return;
    stockByVariantId.set(variantId, (stockByVariantId.get(variantId) ?? 0) + toNumber(movement.quantity));
  });

  const nextVariants = variants.map((variant) => {
    const variantStock = Math.max(toNumber(stockByVariantId.get(String(variant.id)) ?? 0), 0);
    return {
      ...variant,
      stock: variantStock,
      publicStock: variantStock,
    };
  });

  return {
    publicStock: nextVariants.reduce((sum, variant) => sum + toNumber(variant.publicStock), 0),
    variants: nextVariants,
    variantStocks: nextVariants.map((variant) => ({
      id: String(variant.id),
      name: String(variant.name ?? ''),
      stock: toNumber(variant.stock),
    })),
  };
}

function summarizeMovements(movements) {
  const byReason = new Map();
  const byVariant = new Map();
  movements.forEach((movement) => {
    const reasonKey = `${movement.type ?? 'sin-tipo'}:${movement.reason ?? 'sin-motivo'}`;
    byReason.set(reasonKey, (byReason.get(reasonKey) ?? 0) + toNumber(movement.quantity));
    const variantKey = String(movement.variantId ?? 'sin-variante');
    byVariant.set(variantKey, (byVariant.get(variantKey) ?? 0) + toNumber(movement.quantity));
  });

  return {
    total: movements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0),
    byReason: Object.fromEntries([...byReason.entries()].sort()),
    byVariant: Object.fromEntries([...byVariant.entries()].sort()),
  };
}

function buildLedgerStockForProduct(product, movements) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) {
    return {
      publicStock: Math.max(
        movements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0),
        0
      ),
      variants: null,
    };
  }

  const stockByVariant = new Map();
  movements.forEach((movement) => {
    const variantId = String(movement.variantId ?? '');
    if (!variantId) return;
    stockByVariant.set(variantId, (stockByVariant.get(variantId) ?? 0) + toNumber(movement.quantity));
  });

  const nextVariants = variants.map((variant) => {
    const stock = Math.max(toNumber(stockByVariant.get(String(variant.id)) ?? 0), 0);
    return {
      ...variant,
      stock,
      publicStock: stock,
    };
  });

  return {
    publicStock: nextVariants.reduce((sum, variant) => sum + toNumber(variant.stock), 0),
    variants: nextVariants,
  };
}

async function backfillOperationalStockFromLedger(db) {
  const [productsSnap, movementsSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('movements').get(),
  ]);
  const products = productsSnap.docs.map(serializeDoc).filter(Boolean);
  const movementsByProductId = new Map();
  movementsSnap.docs
    .map(serializeDoc)
    .filter(Boolean)
    .forEach((movement) => {
      const productId = String(movement.productId ?? '');
      if (!productId) return;
      const current = movementsByProductId.get(productId) ?? [];
      current.push(movement);
      movementsByProductId.set(productId, current);
    });

  const fixes = products
    .map((product) => {
      const ledger = buildLedgerStockForProduct(product, movementsByProductId.get(product.id) ?? []);
      const currentPublicStock = toNumber(product.publicStock ?? product.stock ?? product.stockOnHand);
      const currentVariants = Array.isArray(product.variants) ? product.variants : [];
      const variantMismatches = ledger.variants
        ? ledger.variants
            .filter((nextVariant) => {
              const currentVariant = currentVariants.find((variant) => String(variant.id) === String(nextVariant.id));
              return (
                toNumber(currentVariant?.stock ?? currentVariant?.publicStock) !== toNumber(nextVariant.stock)
              );
            })
            .map((nextVariant) => {
              const currentVariant = currentVariants.find((variant) => String(variant.id) === String(nextVariant.id));
              return {
                id: nextVariant.id,
                name: nextVariant.name ?? null,
                currentStock: toNumber(currentVariant?.stock ?? currentVariant?.publicStock),
                nextStock: toNumber(nextVariant.stock),
              };
            })
        : [];
      const needsUpdate = currentPublicStock !== ledger.publicStock || variantMismatches.length > 0;
      return {
        product,
        ledger,
        currentPublicStock,
        variantMismatches,
        needsUpdate,
      };
    })
    .filter((item) => item.needsUpdate);

  if (SHOULD_EXECUTE && fixes.length > 0) {
    let batch = db.batch();
    let operationCount = 0;

    for (const fix of fixes) {
      const productRef = db.collection('products').doc(fix.product.id);
      batch.set(
        productRef,
        {
          publicStock: fix.ledger.publicStock,
          stock: fix.ledger.publicStock,
          stockOnHand: fix.ledger.publicStock,
          ...(fix.ledger.variants ? { variants: fix.ledger.variants } : {}),
          ...(fix.ledger.publicStock > 0 ? { status: 'active' } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      operationCount += 1;

      if (fix.ledger.variants) {
        fix.ledger.variants.forEach((variant) => {
          batch.set(
            db.collection('product_variants').doc(String(variant.id)),
            {
              ...variant,
              id: String(variant.id),
              productId: fix.product.id,
              productName: fix.product.name ?? null,
              stock: toNumber(variant.stock),
              publicStock: toNumber(variant.publicStock ?? variant.stock),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          operationCount += 1;
        });
      }

      if (operationCount >= 430) {
        await batch.commit();
        batch = db.batch();
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }
  }

  console.log(
    JSON.stringify(
      {
        status: SHOULD_EXECUTE ? 'backfill_executed' : 'backfill_preview',
        execute: SHOULD_EXECUTE,
        totalProductsToFix: fixes.length,
        products: fixes.map((fix) => ({
          id: fix.product.id,
          name: fix.product.name ?? null,
          currentPublicStock: fix.currentPublicStock,
          nextPublicStock: fix.ledger.publicStock,
          variantMismatches: fix.variantMismatches,
        })),
      },
      null,
      2
    )
  );
}

async function auditTargetProduct(db) {
  const productsSnap = await db.collection('products').get();
  const product = productsSnap.docs
    .map(serializeDoc)
    .filter(Boolean)
    .find((item) => normalizeText(item.name) === normalizeText(AUDIT_PRODUCT_NAME));

  if (!product) {
    console.log(JSON.stringify({ status: 'product_not_found', target: AUDIT_PRODUCT_NAME }, null, 2));
    return true;
  }

  const [movementsSnap, inventoryMovementsSnap, variantDocsSnap, salesSnap] = await Promise.all([
    db.collection('movements').where('productId', '==', product.id).get(),
    db.collection('inventory_movements').where('productId', '==', product.id).get(),
    db.collection('product_variants').where('productId', '==', product.id).get(),
    db.collection('sales').where('productId', '==', product.id).get(),
  ]);
  const movements = movementsSnap.docs.map(serializeDoc).filter(Boolean);
  const inventoryMovements = inventoryMovementsSnap.docs.map(serializeDoc).filter(Boolean);
  const sales = salesSnap.docs.map(serializeDoc).filter(Boolean);
  const variants = Array.isArray(product.variants) ? product.variants : [];

  console.log(
    JSON.stringify(
      {
        status: 'audit',
        product: {
          id: product.id,
          name: product.name,
          productPublicStock: toNumber(product.publicStock ?? product.stock ?? product.stockOnHand),
          embeddedVariants: variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            stock: toNumber(variant.stock),
            publicStock: toNumber(variant.publicStock),
          })),
          variantDocs: variantDocsSnap.docs.map((doc) => {
            const variant = serializeDoc(doc);
            return {
              id: variant.id,
              name: variant.name ?? null,
              stock: toNumber(variant.stock),
              publicStock: toNumber(variant.publicStock),
            };
          }),
        },
        movements: {
          count: movements.length,
          ...summarizeMovements(movements),
          recent: movements
            .sort((left, right) => getTimeValue(right.occurredAt) - getTimeValue(left.occurredAt))
            .slice(0, 20)
            .map((movement) => ({
              id: movement.id,
              type: movement.type ?? null,
              reason: movement.reason ?? null,
              variantId: movement.variantId ?? null,
              variantName: movement.variantName ?? null,
              quantity: toNumber(movement.quantity),
              occurredAt: asIso(movement.occurredAt),
              notes: movement.notes ?? null,
            })),
        },
        inventoryMovements: {
          count: inventoryMovements.length,
          ...summarizeMovements(inventoryMovements),
          recent: inventoryMovements
            .sort((left, right) => getTimeValue(right.occurredAt) - getTimeValue(left.occurredAt))
            .slice(0, 20)
            .map((movement) => ({
              id: movement.id,
              type: movement.type ?? null,
              reason: movement.reason ?? null,
              sourceType: movement.sourceType ?? null,
              variantId: movement.variantId ?? null,
              variantName: movement.variantName ?? null,
              quantity: toNumber(movement.quantity),
              occurredAt: asIso(movement.occurredAt),
              notes: movement.notes ?? null,
            })),
        },
        sales: {
          count: sales.length,
          recent: sales
            .sort((left, right) => getTimeValue(right.soldAt) - getTimeValue(left.soldAt))
            .slice(0, 20)
            .map((sale) => ({
              id: sale.id,
              saleBatchId: sale.saleBatchId ?? null,
              customerName: sale.customerName ?? null,
              productId: sale.productId ?? null,
              variantId: sale.variantId ?? null,
              variantName: sale.variantName ?? null,
              quantity: toNumber(sale.quantity),
              soldAt: asIso(sale.soldAt),
              giftItems: Array.isArray(sale.giftItems)
                ? sale.giftItems.map((item) => ({
                    productId: item?.productId ?? null,
                    quantity: toNumber(item?.quantity),
                  }))
                : [],
              lineItems: Array.isArray(sale.lineItems)
                ? sale.lineItems.map((item) => ({
                    productId: item?.productId ?? null,
                    variantId: item?.variantId ?? null,
                    variantName: item?.variantName ?? null,
                    quantity: toNumber(item?.quantity),
                  }))
                : [],
            })),
        },
      },
      null,
      2
    )
  );
  return true;
}

async function auditRecentSales(db) {
  const [salesSnap, productsSnap] = await Promise.all([
    db.collection('sales').orderBy('soldAt', 'desc').limit(30).get(),
    db.collection('products').get(),
  ]);
  const productsById = new Map(productsSnap.docs.map((doc) => [doc.id, serializeDoc(doc)]));
  const sales = salesSnap.docs.map(serializeDoc).filter(Boolean);
  console.log(
    JSON.stringify(
      {
        status: 'recent_sales',
        count: sales.length,
        sales: sales.map((sale) => ({
          id: sale.id,
          saleBatchId: sale.saleBatchId ?? null,
          soldAt: asIso(sale.soldAt),
          customerName: sale.customerName ?? null,
          productId: sale.productId ?? null,
          productName: productsById.get(String(sale.productId))?.name ?? null,
          variantId: sale.variantId ?? null,
          variantName: sale.variantName ?? null,
          quantity: toNumber(sale.quantity),
          notes: sale.notes ?? null,
          lineItems: Array.isArray(sale.lineItems)
            ? sale.lineItems.map((item) => ({
                productId: item?.productId ?? null,
                productName: productsById.get(String(item?.productId))?.name ?? null,
                variantId: item?.variantId ?? null,
                variantName: item?.variantName ?? null,
                quantity: toNumber(item?.quantity),
              }))
            : [],
          giftItems: Array.isArray(sale.giftItems)
            ? sale.giftItems.map((item) => ({
                productId: item?.productId ?? null,
                productName: productsById.get(String(item?.productId))?.name ?? null,
                quantity: toNumber(item?.quantity),
              }))
            : [],
        })),
      },
      null,
      2
    )
  );
}

async function searchProducts(db, rawSearchText) {
  const productsSnap = await db.collection('products').get();
  const searchParts = normalizeText(rawSearchText)
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
  const products = productsSnap.docs
    .map(serializeDoc)
    .filter(Boolean)
    .filter((product) => {
      const searchableText = normalizeText(
        [
          product.name,
          product.brand,
          product.category,
          product.subcategory,
          ...(Array.isArray(product.variants) ? product.variants.map((variant) => variant?.name) : []),
        ].join(' ')
      );
      return searchParts.every((part) => searchableText.includes(part));
    })
    .sort((left, right) => String(left.name ?? '').localeCompare(String(right.name ?? ''), 'es'));

  console.log(
    JSON.stringify(
      {
        status: 'product_search',
        query: rawSearchText,
        count: products.length,
        products: products.map((product) => ({
          id: product.id,
          name: product.name ?? null,
          brand: product.brand ?? null,
          category: product.category ?? null,
          subcategory: product.subcategory ?? null,
          status: product.status ?? null,
          publicStock: toNumber(product.publicStock ?? product.stock ?? product.stockOnHand),
          salePrice: toNumber(product.salePrice),
          variants: Array.isArray(product.variants)
            ? product.variants.map((variant) => ({
                id: variant?.id ?? null,
                name: variant?.name ?? null,
                stock: toNumber(variant?.stock ?? variant?.publicStock),
                salePrice: toNumber(variant?.salePrice),
              }))
            : [],
        })),
      },
      null,
      2
    )
  );
}

async function auditPurchasesByDate(db, dateKey) {
  const [productsSnap, purchasesSnap, movementsSnap, salesSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('purchases').get(),
    db.collection('movements').get(),
    db.collection('sales').get(),
  ]);
  const products = productsSnap.docs.map(serializeDoc).filter(Boolean);
  const productsById = new Map(products.map((product) => [String(product.id), product]));
  const purchases = purchasesSnap.docs
    .map(serializeDoc)
    .filter(Boolean)
    .filter((purchase) => getDateKeyInBogota(purchase.purchasedAt) === dateKey)
    .sort((left, right) => getTimeValue(left.purchasedAt) - getTimeValue(right.purchasedAt));
  const movements = movementsSnap.docs.map(serializeDoc).filter(Boolean);
  const sales = salesSnap.docs.map(serializeDoc).filter(Boolean);
  const productIds = new Set(purchases.map((purchase) => String(purchase.productId ?? '')).filter(Boolean));

  const rows = purchases.map((purchase) => {
    const product = productsById.get(String(purchase.productId));
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const variant = variants.find((item) => String(item?.id) === String(purchase.variantId ?? '')) ?? null;
    const productMovements = movements
      .filter((movement) => String(movement.productId ?? '') === String(purchase.productId ?? ''))
      .sort((left, right) => getTimeValue(left.occurredAt) - getTimeValue(right.occurredAt));
    const purchaseMovement = productMovements.find((movement) => String(movement.purchaseId ?? '') === String(purchase.id));
    const relatedSales = sales
      .filter((sale) => String(sale.productId ?? '') === String(purchase.productId ?? ''))
      .sort((left, right) => getTimeValue(right.soldAt) - getTimeValue(left.soldAt));
    const stock = variant
      ? toNumber(variant.stock ?? variant.publicStock)
      : toNumber(product?.publicStock ?? product?.stock ?? product?.stockOnHand);
    const movementTotal = productMovements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
    const variantMovementTotal = purchase.variantId
      ? productMovements
          .filter((movement) => String(movement.variantId ?? '') === String(purchase.variantId ?? ''))
          .reduce((sum, movement) => sum + toNumber(movement.quantity), 0)
      : null;

    return {
      purchaseId: purchase.id,
      purchaseBatchId: purchase.purchaseBatchId ?? purchase.purchaseId ?? null,
      purchasedAt: asIso(purchase.purchasedAt),
      supplier: purchase.supplier ?? null,
      productId: purchase.productId ?? null,
      productName: product?.name ?? null,
      productStatus: product?.status ?? null,
      variantId: purchase.variantId ?? null,
      variantName: purchase.variantName ?? variant?.name ?? null,
      quantityPurchased: toNumber(purchase.quantityPurchased ?? purchase.presentationQuantity),
      currentStock: stock,
      currentProductPublicStock: toNumber(product?.publicStock ?? product?.stock ?? product?.stockOnHand),
      currentVariantStock: variant ? toNumber(variant.stock ?? variant.publicStock) : null,
      movementTotal,
      variantMovementTotal,
      purchaseMovementId: purchaseMovement?.id ?? null,
      purchaseMovementQuantity: toNumber(purchaseMovement?.quantity),
      recentMovements: productMovements.slice(-8).map((movement) => ({
        id: movement.id,
        occurredAt: asIso(movement.occurredAt),
        type: movement.type ?? null,
        reason: movement.reason ?? null,
        quantity: toNumber(movement.quantity),
        variantId: movement.variantId ?? null,
        variantName: movement.variantName ?? null,
        purchaseId: movement.purchaseId ?? null,
        saleId: movement.saleId ?? null,
        notes: movement.notes ?? null,
      })),
      recentSales: relatedSales.slice(0, 8).map((sale) => ({
        id: sale.id,
        soldAt: asIso(sale.soldAt),
        customerName: sale.customerName ?? null,
        variantId: sale.variantId ?? null,
        variantName: sale.variantName ?? null,
        quantity: toNumber(sale.quantity),
        lineItems: Array.isArray(sale.lineItems)
          ? sale.lineItems.map((item) => ({
              productId: item?.productId ?? null,
              variantId: item?.variantId ?? null,
              variantName: item?.variantName ?? null,
              quantity: toNumber(item?.quantity),
            }))
          : [],
      })),
    };
  });

  console.log(
    JSON.stringify(
      {
        status: 'purchases_date_audit',
        dateKey,
        purchaseCount: purchases.length,
        productCount: productIds.size,
        rows,
        zeroOrMissingStockRows: rows.filter((row) => row.currentStock <= 0),
      },
      null,
      2
    )
  );
}

async function repairSafePurchaseStockByDate(db, dateKey) {
  const [productsSnap, purchasesSnap, movementsSnap, salesSnap] = await Promise.all([
    db.collection('products').get(),
    db.collection('purchases').get(),
    db.collection('movements').get(),
    db.collection('sales').get(),
  ]);
  const products = productsSnap.docs.map(serializeDoc).filter(Boolean);
  const productsById = new Map(products.map((product) => [String(product.id), product]));
  const purchases = purchasesSnap.docs
    .map(serializeDoc)
    .filter(Boolean)
    .filter((purchase) => getDateKeyInBogota(purchase.purchasedAt) === dateKey);
  const movements = movementsSnap.docs.map(serializeDoc).filter(Boolean);
  const sales = salesSnap.docs.map(serializeDoc).filter(Boolean);
  const purchaseProductIds = Array.from(new Set(purchases.map((purchase) => String(purchase.productId ?? '')).filter(Boolean)));

  const fixes = purchaseProductIds
    .map((productId) => {
      const product = productsById.get(productId);
      if (!product) return null;
      const variants = Array.isArray(product.variants) ? product.variants : [];
      if (variants.length > 0) return null;

      const currentStock = toNumber(product.publicStock ?? product.stock ?? product.stockOnHand);
      const productSales = sales.filter((sale) => String(sale.productId ?? '') === productId);
      if (currentStock > 0 || productSales.length > 0) return null;

      const productMovements = movements.filter((movement) => String(movement.productId ?? '') === productId);
      const movementTotal = productMovements.reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
      const purchaseTotal = purchases
        .filter((purchase) => String(purchase.productId ?? '') === productId)
        .reduce((sum, purchase) => sum + toNumber(purchase.quantityPurchased ?? purchase.presentationQuantity), 0);

      if (movementTotal <= 0 || purchaseTotal <= 0) return null;

      return {
        productId,
        productName: product.name ?? null,
        currentStock,
        nextStock: movementTotal,
        purchaseTotal,
        movementCount: productMovements.length,
        purchaseIds: purchases
          .filter((purchase) => String(purchase.productId ?? '') === productId)
          .map((purchase) => purchase.id),
      };
    })
    .filter(Boolean);

  if (SHOULD_EXECUTE && fixes.length > 0) {
    const batch = db.batch();
    fixes.forEach((fix) => {
      batch.set(
        db.collection('products').doc(fix.productId),
        {
          publicStock: fix.nextStock,
          stock: fix.nextStock,
          stockOnHand: fix.nextStock,
          status: 'active',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }

  console.log(
    JSON.stringify(
      {
        status: SHOULD_EXECUTE ? 'purchase_date_stock_repair_executed' : 'purchase_date_stock_repair_preview',
        dateKey,
        count: fixes.length,
        fixes,
      },
      null,
      2
    )
  );
}

async function findFallbackCorrectionTarget(db, productsById) {
  const productsSnap = await db.collection('products').get();
  const exactProducts = productsSnap.docs
    .map(serializeDoc)
    .filter(Boolean)
    .filter((product) => normalizeText(product.name) === normalizeText(TARGET_PRODUCT_NAME));

  if (exactProducts.length !== 1) {
    return { target: null, product: null, exactProducts };
  }

  const product = exactProducts[0];
  productsById.set(String(product.id), product);
  const movementsSnap = await db.collection('movements').where('productId', '==', product.id).get();
  const latestExit = movementsSnap.docs
    .map(serializeDoc)
    .filter(Boolean)
    .filter((movement) => movement.type === 'exit')
    .sort((left, right) => getTimeValue(right.occurredAt) - getTimeValue(left.occurredAt))[0];
  const firstVariant = Array.isArray(product.variants) ? product.variants[0] : null;

  return {
    product,
    target: {
      id: latestExit?.id ?? 'sin-movimiento-origen',
      productId: product.id,
      saleId: latestExit?.saleId ?? null,
      variantId: latestExit?.variantId ?? firstVariant?.id ?? null,
      variantName: latestExit?.variantName ?? firstVariant?.name ?? null,
      relatedUnitCost: latestExit?.relatedUnitCost ?? firstVariant?.latestUnitCost ?? 0,
      customerName: TARGET_CUSTOMER,
      customerPhone: null,
      giftReason: 'correccion',
      occurredAt: latestExit?.occurredAt ?? null,
      notes: latestExit?.notes ?? 'Correccion solicitada por obsequio registrado de mas.',
    },
    exactProducts,
  };
}

async function main() {
  loadEnvFile(ENV_FILE);
  const db = getFirestore(getAdminApp());

  if (SHOULD_BACKFILL_STOCK) {
    await backfillOperationalStockFromLedger(db);
    return;
  }

  if (AUDIT_PURCHASES_DATE) {
    if (SHOULD_REPAIR_PURCHASES_DATE_STOCK) {
      await repairSafePurchaseStockByDate(db, AUDIT_PURCHASES_DATE);
      return;
    }
    await auditPurchasesByDate(db, AUDIT_PURCHASES_DATE);
    return;
  }

  if (SEARCH_PRODUCTS_TEXT) {
    await searchProducts(db, SEARCH_PRODUCTS_TEXT);
    return;
  }

  if (SHOULD_AUDIT_RECENT_SALES) {
    await auditRecentSales(db);
    return;
  }

  if (SHOULD_AUDIT) {
    await auditTargetProduct(db);
    return;
  }

  const giftSnap = await db.collection('movements').where('reason', '==', 'gift').get();

  const targetCustomer = normalizeText(TARGET_CUSTOMER);
  const compactTargetCustomer = compactText(TARGET_CUSTOMER);
  const giftMovements = giftSnap.docs
    .map(serializeDoc)
    .filter(Boolean)
    .filter((movement) => movement.type === 'exit');
  const saleIds = [...new Set(giftMovements.map((movement) => String(movement.saleId ?? '')).filter(Boolean))];
  const saleDocs = await Promise.all(saleIds.map((saleId) => db.collection('sales').doc(saleId).get()));
  const salesById = new Map(saleDocs.map((doc) => [doc.id, serializeDoc(doc)]));
  const candidates = TARGET_MOVEMENT_ID
    ? giftMovements.filter((movement) => movement.id === TARGET_MOVEMENT_ID)
    : giftMovements.filter((movement) => {
    const sale = movement.saleId ? salesById.get(String(movement.saleId)) : null;
    const searchableText = [
      movement.customerName,
      sale?.customerName,
      movement.notes,
      movement.productName,
    ].join(' ');
    return (
      normalizeText(searchableText).includes(targetCustomer) ||
      compactText(searchableText).includes(compactTargetCustomer) ||
      normalizeText(searchableText).includes('babi') ||
      normalizeText(searchableText).includes('pool')
    );
  });

  const productIds = [...new Set(giftMovements.map((movement) => String(movement.productId ?? '')).filter(Boolean))];
  const productDocs = await Promise.all(productIds.map((productId) => db.collection('products').doc(productId).get()));
  const productsById = new Map(productDocs.map((doc) => [doc.id, serializeDoc(doc)]));
  const productNameTarget = normalizeText(TARGET_PRODUCT_NAME);
  const productCandidates = candidates.length > 0 ? candidates : giftMovements.filter((movement) => {
    const product = productsById.get(String(movement.productId));
    return normalizeText(product?.name).includes(productNameTarget);
  });
  const candidateSummaries = productCandidates.map((movement) =>
    buildCandidateSummary(
      movement,
      productsById.get(String(movement.productId)),
      movement.saleId ? salesById.get(String(movement.saleId)) : null
    )
  );
  const fallbackCorrection = productCandidates.length === 0 ? await findFallbackCorrectionTarget(db, productsById) : null;
  const selectedCandidates =
    productCandidates.length === 1
      ? productCandidates
      : fallbackCorrection?.target
        ? [fallbackCorrection.target]
        : productCandidates;

  if (selectedCandidates.length !== 1) {
    const productsSnap = await db.collection('products').get();
    const matchingProducts = productsSnap.docs
      .map(serializeDoc)
      .filter(Boolean)
      .filter((product) => {
        const productName = normalizeText(product.name);
        return productName.includes('casquillo') || productName.includes('fujian');
      });
    const matchingProductIds = new Set(matchingProducts.map((product) => String(product.id)));
    const matchingProductMovements = giftMovements
      .filter((movement) => matchingProductIds.has(String(movement.productId)))
      .sort((left, right) => getTimeValue(right.occurredAt) - getTimeValue(left.occurredAt));
    const allMatchingProductMovementSnaps = await Promise.all(
      [...matchingProductIds].map((productId) => db.collection('movements').where('productId', '==', productId).get())
    );
    const allMatchingProductMovements = allMatchingProductMovementSnaps
      .flatMap((snap) => snap.docs.map(serializeDoc).filter(Boolean))
      .sort((left, right) => getTimeValue(right.occurredAt) - getTimeValue(left.occurredAt))
      .slice(0, 30);

    const recentGifts = giftMovements
      .sort((left, right) => getTimeValue(right.occurredAt) - getTimeValue(left.occurredAt))
      .slice(0, 20);
    const recentProductIds = [...new Set(recentGifts.map((movement) => String(movement.productId ?? '')).filter(Boolean))];
    const recentProductDocs = await Promise.all(
      recentProductIds
        .filter((productId) => !productsById.has(productId))
        .map((productId) => db.collection('products').doc(productId).get())
    );
    recentProductDocs.forEach((doc) => productsById.set(doc.id, serializeDoc(doc)));

    console.log(
      JSON.stringify(
        {
          execute: SHOULD_EXECUTE,
          status: selectedCandidates.length === 0 ? 'no_gift_found' : 'multiple_candidates',
          message:
            selectedCandidates.length === 0
              ? `No encontre obsequios para "${TARGET_CUSTOMER}" ni para producto "${TARGET_PRODUCT_NAME}".`
              : `Encontre ${selectedCandidates.length} obsequios para "${TARGET_PRODUCT_NAME}". No modifico nada hasta escoger uno.`,
          candidates: candidateSummaries,
          matchingProducts: matchingProducts.map((product) => ({
            id: product.id,
            name: product.name ?? null,
            publicStock: toNumber(product.publicStock ?? product.stock ?? product.stockOnHand),
          })),
          matchingProductGiftMovements: matchingProductMovements.map((movement) =>
            buildCandidateSummary(
              movement,
              productsById.get(String(movement.productId)) ?? matchingProducts.find((product) => product.id === movement.productId),
              movement.saleId ? salesById.get(String(movement.saleId)) : null
            )
          ),
          matchingProductAllRecentMovements: allMatchingProductMovements.map((movement) => ({
            ...buildCandidateSummary(
              movement,
              productsById.get(String(movement.productId)) ??
                matchingProducts.find((product) => product.id === movement.productId),
              movement.saleId ? salesById.get(String(movement.saleId)) : null
            ),
            type: movement.type ?? null,
            reason: movement.reason ?? null,
          })),
          recentGifts: recentGifts.map((movement) =>
            buildCandidateSummary(
              movement,
              productsById.get(String(movement.productId)),
              movement.saleId ? salesById.get(String(movement.saleId)) : null
            )
          ),
        },
        null,
        2
      )
    );
    return;
  }

  const originalGift = selectedCandidates[0];
  const productId = String(originalGift.productId ?? '');
  const product = productsById.get(productId) ?? fallbackCorrection?.product;
  if (!product) throw new Error(`No existe el producto ${productId}.`);

  const productMovementsSnap = await db.collection('movements').where('productId', '==', productId).get();
  const correctionRef = db.collection('movements').doc();
  const correctionId = correctionRef.id;
  const now = Timestamp.now();
  const correctionMovement = {
    id: correctionId,
    productId,
    type: 'entry',
    reason: 'manual-adjustment',
    quantity: RETURN_QUANTITY,
    variantId: originalGift.variantId ?? null,
    variantName: originalGift.variantName ?? null,
    occurredAt: now,
    responsibleUser: 'Correccion sistema',
    notes: `Correccion: devolucion de ${RETURN_QUANTITY} unidad por obsequio registrado de mas para ${originalGift.customerName ?? TARGET_CUSTOMER}. Movimiento origen/referencia: ${originalGift.id}.`,
    relatedUnitCost: toNumber(originalGift.relatedUnitCost),
    customerName: originalGift.customerName ?? null,
    customerPhone: originalGift.customerPhone ?? null,
    giftReason: originalGift.giftReason ?? null,
    giftTotalCost: null,
    createdAt: now,
    updatedAt: now,
  };

  const movementHistory = productMovementsSnap.docs.map(serializeDoc).filter(Boolean).concat(correctionMovement);
  const nextStock = buildStockFromMovements(product, movementHistory);
  const currentVariant = Array.isArray(product.variants)
    ? product.variants.find((variant) => String(variant.id) === String(originalGift.variantId ?? ''))
    : null;
  const nextVariant = nextStock.variants?.find((variant) => String(variant.id) === String(originalGift.variantId ?? ''));

  const plan = {
    execute: SHOULD_EXECUTE,
    status: SHOULD_EXECUTE ? 'executed' : 'preview',
    correctionMovementId: correctionId,
    originalGift: buildCandidateSummary(
      originalGift,
      product,
      originalGift.saleId ? salesById.get(String(originalGift.saleId)) : null
    ),
    product: {
      id: product.id,
      name: product.name ?? null,
      currentPublicStock: toNumber(product.publicStock ?? product.stock ?? product.stockOnHand),
      nextPublicStock: nextStock.publicStock,
    },
    variant: originalGift.variantId
      ? {
          id: String(originalGift.variantId),
          name: originalGift.variantName ?? currentVariant?.name ?? null,
          currentStock: toNumber(currentVariant?.stock ?? currentVariant?.publicStock),
          nextStock: toNumber(nextVariant?.stock),
        }
      : null,
  };

  if (SHOULD_EXECUTE) {
    const batch = db.batch();

    batch.set(correctionRef, correctionMovement);
    batch.set(db.collection('inventory_movements').doc(correctionId), {
      ...correctionMovement,
      sourceType: 'manual-adjustment',
      sourceId: correctionId,
    });
    batch.set(
      db.collection('products').doc(productId),
      {
        publicStock: nextStock.publicStock,
        stock: nextStock.publicStock,
        stockOnHand: nextStock.publicStock,
        status: nextStock.publicStock > 0 ? 'active' : product.status ?? 'active',
        ...(nextStock.variants ? { variants: nextStock.variants } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (nextStock.variants) {
      nextStock.variants.forEach((variant) => {
        batch.set(
          db.collection('product_variants').doc(String(variant.id)),
          {
            ...variant,
            id: String(variant.id),
            productId,
            productName: product.name ?? null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    }

    await batch.commit();
  }

  console.log(JSON.stringify(plan, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
