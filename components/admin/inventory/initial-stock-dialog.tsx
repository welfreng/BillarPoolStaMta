'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown } from 'lucide-react';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import type { Product } from '@/lib/admin/types';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const initialStockSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  variantId: z.string().default(''),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  estimatedUnitCost: z.coerce.number().min(0, 'El costo estimado no puede ser negativo'),
  suggestedSalePrice: z.coerce.number().min(0, 'El precio de venta no puede ser negativo'),
  occurredAt: z.string().min(1, 'Selecciona la fecha'),
  notes: z.string().min(6, 'Agrega una nota breve sobre el origen del stock'),
});

export type InitialStockFormValues = z.infer<typeof initialStockSchema>;

const defaultValues: InitialStockFormValues = {
  productId: '',
  variantId: '',
  quantity: 1,
  estimatedUnitCost: 0,
  suggestedSalePrice: 0,
  occurredAt: new Date().toISOString().slice(0, 10),
  notes: 'Inventario inicial sin soporte ni proveedor confirmado.',
};

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
      <PopoverContent className="w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] min-w-[min(280px,calc(100vw-2rem))] p-0" align="start">
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

export function InitialStockDialog({
  open,
  onOpenChange,
  products,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onSubmit: (values: InitialStockFormValues) => Promise<void> | void;
}) {
  const initialStockFormId = useId();
  const form = useForm<InitialStockFormValues>({
    resolver: zodResolver(
      z
        .object({
          productId: z.string().min(1, 'Selecciona un producto'),
          variantId: z.string().default(''),
          quantity: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
          estimatedUnitCost: z.coerce.number().min(0, 'El costo estimado no puede ser negativo'),
          suggestedSalePrice: z.coerce.number().min(0, 'El precio de venta no puede ser negativo'),
          occurredAt: z.string().min(1, 'Selecciona la fecha'),
          notes: z.string().min(6, 'Agrega una nota breve sobre el origen del stock'),
        })
        .superRefine((values, ctx) => {
          const selectedProduct = products.find((product) => product.id === values.productId);
          if (!selectedProduct) return;

          if ((selectedProduct.variants?.length ?? 0) > 0 && !values.variantId.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Selecciona la variante para cargar inventario inicial.',
              path: ['variantId'],
            });
          }
        })
    ),
    defaultValues,
  });

  const selectedProductId = form.watch('productId');
  const selectedVariantId = form.watch('variantId');
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const selectedVariant = selectedProduct?.variants?.find((variant) => variant.id === selectedVariantId);

  useEffect(() => {
    if (!open) {
      form.reset(defaultValues);
    }
  }, [form, open]);

  useEffect(() => {
    if (!selectedProduct) return;

    form.setValue('suggestedSalePrice', selectedProduct.salePrice, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, selectedProduct, selectedProductId]);

  useEffect(() => {
    if (!selectedVariant || selectedVariant.salePrice === undefined) return;
    form.setValue('suggestedSalePrice', Number(selectedVariant.salePrice), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, selectedVariant]);

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cargar inventario inicial"
      description="Usa esta opcion cuando el negocio ya tiene stock fisico, pero no cuenta con factura o proveedor registrado."
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button form={initialStockFormId} type="submit">
            Guardar carga inicial
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={initialStockFormId}
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
              form.reset(defaultValues);
            })}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Producto</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        form.setValue('variantId', '', { shouldValidate: true });
                      }}
                      placeholder="Selecciona producto"
                      searchPlaceholder="Buscar producto..."
                      emptyLabel="No se encontraron productos."
                      options={products
                        .filter((product) => product.status === 'active')
                        .map((product) => ({
                          value: product.id,
                          label: `${product.name} - ${product.brand}`,
                        }))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedProduct?.variants?.length ? (
              <FormField
                control={form.control}
                name="variantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{selectedProduct.variantLabel || 'Variante'}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona una variante" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(selectedProduct.variants ?? []).map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variant.name} ({variant.stock})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-5 text-slate-500">
                      La carga inicial de productos con variantes debe registrarse sobre una variante especifica.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad actual</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="occurredAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de carga</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="estimatedUnitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo estimado por unidad</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <p className="text-xs leading-5 text-slate-500">
                      Si no conoces el costo exacto, puedes dejar un valor estimado para arrancar.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="suggestedSalePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio de venta actual</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observacion</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Ejemplo: stock recibido antes de usar el sistema, sin factura ni proveedor confirmado."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </form>
        </Form>
    </AdminResponsiveDialog>
  );
}
