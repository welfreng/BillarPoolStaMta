import { ArrowDownLeft, ArrowUpRight, ClipboardPenLine, PackagePlus } from 'lucide-react';
import { formatDateTime, formatNumber, getProductById } from '@/lib/admin/calculations';
import type { InventoryMovement, Product } from '@/lib/admin/types';

const icons = {
  purchase: PackagePlus,
  entry: ArrowUpRight,
  exit: ArrowDownLeft,
  adjustment: ClipboardPenLine,
};

export function RecentMovements({
  products,
  movements,
}: {
  products: Product[];
  movements: InventoryMovement[];
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-950">Ultimos movimientos</h2>
        <p className="text-sm text-slate-500">Actividad reciente del inventario y ajustes operativos.</p>
      </div>

      <div className="space-y-4">
        {movements.map((movement) => {
          const product = getProductById(products, movement.productId);
          const Icon = icons[movement.type];

          return (
            <div
              key={movement.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-white p-3 shadow-sm">
                  <Icon className="h-4 w-4 text-cyan-700" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">{product?.name ?? 'Producto eliminado'}</p>
                  <p className="text-sm text-slate-500">{movement.notes || 'Movimiento registrado'}</p>
                </div>
              </div>

              <div className="flex flex-col items-start gap-1 text-sm md:items-end">
                <p className="font-semibold text-slate-900">
                  {movement.quantity > 0 ? '+' : ''}
                  {formatNumber(movement.quantity)} uds
                </p>
                <p className="text-slate-500">{formatDateTime(movement.occurredAt)}</p>
                <p className="text-slate-400">{movement.responsibleUser}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
