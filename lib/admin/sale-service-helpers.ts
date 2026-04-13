import type { Product, SaleServiceItem } from '@/lib/admin/types';
import { matchesProductCategoryFamily } from '@/lib/admin/category-rules';

export function supportsInstallationService(product: Pick<Product, 'category'> | null | undefined) {
  return matchesProductCategoryFamily(product, 'casquillos');
}

export function createDefaultInstallationServiceItem(): SaleServiceItem {
  return {
    serviceType: 'tip-installation',
    serviceCategory: 'torno',
    price: 0,
    cost: 0,
    cueReference: '',
    notes: '',
  };
}
