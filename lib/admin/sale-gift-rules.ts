import type { Product } from '@/lib/admin/types';

export type SaleGiftCategory = 'guantes' | 'estuches' | 'extensiones' | 'parachoques';

export const saleGiftCategories: SaleGiftCategory[] = ['guantes', 'estuches', 'extensiones', 'parachoques'];

function normalizeProductGiftRuleSource(product: Pick<Product, 'name' | 'brand' | 'subcategory' | 'category'>) {
  return `${product.name} ${product.brand} ${product.subcategory} ${product.category}`
    .trim()
    .toLowerCase();
}

export function getSaleGiftCategoryKey(product: Pick<Product, 'category' | 'subcategory'>) {
  if (product.category === 'guantes') return 'guantes';
  if (product.category === 'estuches') return 'estuches';
  if (product.category === 'extensiones') return 'extensiones';
  if (
    product.category === 'cauchos-para-tacos' &&
    product.subcategory.trim().toLowerCase() === 'parachoques'
  ) {
    return 'parachoques';
  }

  return null;
}

export function getAllowedSaleGiftCategories(
  product: Pick<Product, 'category' | 'name' | 'brand' | 'subcategory'>
): SaleGiftCategory[] {
  if (product.category !== 'tacos') return [];

  const normalized = normalizeProductGiftRuleSource(product);
  const isRestrictedSimpleCue =
    normalized.includes('sibote') ||
    normalized.includes('sencillo') ||
    normalized.includes('predador sencillo') ||
    normalized.includes('predator sencillo');

  if (isRestrictedSimpleCue) {
    return ['guantes', 'estuches'];
  }

  return saleGiftCategories;
}

export function formatSaleGiftCategoryList(categories: SaleGiftCategory[]) {
  const labels: Record<SaleGiftCategory, string> = {
    guantes: 'guante',
    estuches: 'estuche',
    extensiones: 'extension',
    parachoques: 'parachoque',
  };

  const items = categories.map((category) => labels[category]);
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
