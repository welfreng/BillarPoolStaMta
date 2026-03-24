import type { QuerySnapshot, DocumentData } from 'firebase/firestore';

export interface CatalogImageOverrideMaps {
  byProductId: Record<string, string>;
  byProductName: Record<string, string>;
}

export function normalizeCatalogImageName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCatalogImageOverrides(
  snapshot: QuerySnapshot<DocumentData>
): CatalogImageOverrideMaps {
  const legacyImages: Record<string, string> = {};
  const productImages: Record<string, string> = {};
  const productNameImages: Record<string, string> = {};

  snapshot.docs.forEach((item) => {
    if (item.id === 'catalog-images') {
      const data = item.data();
      if (data && typeof data === 'object' && data.images && typeof data.images === 'object') {
        Object.assign(legacyImages, data.images as Record<string, string>);
      }
      return;
    }

    if (!item.id.startsWith('catalog-image-')) return;
    const data = item.data();
    const productId = String(data.productId ?? item.id.replace('catalog-image-', ''));
    const image = data.image;
    const productNameKey = normalizeCatalogImageName(String(data.productName ?? data.name ?? ''));
    if (typeof image === 'string' && productId) {
      productImages[productId] = image;
    }
    if (typeof image === 'string' && productNameKey) {
      productNameImages[productNameKey] = image;
    }
  });

  return {
    byProductId: {
      ...legacyImages,
      ...productImages,
    },
    byProductName: productNameImages,
  };
}

export function resolveCatalogImageOverride(
  productId: string,
  productName: string,
  baseImage: string,
  overrides: CatalogImageOverrideMaps
) {
  return (
    overrides.byProductId[productId] ||
    overrides.byProductName[normalizeCatalogImageName(productName)] ||
    baseImage
  );
}
