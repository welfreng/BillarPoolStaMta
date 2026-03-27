import type { CategoryOption, PresentationKind } from '@/lib/admin/types';

export const movementTypeLabels = {
  entry: 'Entrada',
  exit: 'Salida',
  adjustment: 'Ajuste',
  purchase: 'Compra',
} as const;

export const movementReasonLabels = {
  purchase: 'Compra',
  sale: 'Venta',
  service: 'Servicio de torno',
  gift: 'Obsequio',
  return: 'Devolucion',
  'manual-adjustment': 'Ajuste manual',
  damage: 'Producto danado',
  'initial-load': 'Carga inicial',
  transfer: 'Traslado interno',
} as const;

export const movementReasonsByType = {
  entry: ['purchase', 'initial-load', 'transfer'],
  exit: ['sale', 'service', 'gift', 'damage', 'transfer'],
  adjustment: ['manual-adjustment'],
} as const;

export const serviceTypeLabels = {
  'tip-installation': 'Instalacion de casquillo',
  'tip-ferrule-installation': 'Instalacion de casquillo y virola',
  'extension-installation': 'Instalacion de extension',
} as const;

export const inventoryCategories: CategoryOption[] = [
  {
    id: 'tacos',
    label: 'Tacos',
    subcategories: ['Grafito', 'Madera', 'Fibra de carbono', 'Break cue'],
  },
  {
    id: 'tizas',
    label: 'Tizas',
    subcategories: ['Por unidad', 'Caja x 12', 'Caja x 81','Caja x 144' ],
  },
  {
    id: 'guantes',
    label: 'Guantes',
    subcategories: ['Dedos completos', '3 Dedos', 'Paquete x 12'],
  },
  {
    id: 'estuches',
    label: 'Estuches',
    subcategories: ['Tubular', 'Cajon', 'Lona', 'Mochila'],
  },
  {
    id: 'panos-de-billar',
    label: 'Panos de billar',
    subcategories: ['Pool', 'Carambola', 'Mesa 9 pies'],
  },
  {
    id: 'casquillos-o-suelas',
    label: 'Casquillos o suelas',
    subcategories: ['Importados', 'Caja x 50', 'Casquillos Perilla'],
  },
  {
    id: 'virolas',
    label: 'Virolas',
    subcategories: ['ABS Fibra', 'ABS Teflon', 'Transparente', 'Acrilica Confite', 'Teflon Confite'],
  },
  {
    id: 'supresores',
    label: 'Supresores',
    subcategories: [],
  },
  {
    id: 'cauchos-para-tacos',
    label: 'Cauchos para tacos',
    subcategories: ['Parachoques', 'Cauchos Sencillos'],
  },
  {
    id: 'extensiones',
    label: 'Extensiones',
    subcategories: ['Sencilla', 'Expandible'],
  },
  {
    id: 'empunadura',
    label: 'Empunadura',
    subcategories: ['Grip'],
  },
  {
    id: 'accesorios',
    label: 'Accesorios',
    subcategories: [
      'Triangulos',
      'Cepillos',
      'Porta Tizas',
      'Cera brilladora',
      'Brilladoras de Flechas',
      'Pica Casquillos',
    ],
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

export const presentationOptions = [
  { id: 'unit', label: 'Unidad', kind: 'unit', units: 1, isDefault: true },
  { id: 'dozen', label: 'Docena', kind: 'dozen', units: 12 },
  { id: 'box-12', label: 'Caja de 12', kind: 'box-12', units: 12 },
];

export const presentationKindLabels: Record<PresentationKind, string> = {
  unit: 'Unidad',
  dozen: 'Docena',
  'box-12': 'Caja de 12',
};

export const presentationKindUnits: Record<PresentationKind, number> = {
  unit: 1,
  dozen: 12,
  'box-12': 12,
};

export function getCategoryLabel(categoryId: string) {
  return inventoryCategories.find((category) => category.id === categoryId)?.label ?? categoryId;
}
