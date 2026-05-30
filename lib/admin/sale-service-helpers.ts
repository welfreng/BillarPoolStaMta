import type { Product, SaleServiceItem } from '@/lib/admin/types';
import { matchesProductCategoryFamily } from '@/lib/admin/category-rules';

export function supportsInstallationService(product: Pick<Product, 'category'> | null | undefined) {
  return (
    matchesProductCategoryFamily(product, 'tacos') ||
    matchesProductCategoryFamily(product, 'casquillos') ||
    matchesProductCategoryFamily(product, 'virolas') ||
    matchesProductCategoryFamily(product, 'extensiones')
  );
}

export function createDefaultInstallationServiceItem(product?: Pick<Product, 'category'> | null): SaleServiceItem {
  const serviceType = matchesProductCategoryFamily(product, 'virolas')
    ? 'ferrule-installation'
    : matchesProductCategoryFamily(product, 'extensiones')
      ? 'extension-installation'
      : 'tip-installation';

  return {
    serviceType,
    serviceCategory: 'torno',
    price: 0,
    cost: 0,
    cueReference: '',
    notes: '',
  };
}
