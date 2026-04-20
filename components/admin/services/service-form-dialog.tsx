'use client';

import { useEffect, useId, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AdminResponsiveDialog } from '@/components/admin/admin-responsive-dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatNumber, getProductRealUnitCost, getProductStock } from '@/lib/admin/calculations';
import { filterProductsByCategoryFamily } from '@/lib/admin/category-rules';
import { serviceTypeLabels } from '@/lib/admin/catalogs';
import type { InventoryMovement, Product, Purchase, ServiceType } from '@/lib/admin/types';

const serviceSchema = z.object({
  serviceType: z.enum(['tip-installation', 'tip-ferrule-installation', 'extension-installation']),
  serviceCategory: z.string().default('torno'),
  performedAt: z.string().min(1, 'Selecciona la fecha'),
  customerName: z.string().min(2, 'Ingresa el cliente'),
  cueReference: z.string().min(2, 'Describe el taco o referencia'),
  paymentMethod: z.string().min(1, 'Selecciona el metodo de pago'),
  paymentReference: z.string().default(''),
  servicePrice: z.coerce.number().positive('Ingresa un valor valido para el servicio'),
  serviceCost: z.coerce.number().min(0, 'Ingresa un costo valido').default(0),
  tipProductId: z.string().default(''),
  ferruleProductId: z.string().default(''),
  suppressorProductId: z.string().default(''),
  includeSuppressor: z.boolean().default(false),
  extensionProductId: z.string().default(''),
  bumperProductId: z.string().default(''),
  notes: z.string().default(''),
}).superRefine((values, context) => {
  if (!values.tipProductId && (values.serviceType === 'tip-installation' || values.serviceType === 'tip-ferrule-installation')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tipProductId'], message: 'Selecciona el casquillo.' });
  }
  if (values.serviceType === 'tip-ferrule-installation' && !values.ferruleProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ferruleProductId'], message: 'Selecciona la virola.' });
  }
  if (values.includeSuppressor && !values.suppressorProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['suppressorProductId'], message: 'Selecciona el supresor.' });
  }
  if (values.serviceType === 'extension-installation' && !values.extensionProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['extensionProductId'], message: 'Selecciona la extension.' });
  }
  if (values.serviceType === 'extension-installation' && !values.bumperProductId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['bumperProductId'], message: 'Selecciona el parachoque.' });
  }
});

export type ServiceFormValues = z.infer<typeof serviceSchema>;

const defaultValues: ServiceFormValues = {
  serviceType: 'tip-installation',
  serviceCategory: 'torno',
  performedAt: new Date().toISOString().slice(0, 10),
  customerName: '',
  cueReference: '',
  paymentMethod: 'efectivo',
  paymentReference: '',
  servicePrice: 0,
  serviceCost: 0,
  tipProductId: '',
  ferruleProductId: '',
  suppressorProductId: '',
  includeSuppressor: false,
  extensionProductId: '',
  bumperProductId: '',
  notes: '',
};

export function ServiceFormDialog({
  open,
  onOpenChange,
  products,
  purchases,
  movements,
  hideFinancialSummary = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  purchases: Purchase[];
  movements: InventoryMovement[];
  hideFinancialSummary?: boolean;
  onSubmit: (values: ServiceFormValues) => Promise<void> | void;
}) {
  const serviceFormId = useId();
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [form, open]);

  const values = form.watch();
  const tipOptions = useMemo(() => filterProductsByCategoryFamily(products, 'casquillos'), [products]);
  const ferruleOptions = useMemo(() => filterProductsByCategoryFamily(products, 'virolas'), [products]);
  const suppressorOptions = useMemo(() => filterProductsByCategoryFamily(products, 'supresores'), [products]);
  const extensionOptions = useMemo(() => filterProductsByCategoryFamily(products, 'extensiones'), [products]);
  const bumperOptions = useMemo(() => filterProductsByCategoryFamily(products, 'parachoques'), [products]);

  const selectedMaterials = [
    values.tipProductId,
    values.serviceType === 'tip-ferrule-installation' ? values.ferruleProductId : '',
    values.includeSuppressor ? values.suppressorProductId : '',
    values.serviceType === 'extension-installation' ? values.extensionProductId : '',
    values.serviceType === 'extension-installation' ? values.bumperProductId : '',
  ].filter(Boolean);

  const materialSummary = selectedMaterials.map((productId) => {
    const product = products.find((item) => item.id === productId);
    const unitCost = product ? getProductRealUnitCost(purchases, product.id) : 0;
    const stock = product ? getProductStock(movements, product.id) : 0;
    return {
      productId,
      name: product?.name ?? 'Producto',
      unitCost,
      stock,
    };
  });

  const totalMaterialCost = materialSummary.reduce((sum, item) => sum + item.unitCost, 0);
  const operationalCost = Math.max(Number(values.serviceCost) || 0, 0);
  const estimatedTotalCost = totalMaterialCost + operationalCost;
  const estimatedProfit = (Number(values.servicePrice) || 0) - estimatedTotalCost;

  return (
    <AdminResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar servicio de torno"
      description="Registra el valor del trabajo y descuenta del inventario los productos usados en el servicio."
      desktopContentClassName="lg:max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button form={serviceFormId} type="submit">
            Guardar servicio
          </Button>
        </div>
      }
    >
        <Form {...form}>
          <form
            id={serviceFormId}
            onSubmit={form.handleSubmit(async (submittedValues) => {
              await onSubmit(submittedValues);
              form.reset(defaultValues);
            })}
            className="space-y-6"
          >
            <div className="grid gap-4 rounded-3xl border border-border bg-card/88 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-[0_18px_40px_rgba(2,6,23,0.22)] sm:grid-cols-2 sm:p-5">
              <FormField
                control={form.control}
                name="serviceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de servicio</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(serviceTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
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
                name="performedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha del servicio</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serviceCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria del servicio</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: torno" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del cliente" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cueReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taco o referencia</FormLabel>
                    <FormControl>
                      <Input placeholder="Ejemplo: taco Cuetec de Juan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            <div className="grid gap-4 rounded-3xl border border-border bg-muted/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/60 lg:grid-cols-2 sm:p-5">
              {(values.serviceType === 'tip-installation' || values.serviceType === 'tip-ferrule-installation') && (
                <FormField
                  control={form.control}
                  name="tipProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Casquillo</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona el casquillo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tipOptions.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {values.serviceType === 'tip-ferrule-installation' && (
                <FormField
                  control={form.control}
                  name="ferruleProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Virola</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona la virola" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ferruleOptions.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {values.serviceType === 'extension-installation' && (
                <>
                  <FormField
                    control={form.control}
                    name="extensionProductId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Extension</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona la extension" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {extensionOptions.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
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
                    name="bumperProductId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parachoque</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona el parachoque" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {bumperOptions.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {(values.serviceType === 'tip-installation' || values.serviceType === 'tip-ferrule-installation') && (
                <div className="space-y-3 lg:col-span-2">
                  <FormField
                    control={form.control}
                    name="includeSuppressor"
                    render={({ field }) => (
                      <FormItem className="rounded-2xl border border-border bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/72 sm:p-4">
                        <div className="flex items-center gap-3">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                          </FormControl>
                          <div>
                            <FormLabel>Agregar supresor</FormLabel>
                            <p className="hidden text-sm text-muted-foreground sm:block">Activalo si este trabajo tambien lleva supresor.</p>
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />

                  {values.includeSuppressor && (
                    <FormField
                      control={form.control}
                      name="suppressorProductId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Supresor</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona el supresor" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {suppressorOptions.map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 rounded-3xl border border-cyan-200/70 bg-cyan-50/70 p-3.5 dark:border-cyan-900/60 dark:bg-cyan-950/18 lg:grid-cols-[1.1fr_0.9fr] sm:p-5">
              <div className="space-y-3.5 sm:space-y-4">
                <FormField
                  control={form.control}
                  name="servicePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor del servicio</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serviceCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo del servicio</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea rows={4} placeholder="Observaciones del trabajo realizado" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-3xl border border-border bg-card/88 p-3 dark:border-slate-800 dark:bg-slate-950/72 sm:p-4">
                <p className="text-sm font-semibold text-foreground">Resumen del servicio</p>
                <div className="mt-4 space-y-3">
                  {materialSummary.length > 0 ? (
                    materialSummary.map((item) => (
                      <div key={item.productId} className="rounded-2xl border border-border/70 bg-background/88 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="font-medium text-foreground">{item.name}</p>
                        <p className="text-muted-foreground">Stock: {formatNumber(item.stock)} uds</p>
                        {!hideFinancialSummary ? (
                          <p className="text-muted-foreground">Costo real: {formatCurrency(item.unitCost)}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="hidden text-sm text-muted-foreground sm:block">
                      {hideFinancialSummary
                        ? 'Selecciona los insumos para revisar disponibilidad y registrar el trabajo.'
                        : 'Selecciona los insumos para calcular el costo del trabajo.'}
                    </p>
                  )}

                  <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                    <p className="text-sm">Valor servicio: {formatCurrency(Number(values.servicePrice) || 0)}</p>
                    <p className="mt-1 text-sm">Costo operativo: {formatCurrency(operationalCost)}</p>
                    {!hideFinancialSummary ? <p className="mt-1 text-sm">Costo materiales: {formatCurrency(totalMaterialCost)}</p> : null}
                    <p className="mt-1 text-sm">Costo total: {formatCurrency(estimatedTotalCost)}</p>
                    <p className="mt-2 text-lg font-semibold">Utilidad estimada: {formatCurrency(estimatedProfit)}</p>
                    <p className="mt-2 text-sm text-slate-300">El sistema descontara automaticamente los materiales del inventario.</p>
                  </div>
                </div>
              </div>
            </div>

          </form>
        </Form>
    </AdminResponsiveDialog>
  );
}
