import { Badge } from '@/components/ui/badge';
import { getStockAlert, getStockAlertLabel } from '@/lib/admin/calculations';
import type { Product, ProductStatus } from '@/lib/admin/types';

const productStatusLabels: Record<ProductStatus, string> = {
  active: 'Activo',
  draft: 'Borrador',
  archived: 'Archivado',
};

export function StockBadge({ product }: { product: Product }) {
  const alert = getStockAlert(product);

  if (alert === 'out') {
    return (
      <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
        {getStockAlertLabel(alert)}
      </Badge>
    );
  }

  if (alert === 'low') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
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
