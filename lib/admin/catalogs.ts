import type { PresentationKind } from '@/lib/admin/types';
import {
  isChalkProduct,
  isPackOf12Presentation,
  matchesCategoryFamily,
  usesClearTypeDimension,
} from '@/lib/admin/category-rules';

export type ProductVariantTemplateMode =
  | 'single-axis-list'
  | 'manual-combinations'
  | 'auto-combinations';

export interface VariantSuggestion {
  attributes: Array<{
    label: string;
    options: string[];
  }>;
}

export interface ProductVariantTemplateAttribute {
  label: string;
  key: string;
  options: string[];
}

export interface ProductVariantTemplateEditorConfig {
  kind: 'compact-table';
  priceMode?: 'global' | 'per-variant';
  creationMode?: 'manual-rows' | 'selection-driven';
  fixedAttributes?: string[];
  searchableAttributes?: string[];
  allowCustomValuesFor?: string[];
  hiddenColumns?: Array<'sku' | 'status'>;
}

export interface ProductVariantTemplate {
  id: string;
  label: string;
  helper: string;
  mode: ProductVariantTemplateMode;
  attributes: ProductVariantTemplateAttribute[];
  editor?: ProductVariantTemplateEditorConfig;
  allowAttributeEditing?: boolean;
}

function createCompactSelectionEditor(config: Partial<ProductVariantTemplateEditorConfig> = {}): ProductVariantTemplateEditorConfig {
  return {
    kind: 'compact-table',
    creationMode: 'selection-driven',
    hiddenColumns: ['sku', 'status'],
    ...config,
  };
}

function createCompactManualEditor(config: Partial<ProductVariantTemplateEditorConfig> = {}): ProductVariantTemplateEditorConfig {
  return {
    kind: 'compact-table',
    creationMode: 'manual-rows',
    hiddenColumns: ['sku', 'status'],
    ...config,
  };
}

function getVirolaColorOptions(subcategory: string) {
  const normalizedSubcategory = subcategory.trim().toLowerCase();

  if (normalizedSubcategory === 'transparente') {
    return ['Transparente'];
  }

  if (normalizedSubcategory === 'abs fibra' || normalizedSubcategory === 'abs teflon') {
    return ['Blanca', 'Negra'];
  }

  if (normalizedSubcategory === 'acrilica confite') {
    return ['Blanca', 'Negra', 'Azul', 'Verde', 'Roja', 'Amarilla', 'Morada', 'Rosada', 'Salmon'];
  }

  if (normalizedSubcategory === 'teflon confite') {
    return ['Blanca', 'Negra', 'Azul', 'Verde', 'Roja', 'Amarilla'];
  }

  return ['Blanca', 'Negra', 'Transparente'];
}

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
  'ferrule-installation': 'Instalacion de virola',
  'tip-ferrule-installation': 'Instalacion de casquillo y virola',
  'extension-installation': 'Instalacion de extension',
  'shaft-reduction': 'Rebajada de flecha',
  'shaft-straightening': 'Enderezada de flecha',
  'custom-turning': 'Trabajo personalizado de torno',
} as const;

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

export function getProductVariantTemplate(input: {
  name: string;
  category: string;
  subcategory: string;
  brand: string;
}): ProductVariantTemplate | null {
  const name = input.name.trim().toLowerCase();
  const brand = input.brand.trim().toLowerCase();
  const category = input.category.trim().toLowerCase();
  const subcategory = input.subcategory.trim().toLowerCase();
  const colorSignals = ['color', 'colores', 'rojo', 'roja', 'azul', 'verde', 'amarillo', 'negro', 'blanco'];
  const combinedSignals = `${name} ${brand} ${category}`.trim();
  const isCasquilloCategory = matchesCategoryFamily(category, 'casquillos');
  const looksLikeChalkBox =
    isPackOf12Presentation({ name: input.name, subcategory: input.subcategory }) &&
    (isChalkProduct({ ...input, saleMode: 'simple', variants: [] }) ||
      combinedSignals.includes('royal') ||
      combinedSignals.includes('master') ||
      combinedSignals.includes('silver cup'));

  if (matchesCategoryFamily(category, 'guantes') && subcategory !== 'paquete x 12') {
    const isShortFingerProduct =
      name.includes('dedos cortos') ||
      name.includes('dedo corto') ||
      subcategory.includes('3 dedos');
    const isRegularFingerProduct =
      name.includes('dedos normales') ||
      name.includes('dedo normal') ||
      name.includes('normal') ||
      name.includes('dedos completos') ||
      name.includes('completo') ||
      subcategory.includes('dedos completos');

    const colorOptions = isRegularFingerProduct
      ? ['Azul Cielo', 'Negro', 'Azul Turqui', 'Rojo', 'Vinotinto']
      : ['Azul Cielo', 'Negro', 'Azul Turqui', 'Rojo'];

    return {
      id: isShortFingerProduct ? 'guantes-mano-color-3-dedos' : 'guantes-mano-color-completos',
      label: 'Guantes por mano y color',
      helper: 'Captura solo las variantes reales del producto en una tabla compacta y reutilizable.',
      mode: 'manual-combinations',
      editor: {
        kind: 'compact-table',
        priceMode: 'global',
        creationMode: 'manual-rows',
        searchableAttributes: ['color'],
        allowCustomValuesFor: ['color'],
        hiddenColumns: ['sku', 'status'],
      },
      attributes: [
        { label: 'Mano', key: 'mano', options: ['Izquierda', 'Derecha'] },
        { label: 'Color', key: 'color', options: colorOptions },
      ],
    };
  }

  if (isCasquilloCategory) {
    const isExplicitColorTip =
      colorSignals.some((signal) => name.includes(signal) || subcategory.includes(signal)) &&
      !name.includes('ok healing');
    const isPerillaTip = subcategory.includes('perilla');
    const hasClearTypeDimension = !isPerillaTip || usesClearTypeDimension(input);

    return {
      id: hasClearTypeDimension ? 'casquillos-tipo-dureza' : 'casquillos-escalable',
      label: hasClearTypeDimension ? 'Casquillos por tipo y dureza' : 'Casquillos escalables',
      helper:
        'Empieza con los atributos que aplican hoy y agrega otros despues si la familia crece, sin cambiar la arquitectura.',
      mode: 'manual-combinations',
      editor: createCompactManualEditor({
        priceMode: hasClearTypeDimension ? 'per-variant' : 'global',
        searchableAttributes: ['tipo', 'dureza', 'tamano', 'color', 'medida', 'presentacion'],
        allowCustomValuesFor: ['tipo', 'dureza', 'tamano', 'color', 'medida', 'presentacion'],
        hiddenColumns: ['sku', 'status'],
      }),
      allowAttributeEditing: true,
      attributes: hasClearTypeDimension
        ? [
            { label: 'Tipo', key: 'tipo', options: ['Clear', 'Sin clear'] },
            { label: 'Dureza', key: 'dureza', options: ['SS', 'S', 'M', 'H'] },
          ]
        : isPerillaTip
          ? [{ label: 'Tamano', key: 'tamano', options: ['11 mm', '11.5 mm', '12 mm', '12.5 mm', '13 mm'] }]
          : isExplicitColorTip
            ? [{ label: 'Color', key: 'color', options: ['Rojo', 'Azul', 'Transparente', 'Amarillo'] }]
            : [{ label: 'Dureza', key: 'dureza', options: ['SS', 'S', 'M', 'H'] }],
    };
  }

  if (matchesCategoryFamily(category, 'virolas')) {
    if (name.includes('g10') || subcategory.includes('g10')) {
      return {
        id: 'virolas-g10',
        label: 'Virolas G10',
        helper: 'Gestiona las virolas por tipo de perforacion.',
        mode: 'single-axis-list',
        allowAttributeEditing: true,
        editor: createCompactSelectionEditor({
          priceMode: 'global',
        }),
        attributes: [{ label: 'Perforacion', key: 'perforacion', options: ['Cerrada', 'Abierta'] }],
      };
    }

    if (
      name.includes('juma') ||
      subcategory.includes('abs') ||
      subcategory.includes('teflon') ||
      subcategory.includes('transparente') ||
      name.includes('acrilic') ||
      subcategory.includes('acrilica') ||
      subcategory.includes('confite')
    ) {
      return {
        id: 'virolas-color',
        label: 'Jumas y virolas de color',
        helper: 'Agrega solo los colores reales de esta virola para no mezclar acabados ni inventario.',
        mode: 'single-axis-list',
        allowAttributeEditing: true,
        attributes: [
          {
            label: 'Color',
            key: 'color',
            options: getVirolaColorOptions(input.subcategory),
          },
        ],
      };
    }
  }

  if (matchesCategoryFamily(category, 'supresores')) {
    return {
      id: 'supresores-color',
      label: 'Supresores por color',
      helper: 'Registra una fila por color o acabado, por ejemplo transparente o negro.',
      mode: 'single-axis-list',
      allowAttributeEditing: true,
      attributes: [
        {
          label: 'Color',
          key: 'color',
          options: ['Transparente', 'Rojo', 'Azul'],
        },
      ],
    };
  }

  if (matchesCategoryFamily(category, 'empunadura') && subcategory === 'grip') {
    return {
      id: 'grips-color',
      label: 'Grips por color',
      helper: 'Agrega solo los colores reales del grip, igual que en el flujo de guantes.',
      mode: 'single-axis-list',
      allowAttributeEditing: true,
      attributes: [
        {
          label: 'Color',
          key: 'color',
          options: ['Rojo', 'Azul', 'Verde', 'Naranja', 'Morado', 'Gris'],
        },
      ],
    };
  }

  if (matchesCategoryFamily(category, 'accesorios') && subcategory === 'porta tizas') {
    return {
      id: 'porta-tizas-color',
      label: 'Porta tizas por color',
      helper: 'Registra una fila por color para mostrar disponibilidad real.',
      mode: 'single-axis-list',
      allowAttributeEditing: true,
      attributes: [
        {
          label: 'Color',
          key: 'color',
          options: ['Negro', 'Rojo', 'Azul', 'Verde', 'Blanco', 'Morado'],
        },
      ],
    };
  }

  if (looksLikeChalkBox) {
    return {
      id: 'tizas-caja-color',
      label: 'Tizas por color',
      helper: 'Agrega solo los colores reales que manejas para esta caja de 12.',
      mode: 'single-axis-list',
      allowAttributeEditing: true,
      attributes: [
        {
          label: 'Color',
          key: 'color',
          options: [],
        },
      ],
    };
  }

  if (matchesCategoryFamily(category, 'tacos') && (brand.includes('yfen') || name.includes('yfen'))) {
    return {
      id: 'tacos-yfen',
      label: 'Tacos Yfen',
      helper: 'Empieza con los atributos que apliquen hoy y agrega tus propios valores sin quedar amarrado a una lista fija.',
      mode: 'manual-combinations',
      editor: createCompactManualEditor({
        priceMode: 'global',
        searchableAttributes: ['modelo'],
        allowCustomValuesFor: ['modelo', 'color', 'diametro'],
      }),
      allowAttributeEditing: true,
      attributes: [
        { label: 'Modelo', key: 'modelo', options: [] },
        { label: 'Color', key: 'color', options: ['Negro', 'Blanco', 'Rojo', 'Azul', 'Gris'] },
        {
          label: 'Diametro',
          key: 'diametro',
          options: ['11.5 mm', '11.75 mm', '12 mm', '12.4 mm', '12.5 mm', '12.75 mm', '13 mm'],
        },
      ],
    };
  }

  return null;
}

export function getVariantSuggestion(input: {
  name: string;
  category: string;
  subcategory: string;
  brand: string;
}): VariantSuggestion | null {
  const template = getProductVariantTemplate(input);
  if (!template) return null;

  return {
    attributes: template.attributes.map((attribute) => ({
      label: attribute.label,
      options: attribute.options,
    })),
  };
}
