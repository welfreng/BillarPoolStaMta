'use client';

import { useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { ProductFormDialog, type ProductFormValues } from '@/components/admin/products/product-form-dialog';
import { ProductStatusBadge, StockBadge } from '@/components/admin/shared/status-badges';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber } from '@/lib/admin/calculations';
import { getCategoryLabel, inventoryCategories, presentationOptions } from '@/lib/admin/catalogs';
import type { Product } from '@/lib/admin/types';

const pageSize = 6;

export default function ProductosPage() {
  const { products, createProduct, updateProduct, deleteProduct } = useAdminData();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [saleType, setSaleType] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(products[0]);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesQuery =
        [product.name, product.sku, product.brand, product.category, product.subcategory]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase());
      const matchesCategory = category === 'all' || product.category === category;
      const matchesSaleType = saleType === 'all' || product.saleType === saleType;
      const matchesStatus = status === 'all' || product.status === status;

      return matchesQuery && matchesCategory && matchesSaleType && matchesStatus;
    });
  }, [category, products, query, saleType, status]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  const handleSave = (values: ProductFormValues) => {
    const presentationMap = new Map(
      presentationOptions
        .filter(
          (option) =>
            option.kind === values.purchasePresentation || option.kind === values.salePresentation
        )
        .map((option) => [option.id, option])
    );

    const payload = {
      ...values,
      presentations: [...presentationMap.values()],
    };

    if (editingProduct) {
      const updated = updateProduct(editingProduct.id, payload);
      if (updated) {
        setSelectedProduct(updated);
        toast({ title: 'Producto actualizado', description: 'Los cambios fueron guardados.' });
      }
    } else {
      const created = createProduct(payload);
      setSelectedProduct(created);
      toast({ title: 'Producto creado', description: 'El producto ya forma parte del inventario.' });
    }

    setEditingProduct(undefined);
    setOpenDialog(false);
  };

  const handleDelete = (product: Product) => {
    if (!window.confirm(`Deseas eliminar ${product.name}?`)) return;
    deleteProduct(product.id);
    setSelectedProduct(undefined);
    toast({ title: 'Producto eliminado', description: 'El registro fue removido del panel.' });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Modulo CRUD"
        title="Productos e inventario base"
        description="Administra el catalogo, costo unitario real, stock minimo, presentaciones comerciales y estado operativo de cada referencia."
        actions={
          <Button
            onClick={() => {
              setEditingProduct(undefined);
              setOpenDialog(true);
            }}
            className="rounded-xl"
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo producto
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => {
                  setPage(1);
                  setQuery(event.target.value);
                }}
                placeholder="Buscar por nombre, SKU, marca o categoria"
                className="pl-9"
              />
            </div>
            <Select
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorias</SelectItem>
                {inventoryCategories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="archived">Archivado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Select
              value={saleType}
              onValueChange={(value) => {
                setSaleType(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tipo de venta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="unit">Unidad</SelectItem>
                <SelectItem value="bundle">Presentacion</SelectItem>
                <SelectItem value="mixed">Mixto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {paginatedProducts.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Costo real</TableHead>
                    <TableHead>Venta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => (
                    <TableRow
                      key={product.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedProduct(product)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{product.name}</p>
                          <p className="text-xs text-slate-500">
                            {product.sku} · {product.brand}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-700">{getCategoryLabel(product.category)}</p>
                        <p className="text-xs text-slate-500">{product.subcategory}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{formatNumber(product.stockQuantity)}</p>
                        <StockBadge product={product} />
                      </TableCell>
                      <TableCell>{formatCurrency(product.realUnitCost)}</TableCell>
                      <TableCell>{formatCurrency(product.salePrice)}</TableCell>
                      <TableCell>
                        <ProductStatusBadge status={product.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setSelectedProduct(product)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              setEditingProduct(product);
                              setOpenDialog(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => handleDelete(product)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t pt-4 text-sm text-slate-500">
                <p>
                  Pagina {page} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>No encontramos productos</EmptyTitle>
                <EmptyDescription>
                  Ajusta los filtros o crea una nueva referencia para comenzar a construir el catalogo administrativo.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {selectedProduct ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-cyan-700">Detalle del producto</p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">{selectedProduct.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{selectedProduct.description}</p>
                </div>
                <StockBadge product={selectedProduct} />
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">SKU</p>
                  <p className="mt-1 font-semibold text-slate-900">{selectedProduct.sku}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Categoria</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {getCategoryLabel(selectedProduct.category)}
                    </p>
                    <p className="text-xs text-slate-500">{selectedProduct.subcategory}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Marca</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedProduct.brand}</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Stock / minimo</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatNumber(selectedProduct.stockQuantity)} /{' '}
                      {formatNumber(selectedProduct.stockMinimum)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Margen</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {selectedProduct.profitMargin.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Costo real</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatCurrency(selectedProduct.realUnitCost)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Precio de venta</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatCurrency(selectedProduct.salePrice)}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-cyan-50 p-4">
                  <p className="text-xs text-cyan-700">Presentaciones</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    Compra: {selectedProduct.purchasePresentation} · Venta: {selectedProduct.salePresentation}
                  </p>
                  <p className="text-xs text-slate-500">
                    Factor de conversion: {formatNumber(selectedProduct.conversionFactor)} unidades base
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Eye className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Selecciona un producto</EmptyTitle>
                <EmptyDescription>
                  Aqui veras su ficha rapida, costo real, stock, ubicacion y presentaciones configuradas.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </aside>
      </div>

      <ProductFormDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        initialProduct={editingProduct}
        onSubmit={handleSave}
      />
    </div>
  );
}
