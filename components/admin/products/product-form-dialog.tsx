'use client';

import Image from 'next/image';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown } from 'lucide-react';
import { availableBrands, inventoryCategories } from '@/lib/admin/catalogs';
import type { Product } from '@/lib/admin/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { optimizeImageFile } from '@/lib/image-upload';
import { SITE_LOGO } from '@/lib/branding';

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
    featured: z.boolean().default(false),
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
  featured: false,
  image: SITE_LOGO,
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
  const imageInputRef = useRef<HTMLInputElement | null>(null);

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
      featured: initialProduct.featured,
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
  const selectedSubcategoryOptions = selectedCategory?.subcategories ?? [];
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
  const handleImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
    onChange: (value: string) => void
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imageData = await optimizeImageFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.84,
      });
      if (imageData.originalWidth !== imageData.originalHeight) {
        form.clearErrors('image');
        onChange(defaultValues.image);
        form.setValue('imageRotation', 0, { shouldValidate: true });
        toast({
          title: 'Imagen no recomendada',
          description: `La imagen seleccionada mide ${imageData.originalWidth} x ${imageData.originalHeight} px y no es cuadrada. Se dejara la imagen predeterminada para mantener una vista consistente.`,
          variant: 'destructive',
        });
        event.target.value = '';
        return;
      }

      form.clearErrors('image');
      onChange(imageData.dataUrl);
      form.setValue('imageRotation', 0, { shouldValidate: true });
    } catch (error) {
      form.setError('image', {
        type: 'manual',
        message: error instanceof Error ? error.message : 'No se pudo cargar la imagen.',
      });
      event.target.value = '';
    }
  };

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
            <div className="space-y-6">
              <div className="space-y-6">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">Informacion del producto</h3>
                    <p className="text-sm text-slate-500">Completa los datos principales para identificarlo rapido.</p>
                  </div>

                  <div className="space-y-4">
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
                                  const nextSubcategory = nextCategory?.subcategories[0] ?? '';
                                  form.setValue('subcategory', nextSubcategory, {
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
                            {selectedCategory && selectedSubcategoryOptions.length > 0 ? (
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Selecciona" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {selectedSubcategoryOptions.map((subcategory) => (
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
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">Configuracion comercial</h3>
                    <p className="text-sm text-slate-500">Define el precio, visibilidad y estado operativo.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
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

                  <div className="mt-4">
                    <FormField
                      control={form.control}
                      name="featured"
                      render={({ field }) => (
                        <FormItem className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="flex items-start gap-3">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                            </FormControl>
                            <div className="space-y-1">
                              <FormLabel className="text-sm font-medium text-slate-950">Mostrar como producto destacado</FormLabel>
                              <p className="text-sm text-slate-500">
                                Si lo activas, este producto puede aparecer en la portada como referencia destacada.
                              </p>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>
              </div>

              <section className="space-y-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-5 shadow-sm">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">Imagen</h3>
                  <p className="text-sm text-slate-500">Sube la foto del producto y revisa como se vera.</p>
                </div>

                <FormField
                  control={form.control}
                  name="image"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-start">
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => void handleImageChange(event, field.onChange)}
                          />
                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className="block min-h-[220px] w-full rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-left transition hover:border-slate-400 hover:shadow-sm"
                          >
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-slate-700">Cargar imagen</p>
                              <p className="max-w-md text-sm text-slate-500">
                                Haz clic aqui para seleccionar la foto del producto desde tu equipo.
                              </p>
                            </div>
                          </button>
                          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                              <p className="text-sm font-medium text-slate-700">Vista actual</p>
                              <span className="text-xs text-slate-500">Previsualizacion</span>
                            </div>
                            <div className="relative mx-auto aspect-square w-full max-w-[240px] bg-gradient-to-br from-white via-slate-50 to-slate-100">
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
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
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
