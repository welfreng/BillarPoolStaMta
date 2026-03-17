'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  availableBrands,
  inventoryCategories,
  presentationKindLabels,
  presentationOptions,
} from '@/lib/admin/catalogs';
import type { Product } from '@/lib/admin/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const productSchema = z.object({
  sku: z.string().min(3, 'Ingresa un SKU valido'),
  name: z.string().min(3, 'Ingresa el nombre del producto'),
  description: z.string().min(10, 'Agrega una descripcion mas completa'),
  category: z.string().min(1, 'Selecciona una categoria'),
  subcategory: z.string().min(1, 'Selecciona una subcategoria'),
  brand: z.string().min(1, 'Ingresa o selecciona una marca'),
  saleType: z.enum(['unit', 'bundle', 'mixed']),
  unitMeasure: z.string().min(1, 'Ingresa la unidad de medida'),
  stockQuantity: z.coerce.number().min(0),
  stockMinimum: z.coerce.number().min(0),
  purchasePrice: z.coerce.number().min(0),
  shippingCostAllocated: z.coerce.number().min(0),
  realUnitCost: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  warehouseLocation: z.string().min(1, 'Ingresa la ubicacion'),
  image: z.string().min(1, 'Ingresa una imagen o placeholder'),
  status: z.enum(['active', 'draft', 'archived']),
  purchasePresentation: z.enum(['unit', 'dozen', 'box-12']),
  salePresentation: z.enum(['unit', 'dozen', 'box-12']),
  conversionFactor: z.coerce.number().min(1),
});

export type ProductFormValues = z.infer<typeof productSchema>;

const defaultValues: ProductFormValues = {
  sku: '',
  name: '',
  description: '',
  category: 'tacos',
  subcategory: 'Por marca',
  brand: availableBrands[0],
  saleType: 'unit',
  unitMeasure: 'unidad',
  stockQuantity: 0,
  stockMinimum: 0,
  purchasePrice: 0,
  shippingCostAllocated: 0,
  realUnitCost: 0,
  salePrice: 0,
  warehouseLocation: '',
  image: '/images/logo.png',
  status: 'active',
  purchasePresentation: 'unit',
  salePresentation: 'unit',
  conversionFactor: 1,
};

export function ProductFormDialog({
  open,
  onOpenChange,
  initialProduct,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProduct?: Product;
  onSubmit: (values: ProductFormValues) => void;
}) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues,
  });

  useEffect(() => {
    if (!initialProduct) {
      form.reset(defaultValues);
      return;
    }

    form.reset({
      sku: initialProduct.sku,
      name: initialProduct.name,
      description: initialProduct.description,
      category: initialProduct.category,
      subcategory: initialProduct.subcategory,
      brand: initialProduct.brand,
      saleType: initialProduct.saleType,
      unitMeasure: initialProduct.unitMeasure,
      stockQuantity: initialProduct.stockQuantity,
      stockMinimum: initialProduct.stockMinimum,
      purchasePrice: initialProduct.purchasePrice,
      shippingCostAllocated: initialProduct.shippingCostAllocated,
      realUnitCost: initialProduct.realUnitCost,
      salePrice: initialProduct.salePrice,
      warehouseLocation: initialProduct.warehouseLocation,
      image: initialProduct.image,
      status: initialProduct.status,
      purchasePresentation: initialProduct.purchasePresentation,
      salePresentation: initialProduct.salePresentation,
      conversionFactor: initialProduct.conversionFactor,
    });
  }, [form, initialProduct]);

  const selectedCategoryId = form.watch('category');
  const selectedCategory = useMemo(
    () => inventoryCategories.find((category) => category.id === selectedCategoryId),
    [selectedCategoryId]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialProduct ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>
            Gestiona informacion comercial, costo real, stock base y presentaciones de venta.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU o codigo interno</FormLabel>
                    <FormControl>
                      <Input placeholder="TIZ-TAOM-V10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Tiza Taom V10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripcion</FormLabel>
                  <FormControl>
                    <Textarea rows={4} placeholder="Describe el producto y su valor para el cliente." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        const nextCategory = inventoryCategories.find((category) => category.id === value);
                        if (nextCategory) {
                          form.setValue('subcategory', nextCategory.subcategories[0], {
                            shouldValidate: true,
                          });
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {inventoryCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subcategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subcategoria</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedCategory?.subcategories.map((subcategory) => (
                          <SelectItem key={subcategory} value={subcategory}>
                            {subcategory}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marca</FormLabel>
                    <FormControl>
                      <Input list="brand-options" placeholder="Predator" {...field} />
                    </FormControl>
                    <datalist id="brand-options">
                      {availableBrands.map((brand) => (
                        <option key={brand} value={brand} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <FormField
                control={form.control}
                name="saleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de venta</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unit">Unidad</SelectItem>
                        <SelectItem value="bundle">Presentacion</SelectItem>
                        <SelectItem value="mixed">Mixto</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unitMeasure"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidad de medida</FormLabel>
                    <FormControl>
                      <Input placeholder="unidad" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="draft">Borrador</SelectItem>
                        <SelectItem value="archived">Archivado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warehouseLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ubicacion en bodega</FormLabel>
                    <FormControl>
                      <Input placeholder="Estante A1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <FormField
                control={form.control}
                name="stockQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock actual</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stockMinimum"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock minimo</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purchasePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio de compra</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shippingCostAllocated"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Envio prorrateado</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="realUnitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo unitario real</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio de venta</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Imagen</FormLabel>
                    <FormControl>
                      <Input placeholder="/images/logo.png" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
              <p className="mb-4 text-sm font-medium text-cyan-900">
                Presentaciones comerciales y conversion del stock base
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="purchasePresentation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Presentacion de compra</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {presentationOptions.map((item) => (
                            <SelectItem key={item.id} value={item.kind}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="salePresentation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Presentacion de venta</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {presentationOptions.map((item) => (
                            <SelectItem key={item.id} value={item.kind}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="conversionFactor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Factor de conversion</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <p className="text-xs text-slate-500">
                        Cuantas unidades base representa la compra o venta principal.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Ejemplo: {presentationKindLabels['box-12']} = 12 unidades, {presentationKindLabels.dozen} = 12 unidades.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">{initialProduct ? 'Guardar cambios' : 'Crear producto'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
