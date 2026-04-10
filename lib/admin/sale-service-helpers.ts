import type { Product, SaleServiceItem } from '@/lib/admin/types';

export function supportsInstallationService(product: Pick<Product, 'category'> | null | undefined) {
  return product?.category === 'casquillos-o-suelas';
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
