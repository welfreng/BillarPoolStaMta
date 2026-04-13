import type { Product } from '@/lib/admin/types';
import { slugifyCategoryKey } from '@/lib/admin/category-utils';

export type ProductCategoryFamily =
  | 'tacos'
  | 'tizas'
  | 'guantes'
  | 'estuches'
  | 'casquillos'
  | 'virolas'
  | 'supresores'
  | 'empunadura'
  | 'accesorios'
  | 'extensiones'
  | 'parachoques';

type ProductRuleSource = Pick<Product, 'category' | 'subcategory' | 'name' | 'brand' | 'saleMode' | 'variants'>;

const categoryFamilyAliases: Record<ProductCategoryFamily, string[]> = {
  tacos: ['tacos'],
  tizas: ['tizas'],
  guantes: ['guantes'],
  estuches: ['estuches'],
  casquillos: ['casquillos'],
  virolas: ['virolas'],
  supresores: ['supresores'],
  empunadura: ['empunadura'],
  accesorios: ['accesorios'],
  extensiones: ['extensiones'],
  parachoques: ['parachoques'],
};

function normalizeValue(value: string) {
  return slugifyCategoryKey(value);
}

function normalizeSearchSource(input: Pick<ProductRuleSource, 'name' | 'brand' | 'subcategory' | 'category'>) {
  return `${input.name} ${input.brand} ${input.subcategory} ${input.category}`.trim().toLowerCase();
}

export function matchesCategoryFamily(category: string, family: ProductCategoryFamily) {
  const normalizedCategory = normalizeValue(category);
  return categoryFamilyAliases[family].some((alias) => normalizeValue(alias) === normalizedCategory);
}

export function matchesProductCategoryFamily(
  product: Pick<ProductRuleSource, 'category'> | null | undefined,
  family: ProductCategoryFamily
) {
  return Boolean(product?.category && matchesCategoryFamily(product.category, family));
}

export function filterProductsByCategoryFamily<T extends { category: string; status: string }>(
  products: T[],
  family: ProductCategoryFamily
) {
  return products.filter(
    (product) => product.status === 'active' && matchesProductCategoryFamily(product, family)
  );
}

export function isChalkProduct(input: ProductRuleSource | null | undefined) {
  if (!input) return false;
  if (matchesProductCategoryFamily(input, 'tizas')) return true;

  const normalized = normalizeSearchSource(input);
  return normalized.includes('tiza') || normalized.includes('tizas') || normalized.includes('chalk');
}

export function isPackOf12Presentation(input: Pick<ProductRuleSource, 'name' | 'subcategory'> | null | undefined) {
  if (!input) return false;

  const normalizedName = input.name.trim().toLowerCase();
  const normalizedSubcategory = input.subcategory.trim().toLowerCase();

  return (
    /x\s*12\b/.test(normalizedName) ||
    /x\s*12\b/.test(normalizedSubcategory) ||
    normalizedSubcategory === 'docena'
  );
}

export function shouldNormalizePackPurchaseToBundle(product: ProductRuleSource | null | undefined) {
  if (!product) return false;
  if (!isPackOf12Presentation(product)) return false;

  const hasVariants = (product.variants?.length ?? 0) > 0 || product.saleMode === 'varianted';
  return !hasVariants;
}

export function usesClearTypeDimension(input: Pick<ProductRuleSource, 'name' | 'subcategory'> | null | undefined) {
  if (!input) return false;

  const normalizedName = input.name.trim().toLowerCase();
  const normalizedSubcategory = input.subcategory.trim().toLowerCase();

  return (
    normalizedName.includes('clear') ||
    normalizedSubcategory.includes('clear') ||
    normalizedName.includes('sin clear') ||
    normalizedSubcategory.includes('sin clear')
  );
}
