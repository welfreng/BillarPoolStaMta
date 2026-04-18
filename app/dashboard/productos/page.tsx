'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { ProductFormDialog, type ProductFormValues } from '@/components/admin/products/product-form-dialog';
import { ProductStatusBadge } from '@/components/admin/shared/status-badges';
import { ResponsiveRowActions } from '@/components/admin/shared/responsive-row-actions';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useToast } from '@/hooks/use-toast';
import {
  extractCatalogImageOverrides,
  resolveCatalogImageOverride,
  type CatalogImageOverrideMaps,
} from '@/lib/catalog-image-overrides';
import { getFriendlyFirestoreWriteErrorMessage } from '@/lib/firestore-write-retry';
import { formatCurrency } from '@/lib/admin/calculations';
import { getCategoryLabel, toCategoryOptions } from '@/lib/admin/category-utils';
import type { Product } from '@/lib/admin/types';
import { db } from '@/lib/firebase';
import { SITE_LOGO } from '@/lib/branding';

const pageSize = 10;

function getVariantPriceSummary(product: Product) {
  const prices = (product.variants ?? [])
    .map((variant) => Number(variant.salePrice ?? 0))
    .filter((price) => price > 0);

  if (prices.length === 0) return formatCurrency(product.salePrice);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return minPrice === maxPrice
    ? formatCurrency(minPrice)
    : `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
}

function getVariantSummary(product: Product) {
  const variants = product.variants ?? [];
  if (variants.length === 0) return 'Sin variantes';

  const inactiveCount = variants.filter((variant) => variant.status === 'inactive').length;
  return inactiveCount > 0
    ? `${variants.length} variantes · ${inactiveCount} inactivas`
    : `${variants.length} variantes`;
}

export default function ProductosPage() {
  const { categories, products, purchases, movements, sales, services, createProduct, updateProduct, deleteProduct } = useAdminData();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [openDialog, setOpenDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(products[0]);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [imageZoom, setImageZoom] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [catalogImageOverrides, setCatalogImageOverrides] = useState<CatalogImageOverrideMaps>({
    byProductId: {},
    byProductName: {},
    byVariantKey: {},
  });
  const categoryOptions = useMemo(() => toCategoryOptions(categories), [categories]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesQuery =
        [product.name, product.brand, product.category, product.subcategory]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase());
      const matchesCategory = category === 'all' || product.category === category;
      const matchesStatus = status === 'all' || product.status === status;

      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [category, products, query, status]);

  const productHistoryById = useMemo(() => {
    return new Map(
      products.map((product) => {
        const purchasesCount = purchases.filter((purchase) => purchase.productId === product.id).length;
        const movementsCount = movements.filter((movement) => movement.productId === product.id).length;
        const salesCount = sales.filter(
          (sale) =>
            sale.productId === product.id ||
            sale.lineItems.some((item) => item.productId === product.id) ||
            sale.giftItems.some((item) => item.productId === product.id)
        ).length;
        const servicesCount = services.filter((service) =>
          service.materials.some((material) => material.productId === product.id)
        ).length;

        return [
          product.id,
          {
            purchasesCount,
            movementsCount,
            salesCount,
            servicesCount,
            hasActivity: purchasesCount + movementsCount + salesCount + servicesCount > 0,
          },
        ];
      })
    );
  }, [movements, products, purchases, sales, services]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (openViewDialog) {
      setImageZoom(1);
      setImageOffset({ x: 0, y: 0 });
    }
  }, [openViewDialog, selectedProduct]);

  useEffect(() => {
    if (products.length === 0) {
      setSelectedProduct(undefined);
      return;
    }

    setSelectedProduct((current) => {
      if (!current) return products[0];
      return products.find((product) => product.id === current.id) ?? products[0];
    });
  }, [products]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'siteAssets'),
      (snapshot) => {
        setCatalogImageOverrides(extractCatalogImageOverrides(snapshot));
      },
      (error) => {
        console.error('Error leyendo imagenes del catalogo web:', error);
        setCatalogImageOverrides({ byProductId: {}, byProductName: {}, byVariantKey: {} });
      }
    );

    return () => unsubscribe();
  }, []);

  const selectedProductPreviewImage = selectedProduct
    ? resolveCatalogImageOverride(
        selectedProduct.id,
        selectedProduct.name,
        selectedProduct.image,
        catalogImageOverrides
      )
    : SITE_LOGO;

  const handleSave = async (values: ProductFormValues) => {
    try {
      if (editingProduct) {
        const updated = await updateProduct(editingProduct.id, values);
        setSelectedProduct(updated);
        toast({ title: 'Producto actualizado', description: 'Los cambios fueron guardados.' });
      } else {
        const created = await createProduct(values);
        setSelectedProduct(created);
        toast({ title: 'Producto creado', description: 'El producto ya forma parte del inventario.' });
      }

      setEditingProduct(undefined);
      setOpenDialog(false);
    } catch (error) {
      console.error('Error guardando producto en Firestore:', error);
      toast({
        title: 'No se pudo guardar el producto',
        description: getFriendlyFirestoreWriteErrorMessage(
          error,
          error instanceof Error
            ? error.message
            : 'Revisa la configuracion y permisos de Firebase para este proyecto.'
        ),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDelete = async (product: Product) => {
    const historySummary = productHistoryById.get(product.id);
    if (historySummary?.hasActivity) {
      toast({
        title: 'Producto con historial',
        description:
          'Este producto ya tiene compras, inventario o ventas registradas. Primero habra que reorganizarlo con una migracion guiada, no eliminarlo.',
        variant: 'destructive',
      });
      return;
    }

    if (!window.confirm(`Deseas eliminar ${product.name}?`)) return;
    try {
      await deleteProduct(product.id);
      setSelectedProduct(undefined);
      toast({
        title: 'Producto eliminado',
        description: 'El producto fue removido del panel.',
      });
    } catch (error) {
      console.error('Error eliminando producto en Firestore:', error);
      toast({
        title: 'No se pudo eliminar el producto',
        description: getFriendlyFirestoreWriteErrorMessage(
          error,
          error instanceof Error
            ? error.message
            : 'Firestore rechazo la operacion o la conexion fallo.'
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Modulo CRUD"
        title="Productos y catalogo base"
        description="Administra el catalogo del producto, su imagen, precios y variantes. El stock se controla desde inventario y compras."
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

      <div className="grid gap-6 xl:grid-cols-[1.75fr_0.75fr]">
        <div className="min-w-0 space-y-4 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative sm:col-span-2 xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => {
                  setPage(1);
                  setQuery(event.target.value);
                }}
                placeholder="Buscar por nombre, marca o categoria"
                className="rounded-2xl border-slate-200 bg-white/90 pl-9 shadow-sm dark:border-slate-700 dark:bg-slate-900/75"
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
                {categoryOptions.map((item) => (
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

          {paginatedProducts.length > 0 ? (
            <>
              <div className="min-w-0">
                <div className="space-y-3 md:hidden">
                  {paginatedProducts.map((product) => (
                    <div
                      key={product.id}
                      className="rounded-[22px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-sm dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.86)_100%)]"
                      onClick={() => setSelectedProduct(product)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{product.name}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{product.brand}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {getCategoryLabel(categories, product.category)} · {product.subcategory}
                          </p>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{getVariantSummary(product)}</p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{getVariantPriceSummary(product)}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <ProductStatusBadge status={product.status} />
                            <span className={product.featured ? 'text-xs font-medium text-emerald-700' : 'text-xs text-slate-400'}>
                              {product.featured ? 'Destacado' : 'No destacado'}
                            </span>
                          </div>
                        </div>
                        <ResponsiveRowActions
                          actions={[
                            {
                              label: 'Ver',
                              icon: <Eye className="h-4 w-4" />,
                              onClick: () => {
                                setSelectedProduct(product);
                                setOpenViewDialog(true);
                              },
                            },
                            {
                              label: 'Editar',
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => {
                                setEditingProduct(product);
                                setOpenDialog(true);
                              },
                            },
                            {
                              label: 'Eliminar',
                              icon: <Trash2 className="h-4 w-4" />,
                              onClick: () => {
                                handleDelete(product);
                              },
                              destructive: true,
                            },
                          ]}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mb-2 hidden text-xs text-slate-500 dark:text-slate-400 md:block">Desliza la tabla hacia la derecha para ver toda la informacion.</div>
                <div className="hidden pb-2 md:block">
                <Table className="min-w-[680px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Variantes</TableHead>
                      <TableHead>Venta</TableHead>
                      <TableHead>Destacado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="sticky right-0 z-10 bg-slate-50/95 text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.35)] dark:bg-slate-900/95 dark:shadow-[-12px_0_16px_-16px_rgba(2,6,23,0.65)]">
                        Acciones
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProducts.map((product) => {
                      const rowHoverSummary = [
                        product.name,
                        `Marca: ${product.brand}`,
                        `Categoria: ${getCategoryLabel(categories, product.category)} / ${product.subcategory}`,
                        `Variantes: ${getVariantSummary(product)}`,
                        `Precio: ${getVariantPriceSummary(product)}`,
                        `Destacado: ${product.featured ? 'Si' : 'No'}`,
                        `Estado: ${product.status === 'active' ? 'Activo' : 'Inactivo'}`,
                      ].join('\n');

                      return (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedProduct(product)}
                        title={rowHoverSummary}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{product.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{product.brand}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{getCategoryLabel(categories, product.category)}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{product.subcategory}</p>
                        </TableCell>
                        <TableCell>{getVariantSummary(product)}</TableCell>
                        <TableCell>{getVariantPriceSummary(product)}</TableCell>
                        <TableCell>
                          <span className={product.featured ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'text-slate-400 dark:text-slate-500'}>
                            {product.featured ? 'Si' : 'No'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ProductStatusBadge status={product.status} />
                        </TableCell>
                        <TableCell className="sticky right-0 bg-[rgba(248,250,252,0.96)] text-right shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.22)] backdrop-blur dark:bg-slate-950/95 dark:shadow-[-12px_0_16px_-16px_rgba(2,6,23,0.65)]">
                          <ResponsiveRowActions
                            actions={[
                              {
                                label: 'Ver',
                                icon: <Eye className="h-4 w-4" />,
                                onClick: () => {
                                  setSelectedProduct(product);
                                  setOpenViewDialog(true);
                                },
                              },
                              {
                                label: 'Editar',
                                icon: <Pencil className="h-4 w-4" />,
                                onClick: () => {
                                  setEditingProduct(product);
                                  setOpenDialog(true);
                                },
                              },
                              {
                                label: 'Eliminar',
                                icon: <Trash2 className="h-4 w-4" />,
                                onClick: () => {
                                  handleDelete(product);
                                },
                                destructive: true,
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
                </div>
              </div>

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
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
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

        <aside className="min-w-0 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,253,0.96)_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.88)_100%)] dark:shadow-[0_20px_48px_rgba(2,6,23,0.28)] sm:p-6 xl:sticky xl:top-24 xl:self-start">
          {selectedProduct ? (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(15,23,42,0.72)_100%)]">
                <div className="relative aspect-[16/10] w-full">
                  <Image
                    src={selectedProductPreviewImage}
                    alt={selectedProduct.name}
                    fill
                    className="object-cover"
                    style={{ transform: `rotate(${selectedProduct.imageRotation}deg)` }}
                    unoptimized={selectedProductPreviewImage.startsWith('data:')}
                  />
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Vista del producto</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-50">{selectedProduct.name}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{selectedProduct.description}</p>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Categoria</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                      {getCategoryLabel(categories, selectedProduct.category)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{selectedProduct.subcategory}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Marca</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{selectedProduct.brand}</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Precio de venta</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {getVariantPriceSummary(selectedProduct)}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">Stock operativo</p>
                  <p className="mt-1 text-sm leading-6">
                    El stock no se edita en catalogo. Usa Inventario para carga inicial y ajustes, o Compras para entradas reales.
                  </p>
                </div>
                {(selectedProduct.variants?.length ?? 0) > 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Resumen de variantes</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{getVariantSummary(selectedProduct)}</p>
                  </div>
                ) : null}
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Producto destacado</p>
                  <p className={`mt-1 font-semibold ${selectedProduct.featured ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}`}>
                    {selectedProduct.featured ? 'Si, visible en portada' : 'No'}
                  </p>
                </div>
                {(selectedProduct.variants?.length ?? 0) > 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Catalogo por variante</p>
                    <div className="mt-3 space-y-2">
                      {(selectedProduct.variants ?? []).map((variant) => {
                        return (
                          <div
                            key={variant.id}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/60"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                  {variant.displayName ?? variant.name}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {formatCurrency(Number(variant.salePrice ?? selectedProduct.salePrice ?? 0))}
                                </p>
                                {variant.sku ? (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">SKU: {variant.sku}</p>
                                ) : null}
                              </div>
                              <span
                                className={
                                  variant.status === 'inactive'
                                    ? 'rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700'
                                    : 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700'
                                }
                              >
                                {variant.status === 'inactive' ? 'Inactiva' : 'Activa'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <Empty className="border border-dashed border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Eye className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>Selecciona un producto</EmptyTitle>
                <EmptyDescription>
                  Aqui veras la imagen del producto y su descripcion.
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
        historySummary={editingProduct ? productHistoryById.get(editingProduct.id) : undefined}
        onSubmit={handleSave}
      />
      <Dialog open={openViewDialog} onOpenChange={setOpenViewDialog}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto border-slate-800 bg-slate-950 p-0 text-white sm:w-[calc(100vw-2rem)]">
          {selectedProduct ? (
            <>
              <div
                className="overflow-hidden bg-black touch-none"
                onWheel={(event) => {
                  event.preventDefault();
                  setImageZoom((current) => {
                    const next = current + (event.deltaY < 0 ? 0.12 : -0.12);
                    return Math.min(Math.max(Number(next.toFixed(2)), 1), 4);
                  });
                }}
                onPointerDown={(event) => {
                  setIsDraggingImage(true);
                  setDragStart({
                    x: event.clientX - imageOffset.x,
                    y: event.clientY - imageOffset.y,
                  });
                }}
                onPointerMove={(event) => {
                  if (!isDraggingImage) return;
                  setImageOffset({
                    x: event.clientX - dragStart.x,
                    y: event.clientY - dragStart.y,
                  });
                }}
                onPointerUp={() => setIsDraggingImage(false)}
                onPointerLeave={() => setIsDraggingImage(false)}
              >
                <div className="relative mx-auto aspect-[4/3] min-h-[40vh] w-full max-w-5xl sm:min-h-[55vh]">
                  <Image
                    src={selectedProductPreviewImage}
                    alt={selectedProduct.name}
                    fill
                    className="object-contain"
                    style={{
                      transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageZoom}) rotate(${selectedProduct.imageRotation}deg)`,
                      cursor: isDraggingImage ? 'grabbing' : 'grab',
                    }}
                    unoptimized={selectedProductPreviewImage.startsWith('data:')}
                  />
                </div>
              </div>
              <div className="border-t border-slate-800 bg-slate-950 p-4 sm:p-6">
                <DialogHeader>
                  <DialogTitle className="text-white">{selectedProduct.name}</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    {getCategoryLabel(categories, selectedProduct.category)} · {selectedProduct.subcategory}
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="text-sm text-slate-300">
                      Usa la rueda del mouse para zoom y arrastra la imagen para moverla.
                    </p>
                    <p className="text-sm font-medium text-cyan-300">
                      Zoom: {(imageZoom * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="text-xs text-slate-400">Descripcion</p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      {selectedProduct.description}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                      <p className="text-xs text-slate-400">Marca</p>
                      <p className="mt-1 font-semibold text-white">{selectedProduct.brand}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                      <p className="text-xs text-slate-400">Precio de venta</p>
                      <p className="mt-1 font-semibold text-white">
                        {formatCurrency(selectedProduct.salePrice)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
