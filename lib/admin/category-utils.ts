import type { CategoryOption, ProductCategoryRecord } from '@/lib/admin/types';

export function slugifyCategoryKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toCategoryOptions(
  categories: ProductCategoryRecord[],
  options?: {
    includeInactive?: boolean;
    selectedCategoryId?: string;
    selectedSubcategoryLabel?: string;
  }
): CategoryOption[] {
  const includeInactive = options?.includeInactive ?? false;

  return categories
    .filter((category) => {
      if (includeInactive) return true;
      return category.status === 'active' || category.id === options?.selectedCategoryId;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'es'))
    .map((category) => ({
      id: category.id,
      label: category.label,
      subcategories: category.subcategories
        .filter((subcategory) => {
          if (includeInactive) return true;
          return (
            subcategory.status === 'active' ||
            (category.id === options?.selectedCategoryId &&
              subcategory.label === options?.selectedSubcategoryLabel)
          );
        })
        .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'es'))
        .map((subcategory) => subcategory.label),
    }));
}

export function getCategoryLabel(
  categories: ProductCategoryRecord[],
  categoryId: string
) {
  return categories.find((category) => category.id === categoryId)?.label ?? categoryId;
}

export function getSubcategoryLabel(
  categories: ProductCategoryRecord[],
  categoryId: string,
  subcategoryLabel: string
) {
  return (
    categories
      .find((category) => category.id === categoryId)
      ?.subcategories.find((subcategory) => subcategory.label === subcategoryLabel)
      ?.label ?? subcategoryLabel
  );
}
