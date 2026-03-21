import { Badge } from '@/components/ui/badge';
import { getStockAlert, getStockAlertLabel } from '@/lib/admin/calculations';
import type { InventoryMovement, MovementReason, Product, ProductStatus } from '@/lib/admin/types';

const productStatusLabels: Record<ProductStatus, string> = {
  active: 'Activo',
  draft: 'Borrador',
  archived: 'Archivado',
};

export function StockBadge({
  product,
  movements,
}: {
  product: Product;
  movements: InventoryMovement[];
}) {
  const alert = getStockAlert(product, movements);

  if (alert === 'out') {
    return (
      <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
        {getStockAlertLabel(alert)}
      </Badge>
    );
  }

  return (
    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
      {getStockAlertLabel(alert)}
    </Badge>
  );
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const label = productStatusLabels[status];

  if (status === 'active') {
    return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">{label}</Badge>;
  }

  if (status === 'draft') {
    return <Badge variant="outline">{label}</Badge>;
  }

  return <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200">{label}</Badge>;
}

export function MovementReasonBadge({ reason }: { reason: MovementReason }) {
  if (reason === 'return') {
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Devolucion</Badge>;
  }

  if (reason === 'gift') {
    return <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">Obsequio</Badge>;
  }

  if (reason === 'sale') {
    return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Venta</Badge>;
  }

  if (reason === 'purchase') {
    return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Compra</Badge>;
  }

  return <Badge variant="outline">{reason}</Badge>;
}
