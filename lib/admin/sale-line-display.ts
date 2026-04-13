import type { Product, ProductVariant, SaleLineItem } from '@/lib/admin/types';

function findVariant(product: Product | undefined, variantId?: string, variantName?: string) {
  if (!product) return null;

  if (variantId) {
    return product.variants?.find((variant) => variant.id === variantId) ?? null;
  }

  if (variantName) {
    const normalized = variantName.trim().toLowerCase();
    return (
      product.variants?.find((variant) => {
        const values = [variant.name, variant.displayName, ...(variant.attributeValues ?? [])]
          .map((value) => String(value ?? '').trim().toLowerCase())
          .filter(Boolean);
        return values.includes(normalized);
      }) ?? null
    );
  }

  return null;
}

export function getSaleLineResolvedVariant(
  product: Product | undefined,
  item: Pick<SaleLineItem, 'variantId' | 'variantName'>
) {
  return findVariant(product, item.variantId, item.variantName);
}

export function getSaleLineVariantLabel(
  product: Product | undefined,
  item: Pick<SaleLineItem, 'variantId' | 'variantName'>
) {
  const variant = getSaleLineResolvedVariant(product, item);
  return item.variantName?.trim() || variant?.displayName || variant?.name || '';
}

export function getSaleLineDisplayName(
  product: Product | undefined,
  item: Pick<SaleLineItem, 'variantId' | 'variantName'>
) {
  const productName = product?.name ?? 'Producto';
  const variantLabel = getSaleLineVariantLabel(product, item);
  return variantLabel ? `${productName} - ${variantLabel}` : productName;
}

export function getSaleLineVariantSku(
  variant: ProductVariant | null | undefined
) {
  return variant?.sku?.trim() ?? '';
}
