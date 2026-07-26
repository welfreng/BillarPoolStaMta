import type { QuerySnapshot, DocumentData } from 'firebase/firestore';

export interface CatalogGalleryImage {
  id: string;
  image: string;
  label?: string;
  sortOrder: number;
}

export interface CatalogImageOverrideMaps {
  byProductId: Record<string, string>;
  byProductName: Record<string, string>;
  byVariantKey: Record<string, string>;
  galleryByProductId: Record<string, CatalogGalleryImage[]>;
}

export function buildCatalogVariantImageKey(productId: string, variantId: string) {
  return `${productId}::${variantId}`;
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
  const variantImages: Record<string, string> = {};
  const productGalleries: Record<string, CatalogGalleryImage[]> = {};

  snapshot.docs.forEach((item) => {
    if (item.id.startsWith('catalog-gallery-')) {
      const data = item.data();
      const productId = String(data.productId ?? item.id.replace('catalog-gallery-', ''));
      const images = Array.isArray(data.images)
        ? data.images
            .map((galleryItem: unknown, index: number): CatalogGalleryImage | null => {
              if (typeof galleryItem === 'string') {
                return {
                  id: `gallery-${index + 1}`,
                  image: galleryItem,
                  sortOrder: index,
                };
              }

              if (!galleryItem || typeof galleryItem !== 'object') return null;
              const record = galleryItem as Record<string, unknown>;
              const image = record.image;
              if (typeof image !== 'string' || !image) return null;

              return {
                id: String(record.id ?? `gallery-${index + 1}`),
                image,
                label: typeof record.label === 'string' ? record.label : undefined,
                sortOrder: Number(record.sortOrder ?? index),
              };
            })
            .filter((galleryItem): galleryItem is CatalogGalleryImage => Boolean(galleryItem))
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .slice(0, 5)
        : [];

      if (productId && images.length > 0) {
        productGalleries[productId] = images;
      }
      return;
    }

    if (item.id === 'catalog-images') {
      const data = item.data();
      if (data && typeof data === 'object' && data.images && typeof data.images === 'object') {
        Object.assign(legacyImages, data.images as Record<string, string>);
      }
      return;
    }

    if (!item.id.startsWith('catalog-image-')) return;
    if (item.id.startsWith('catalog-variant-image-')) {
      const data = item.data();
      const productId = String(data.productId ?? '');
      const variantId = String(data.variantId ?? '');
      const image = data.image;
      if (typeof image === 'string' && productId && variantId) {
        variantImages[buildCatalogVariantImageKey(productId, variantId)] = image;
      }
      return;
    }

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
    byVariantKey: variantImages,
    galleryByProductId: productGalleries,
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

export function resolveCatalogVariantImageOverride(
  productId: string,
  variantId: string,
  baseImage: string,
  overrides: CatalogImageOverrideMaps
) {
  return overrides.byVariantKey[buildCatalogVariantImageKey(productId, variantId)] || baseImage;
}

export function resolveCatalogGalleryImages(
  productId: string,
  overrides: CatalogImageOverrideMaps
) {
  return overrides.galleryByProductId?.[productId] ?? [];
}
