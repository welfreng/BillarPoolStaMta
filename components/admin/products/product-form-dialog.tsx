'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown } from 'lucide-react';
import { availableBrands, inventoryCategories } from '@/lib/admin/catalogs';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

function SearchableSelect({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full min-w-0 justify-between overflow-hidden px-3 font-normal"
        >
          <span className="truncate text-left">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList
            ref={listRef}
            onWheel={(event) => {
              const element = listRef.current;
              if (!element) return;
              element.scrollTop += event.deltaY;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const productSchema = z
  .object({
    name: z.string().min(3, 'Ingresa el nombre del producto'),
    description: z.string().min(10, 'Agrega una descripcion mas completa'),
    category: z.string().min(1, 'Selecciona una categoria'),
    subcategory: z.string(),
    brand: z.string().min(1, 'Ingresa o selecciona una marca'),
    salePrice: z.coerce.number().min(0),
    image: z.string().min(1, 'Carga una imagen del producto'),
    imageRotation: z.coerce.number(),
    status: z.enum(['active', 'draft', 'archived']),
  })
  .superRefine((values, ctx) => {
    const selectedCategory = inventoryCategories.find((category) => category.id === values.category);
    if (selectedCategory && selectedCategory.subcategories.length > 0 && !values.subcategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecciona una subcategoria',
        path: ['subcategory'],
      });
    }
  });

export type ProductFormValues = z.infer<typeof productSchema>;

const defaultValues: ProductFormValues = {
  name: '',
  description: '',
  category: 'tacos',
  subcategory: 'Grafito',
  brand: availableBrands[0],
  salePrice: 0,
  image: '/images/logo.png',
  imageRotation: 0,
  status: 'active',
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
  onSubmit: (values: ProductFormValues) => Promise<void> | void;
}) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues,
  });
  const { toast } = useToast();

  useEffect(() => {
    if (!initialProduct) {
      form.reset(defaultValues);
      return;
    }

    form.reset({
      name: initialProduct.name,
      description: initialProduct.description,
      category: initialProduct.category,
      subcategory: initialProduct.subcategory,
      brand: initialProduct.brand,
      salePrice: initialProduct.salePrice,
      image: initialProduct.image,
      imageRotation: initialProduct.imageRotation,
      status: initialProduct.status,
    });
  }, [form, initialProduct]);

  const selectedCategoryId = form.watch('category');
  const selectedImage = form.watch('image');
  const selectedRotation = form.watch('imageRotation');
  const selectedCategory = useMemo(
    () => inventoryCategories.find((category) => category.id === selectedCategoryId),
    [selectedCategoryId]
  );
  const loadImageFile = (file: File) =>
    new Promise<{ dataUrl: string; width: number; height: number }>((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('No se pudo procesar la imagen seleccionada.'));
          return;
        }

        const image = new window.Image();
        image.onload = () => {
          resolve({
            dataUrl: result,
            width: image.width,
            height: image.height,
          });
        };
        image.onerror = () => reject(new Error('La imagen no es valida o esta dañada.'));
        image.src = result;
      };

      reader.readAsDataURL(file);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialProduct ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>
            Registra la informacion esencial del producto y carga su imagen desde tu equipo.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(defaultValues);
            })}
            className="space-y-6"
          >
            <div className="grid gap-4 md:grid-cols-1">
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
                    <FormControl>
                      <SearchableSelect
                        value={field.value}
                        onChange={(value) => {
                        field.onChange(value);
                        const nextCategory = inventoryCategories.find((category) => category.id === value);
                        form.setValue('subcategory', nextCategory?.subcategories[0] ?? '', {
                          shouldValidate: true,
                        });
                        }}
                        placeholder="Selecciona categoria"
                        searchPlaceholder="Buscar categoria..."
                        emptyLabel="No se encontraron categorias."
                        options={inventoryCategories.map((category) => ({
                          value: category.id,
                          label: category.label,
                        }))}
                      />
                    </FormControl>
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
                    {selectedCategory && selectedCategory.subcategories.length > 0 ? (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {selectedCategory.subcategories.map((subcategory) => (
                            <SelectItem key={subcategory} value={subcategory}>
                              {subcategory}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <Input value="Sin subcategoria" disabled />
                      </FormControl>
                    )}
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

            <div className="grid gap-4 md:grid-cols-2">
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
            </div>

            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Imagen del producto</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;

                        try {
                          const imageData = await loadImageFile(file);
                          if (imageData.width !== imageData.height) {
                            form.clearErrors('image');
                            field.onChange(defaultValues.image);
                            form.setValue('imageRotation', 0, { shouldValidate: true });
                            toast({
                              title: 'Imagen no recomendada',
                              description: `La imagen seleccionada mide ${imageData.width} x ${imageData.height} px y no es cuadrada. Se dejara la imagen predeterminada para mantener una vista consistente.`,
                              variant: 'destructive',
                            });
                            event.target.value = '';
                            return;
                          }

                          form.clearErrors('image');
                          field.onChange(imageData.dataUrl);
                          form.setValue('imageRotation', 0, { shouldValidate: true });
                        } catch (error) {
                          form.setError('image', {
                            type: 'manual',
                            message: error instanceof Error ? error.message : 'No se pudo cargar la imagen.',
                          });
                          event.target.value = '';
                        }
                      }}
                    />
                  </FormControl>
                  <p className="text-xs text-slate-500">
                    Recomendado: imagen cuadrada de 1024 x 1024 px en JPG o PNG para que se vea bien en catalogos, tablas y futuras piezas impresas.
                  </p>
                  <p className="text-xs text-slate-500">
                    La imagen se guarda junto al registro del producto en el modelo actual de la app.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                <p className="text-sm font-medium text-slate-700">Vista previa</p>
              </div>
              <div className="relative aspect-[16/8] w-full">
                <Image
                  src={selectedImage}
                  alt="Vista previa del producto"
                  fill
                  className="object-cover"
                  style={{ transform: `rotate(${selectedRotation}deg)` }}
                  unoptimized={selectedImage.startsWith('data:')}
                />
              </div>
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
