import type {
  InventoryMovement,
  Product,
  ProductSaleMode,
  ProductVariant,
  ProductVariantAttributeDefinition,
  Purchase,
} from '@/lib/admin/types';

function slugifyValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function titleCaseKey(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeVariantAttributeDefinitions(
  definitions: ProductVariantAttributeDefinition[] = []
) {
  const seenKeys = new Set<string>();

  return definitions
    .map((definition, index) => {
      const label = definition.label?.trim();
      const key = slugifyValue(definition.key || label || `atributo-${index + 1}`);
      if (!label || !key || seenKeys.has(key)) return null;
      seenKeys.add(key);
      return {
        id: definition.id?.trim() || `attr-${index + 1}`,
        key,
        label,
      };
    })
    .filter((definition): definition is ProductVariantAttributeDefinition => Boolean(definition));
}

export function buildVariantAttributes(
  definitions: ProductVariantAttributeDefinition[] = [],
  values: string[] = []
) {
  const attributes: Record<string, string> = {};
  definitions.forEach((definition, index) => {
    const value = values[index]?.trim();
    if (!definition.key || !value) return;
    attributes[definition.key] = value;
  });
  return attributes;
}

export function buildVariantAttributeValues(
  definitions: ProductVariantAttributeDefinition[] = [],
  attributes: Record<string, string> = {}
) {
  return definitions.map((definition) => attributes[definition.key] ?? '');
}

export function buildVariantDisplayName(
  variant: Pick<ProductVariant, 'name' | 'attributes'>,
  definitions: ProductVariantAttributeDefinition[] = []
) {
  if (variant.name?.trim()) return variant.name.trim();
  const parts = definitions
    .map((definition) => variant.attributes?.[definition.key]?.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(' / ');

  const looseValues = Object.entries(variant.attributes ?? {})
    .map(([key, value]) => `${titleCaseKey(key)}: ${value}`)
    .filter(Boolean);
  return looseValues.join(' / ');
}

export function getProductSaleMode(product?: Product): ProductSaleMode {
  if (!product) return 'simple';
  if (product.saleMode === 'varianted') return 'varianted';
  return (product.variants?.length ?? 0) > 0 ? 'varianted' : 'simple';
}

export function getProductVariantStock(
  product: Product | undefined,
  variantId: string | undefined,
  movements: InventoryMovement[]
) {
  if (!product || !variantId) return 0;
  const variantMovements = movements.filter(
    (movement) => movement.productId === product.id && movement.variantId === variantId
  );
  if (variantMovements.length > 0) {
    return Math.max(
      variantMovements.reduce((total, movement) => total + Number(movement.quantity ?? 0), 0),
      0
    );
  }

  const variant = (product.variants ?? []).find((item) => item.id === variantId);
  const directStock = Number(variant?.stock ?? variant?.publicStock ?? 0);
  if (Number.isFinite(directStock)) return Math.max(directStock, 0);

  return 0;
}

export function getVariantRealUnitCost(
  purchases: Purchase[],
  productId: string,
  variantId?: string
) {
  const variantPurchase = purchases
    .filter((purchase) => purchase.productId === productId && purchase.variantId === variantId)
    .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())[0];

  if (variantPurchase) return variantPurchase.realUnitCost;

  return (
    purchases
      .filter((purchase) => purchase.productId === productId)
      .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())[0]?.realUnitCost ?? 0
  );
}

export function getVariantSalePrice(product: Product | undefined, variantId?: string) {
  if (!product) return 0;
  const variant = (product.variants ?? []).find((item) => item.id === variantId);
  return Number(variant?.salePrice ?? product.salePrice ?? 0);
}

export function normalizeProductVariants(
  productId: string,
  definitions: ProductVariantAttributeDefinition[] = [],
  variants: ProductVariant[] = []
) {
  return variants
    .map((variant, index) => {
      const attributeValues = Array.isArray(variant.attributeValues)
        ? variant.attributeValues
        : buildVariantAttributeValues(definitions, variant.attributes ?? {});
      const attributes = buildVariantAttributes(definitions, attributeValues);
      const fallbackName = buildVariantDisplayName({ name: variant.name, attributes }, definitions);
      const idSeed = variant.id?.trim() || fallbackName || `variant-${index + 1}`;
      const id = variant.id?.trim() || `${productId}-${slugifyValue(idSeed || `variant-${index + 1}`)}`;

      return {
        id,
        productId,
        name: fallbackName || `Variante ${index + 1}`,
        displayName: fallbackName || `Variante ${index + 1}`,
        sku: variant.sku?.trim() || undefined,
        salePrice: Number(variant.salePrice ?? 0),
        latestUnitCost: Number(variant.latestUnitCost ?? 0),
        stock: Math.max(Number(variant.stock ?? 0), 0),
        publicStock: Math.max(Number(variant.publicStock ?? variant.stock ?? 0), 0),
        status: variant.status === 'inactive' ? 'inactive' : 'active',
        sortOrder: Number(variant.sortOrder ?? index),
        attributes,
        attributeValues: definitions.map((definition) => attributes[definition.key] ?? ''),
        colorHex: typeof variant.colorHex === 'string' && variant.colorHex.trim() ? variant.colorHex.trim() : undefined,
      } satisfies ProductVariant;
    })
    .filter((variant) => variant.name.trim());
}

export function summarizeProductFromVariants(product: Product) {
  const activeVariants = (product.variants ?? []).filter((variant) => variant.status !== 'inactive');
  if (activeVariants.length === 0) {
    return {
      publicStock: Number(product.publicStock ?? 0),
      salePrice: Number(product.salePrice ?? 0),
    };
  }

  const publicStock = activeVariants.reduce(
    (total, variant) => total + Math.max(Number(variant.publicStock ?? variant.stock ?? 0), 0),
    0
  );
  const sortedPrices = activeVariants
    .map((variant) => Number(variant.salePrice ?? 0))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  return {
    publicStock,
    salePrice: sortedPrices[0] ?? Number(product.salePrice ?? 0),
  };
}
