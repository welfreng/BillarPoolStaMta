import type { CategoryOption, PresentationKind, ProductPresentation } from '@/lib/admin/types';

export const inventoryCategories: CategoryOption[] = [
  {
    id: 'tacos',
    label: 'Tacos',
    subcategories: ['Por marca', 'Madera', 'Fibra de carbono', 'Break cue'],
  },
  {
    id: 'tizas',
    label: 'Tizas',
    subcategories: ['Por unidad', 'Caja de 12', 'Premium', 'Profesional'],
  },
  {
    id: 'guantes',
    label: 'Guantes',
    subcategories: ['Por unidad', 'Docena', '3 dedos', 'Full hand'],
  },
  {
    id: 'estuches',
    label: 'Estuches',
    subcategories: ['Rigidos', 'Semirigidos', '1x1', '2x4'],
  },
  {
    id: 'panos-de-billar',
    label: 'Panos de billar',
    subcategories: ['Pool', 'Carambola', 'Profesional', 'Mesa completa'],
  },
  {
    id: 'casquillos-o-suelas',
    label: 'Casquillos o suelas',
    subcategories: ['Blandas', 'Medias', 'Duras', 'Kit de repuesto'],
  },
  {
    id: 'virolas',
    label: 'Virolas',
    subcategories: ['ABS', 'Fibra', 'Metal', 'Perillas'],
  },
  {
    id: 'supresores',
    label: 'Supresores',
    subcategories: ['Rosca rapida', 'Universal', 'Goma tecnica'],
  },
  {
    id: 'cauchos-para-tacos',
    label: 'Cauchos para tacos',
    subcategories: ['Base', 'Antideslizante', 'Rosca', 'Silicona'],
  },
  {
    id: 'extensiones',
    label: 'Extensiones',
    subcategories: ['Rosca corta', 'Rosca larga', 'Universal'],
  },
  {
    id: 'perillas',
    label: 'Perillas / virolas perillas',
    subcategories: ['Decorativas', 'Repuesto', 'Premium'],
  },
  {
    id: 'accesorios',
    label: 'Accesorios',
    subcategories: ['Triangulos', 'Guarda tacos', 'Cepillos', 'Miscelanea'],
  },
];

export const availableBrands = [
  'Predator',
  'Cuetec',
  'Kamui',
  'Taom',
  'Longoni',
  'BillKing',
  'Molinari',
  'Master',
  'Silver Cup',
  'Accesorios SPSM',
];

export const presentationOptions: ProductPresentation[] = [
  { id: 'unit', label: 'Unidad', kind: 'unit', units: 1, isDefault: true },
  { id: 'dozen', label: 'Docena', kind: 'dozen', units: 12 },
  { id: 'box-12', label: 'Caja de 12', kind: 'box-12', units: 12 },
];

export const presentationKindLabels: Record<PresentationKind, string> = {
  unit: 'Unidad',
  dozen: 'Docena',
  'box-12': 'Caja de 12',
};

export function getCategoryLabel(categoryId: string) {
  return inventoryCategories.find((category) => category.id === categoryId)?.label ?? categoryId;
}
