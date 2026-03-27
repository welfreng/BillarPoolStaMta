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
import { useAdminData } from '@/components/admin/admin-data-context';
import { useToast } from '@/hooks/use-toast';
import {
  extractCatalogImageOverrides,
  resolveCatalogImageOverride,
  type CatalogImageOverrideMaps,
} from '@/lib/catalog-image-overrides';
import { formatCurrency } from '@/lib/admin/calculations';
import { getCategoryLabel, inventoryCategories } from '@/lib/admin/catalogs';
import type { Product } from '@/lib/admin/types';
import { db } from '@/lib/firebase';
import { SITE_LOGO } from '@/lib/branding';

const pageSize = 6;

export default function ProductosPage() {
  const { products, createProduct, updateProduct, deleteProduct } = useAdminData();
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
  });

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
        setCatalogImageOverrides({ byProductId: {}, byProductName: {} });
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
        description: 'Revisa la configuracion y permisos de Firebase para este proyecto.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDelete = async (product: Product) => {
    const relatedCountMessage =
      'Tambien se eliminaran sus compras, movimientos y ventas relacionadas.';
    if (!window.confirm(`Deseas eliminar ${product.name}?\n\n${relatedCountMessage}`)) return;
    try {
      await deleteProduct(product.id);
      setSelectedProduct(undefined);
      toast({
        title: 'Producto eliminado',
        description: 'El producto y sus registros relacionados fueron removidos del panel.',
      });
    } catch (error) {
      console.error('Error eliminando producto en Firestore:', error);
      toast({
        title: 'No se pudo eliminar el producto',
        description: 'Firestore rechazo la operacion o la conexion fallo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Modulo CRUD"
        title="Productos e inventario base"
        description="Administra el catalogo del producto, su imagen, precio de venta y estado operativo."
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
        <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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

          {paginatedProducts.length > 0 ? (
            <>
              <div className="min-w-0">
                <Table className="min-w-[680px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Venta</TableHead>
                      <TableHead>Destacado</TableHead>
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
                            <p className="text-xs text-slate-500">{product.brand}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-slate-700">{getCategoryLabel(product.category)}</p>
                          <p className="text-xs text-slate-500">{product.subcategory}</p>
                        </TableCell>
                        <TableCell>{formatCurrency(product.salePrice)}</TableCell>
                        <TableCell>
                          <span className={product.featured ? 'font-medium text-emerald-700' : 'text-slate-400'}>
                            {product.featured ? 'Si' : 'No'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ProductStatusBadge status={product.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedProduct(product);
                                setOpenViewDialog(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={(event) => {
                                event.stopPropagation();
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
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDelete(product);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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

        <aside className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {selectedProduct ? (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
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
                <p className="text-sm font-medium text-cyan-700">Vista del producto</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">{selectedProduct.name}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{selectedProduct.description}</p>
              </div>

              <div className="grid gap-3">
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
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Precio de venta</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatCurrency(selectedProduct.salePrice)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Producto destacado</p>
                  <p className={`mt-1 font-semibold ${selectedProduct.featured ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {selectedProduct.featured ? 'Si, visible en portada' : 'No'}
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
                    {getCategoryLabel(selectedProduct.category)} · {selectedProduct.subcategory}
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
