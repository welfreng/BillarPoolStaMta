'use client';

import { useMemo, useState } from 'react';
import { Edit, FolderTree, Plus, Power, Rows3, Trash2 } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { ResponsiveRowActions } from '@/components/admin/shared/responsive-row-actions';
import { Button } from '@/components/ui/button';
import { useAdminData } from '@/components/admin/admin-data-context';
import { useToast } from '@/hooks/use-toast';
import { CategoryFormDialog, type CategoryFormValues } from '@/components/admin/categories/category-form-dialog';
import {
  SubcategoryFormDialog,
  type SubcategoryFormValues,
} from '@/components/admin/categories/subcategory-form-dialog';
import type { ProductCategoryRecord, ProductSubcategory } from '@/lib/admin/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function CategoriasPage() {
  const {
    categories,
    products,
    createCategory,
    updateCategory,
    deleteCategory,
    createSubcategory,
    updateSubcategory,
    deleteSubcategory,
  } = useAdminData();
  const { toast } = useToast();
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategoryRecord | undefined>();
  const [openSubcategoryDialog, setOpenSubcategoryDialog] = useState(false);
  const [parentCategory, setParentCategory] = useState<ProductCategoryRecord | undefined>();
  const [editingSubcategory, setEditingSubcategory] = useState<ProductSubcategory | undefined>();

  const usageByCategory = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          products.filter((product) => product.category === category.id).length,
        ])
      ),
    [categories, products]
  );

  const usageBySubcategory = useMemo(
    () =>
      new Map(
        categories.flatMap((category) =>
          category.subcategories.map((subcategory) => [
            `${category.id}:${subcategory.id}`,
            products.filter(
              (product) => product.category === category.id && product.subcategory === subcategory.label
            ).length,
          ])
        )
      ),
    [categories, products]
  );

  const handleCategorySubmit = async (values: CategoryFormValues) => {
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, values);
        toast({ title: 'Categoria actualizada', description: 'Los cambios fueron guardados.' });
      } else {
        await createCategory({ label: values.label });
        toast({ title: 'Categoria creada', description: 'Ya esta disponible para productos.' });
      }
      setOpenCategoryDialog(false);
      setEditingCategory(undefined);
    } catch (error) {
      toast({
        title: 'No se pudo guardar la categoria',
        description: error instanceof Error ? error.message : 'La operacion fallo.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSubcategorySubmit = async (values: SubcategoryFormValues) => {
    if (!parentCategory) return;

    try {
      if (editingSubcategory) {
        await updateSubcategory(parentCategory.id, editingSubcategory.id, values);
        toast({ title: 'Subcategoria actualizada', description: 'Los cambios fueron guardados.' });
      } else {
        await createSubcategory(parentCategory.id, { label: values.label });
        toast({ title: 'Subcategoria creada', description: 'Ya esta disponible para productos.' });
      }
      setOpenSubcategoryDialog(false);
      setEditingSubcategory(undefined);
      setParentCategory(undefined);
    } catch (error) {
      toast({
        title: 'No se pudo guardar la subcategoria',
        description: error instanceof Error ? error.message : 'La operacion fallo.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Estructura del catalogo"
        title="Categorias"
        description="Administra categorias y subcategorias sin mezclarlas dentro del formulario de producto."
        actions={
          <Button
            onClick={() => {
              setEditingCategory(undefined);
              setOpenCategoryDialog(true);
            }}
            className="rounded-xl"
          >
            <Plus className="mr-2 h-4 w-4" /> Nueva categoria
          </Button>
        }
      />

      <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900 shadow-sm">
        Las categorias viven ahora en Firebase como estructura administrable de 2 niveles. Si una categoria o subcategoria ya tiene productos, se recomienda desactivarla o editarla; eliminar solo cuando no este en uso.
      </div>

      <div className="space-y-4">
        {categories.length > 0 ? (
          <Accordion type="multiple" className="space-y-4">
            {categories.map((category) => {
              const categoryUsage = usageByCategory.get(category.id) ?? 0;
              return (
                <AccordionItem
                  key={category.id}
                  value={category.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-slate-100 p-2 text-slate-700">
                            <FolderTree className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h2 className="truncate text-lg font-semibold text-slate-950">{category.label}</h2>
                            <p className="text-sm text-slate-500">
                              ID: {category.id} · {category.status === 'active' ? 'Activa' : 'Inactiva'} · {categoryUsage} producto(s)
                            </p>
                          </div>
                        </div>
                      </div>

                      <ResponsiveRowActions
                        actions={[
                          {
                            label: 'Editar',
                            icon: <Edit className="h-4 w-4" />,
                            onClick: () => {
                              setEditingCategory(category);
                              setOpenCategoryDialog(true);
                            },
                          },
                          {
                            label: 'Subcategoria',
                            icon: <Plus className="h-4 w-4" />,
                            onClick: () => {
                              setParentCategory(category);
                              setEditingSubcategory(undefined);
                              setOpenSubcategoryDialog(true);
                            },
                          },
                          {
                            label: category.status === 'active' ? 'Desactivar' : 'Activar',
                            icon: <Power className="h-4 w-4" />,
                            onClick: async () => {
                              await updateCategory(category.id, {
                                label: category.label,
                                status: category.status === 'active' ? 'inactive' : 'active',
                              });
                            },
                          },
                          {
                            label: 'Eliminar',
                            icon: <Trash2 className="h-4 w-4" />,
                            disabled: categoryUsage > 0,
                            destructive: true,
                            onClick: async () => {
                              try {
                                await deleteCategory(category.id);
                                toast({ title: 'Categoria eliminada', description: 'La categoria fue removida.' });
                              } catch (error) {
                                toast({
                                  title: 'No se pudo eliminar la categoria',
                                  description: error instanceof Error ? error.message : 'La operacion fallo.',
                                  variant: 'destructive',
                                });
                              }
                            },
                          },
                        ]}
                      />
                    </div>

                    <AccordionTrigger className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 hover:no-underline">
                      <div className="flex min-w-0 items-center gap-3">
                        <Rows3 className="mt-0.5 h-4 w-4 text-slate-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">Subcategorias</p>
                          <p className="text-xs text-slate-500">
                            {category.subcategories.length} registro(s) dentro de esta categoria
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                  </div>

                  <AccordionContent className="border-t border-slate-200 bg-slate-50 px-5 pb-5">
                    {category.subcategories.length > 0 ? (
                      <>
                        <div className="hidden md:block">
                          <Table className="min-w-[760px]">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Subcategoria</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Productos</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {category.subcategories.map((subcategory) => {
                                const key = `${category.id}:${subcategory.id}`;
                                const subcategoryUsage = usageBySubcategory.get(key) ?? 0;
                                return (
                                  <TableRow key={subcategory.id}>
                                    <TableCell className="font-medium text-slate-900">{subcategory.label}</TableCell>
                                    <TableCell>{subcategory.status === 'active' ? 'Activa' : 'Inactiva'}</TableCell>
                                    <TableCell>{subcategoryUsage}</TableCell>
                                    <TableCell className="text-right">
                                      <ResponsiveRowActions
                                        actions={[
                                          {
                                            label: 'Editar',
                                            icon: <Edit className="h-4 w-4" />,
                                            onClick: () => {
                                              setParentCategory(category);
                                              setEditingSubcategory(subcategory);
                                              setOpenSubcategoryDialog(true);
                                            },
                                          },
                                          {
                                            label: subcategory.status === 'active' ? 'Desactivar' : 'Activar',
                                            icon: <Power className="h-4 w-4" />,
                                            onClick: async () => {
                                              await updateSubcategory(category.id, subcategory.id, {
                                                label: subcategory.label,
                                                status: subcategory.status === 'active' ? 'inactive' : 'active',
                                              });
                                            },
                                          },
                                          {
                                            label: 'Eliminar',
                                            icon: <Trash2 className="h-4 w-4" />,
                                            disabled: subcategoryUsage > 0,
                                            destructive: true,
                                            onClick: async () => {
                                              try {
                                                await deleteSubcategory(category.id, subcategory.id);
                                                toast({
                                                  title: 'Subcategoria eliminada',
                                                  description: 'La subcategoria fue removida.',
                                                });
                                              } catch (error) {
                                                toast({
                                                  title: 'No se pudo eliminar la subcategoria',
                                                  description:
                                                    error instanceof Error ? error.message : 'La operacion fallo.',
                                                  variant: 'destructive',
                                                });
                                              }
                                            },
                                          },
                                        ]}
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="space-y-3 md:hidden">
                          {category.subcategories.map((subcategory) => {
                            const key = `${category.id}:${subcategory.id}`;
                            const subcategoryUsage = usageBySubcategory.get(key) ?? 0;
                            return (
                              <div key={subcategory.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-900">{subcategory.label}</p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {subcategory.status === 'active' ? 'Activa' : 'Inactiva'} · {subcategoryUsage} producto(s)
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <ResponsiveRowActions
                                    actions={[
                                      {
                                        label: 'Editar',
                                        icon: <Edit className="h-4 w-4" />,
                                        onClick: () => {
                                          setParentCategory(category);
                                          setEditingSubcategory(subcategory);
                                          setOpenSubcategoryDialog(true);
                                        },
                                      },
                                      {
                                        label: subcategory.status === 'active' ? 'Desactivar' : 'Activar',
                                        icon: <Power className="h-4 w-4" />,
                                        onClick: async () => {
                                          await updateSubcategory(category.id, subcategory.id, {
                                            label: subcategory.label,
                                            status: subcategory.status === 'active' ? 'inactive' : 'active',
                                          });
                                        },
                                      },
                                      {
                                        label: 'Eliminar',
                                        icon: <Trash2 className="h-4 w-4" />,
                                        disabled: subcategoryUsage > 0,
                                        destructive: true,
                                        onClick: async () => {
                                          try {
                                            await deleteSubcategory(category.id, subcategory.id);
                                            toast({
                                              title: 'Subcategoria eliminada',
                                              description: 'La subcategoria fue removida.',
                                            });
                                          } catch (error) {
                                            toast({
                                              title: 'No se pudo eliminar la subcategoria',
                                              description:
                                                error instanceof Error ? error.message : 'La operacion fallo.',
                                              variant: 'destructive',
                                            });
                                          }
                                        },
                                      },
                                    ]}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                        Esta categoria aun no tiene subcategorias.
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Aun no hay categorias. Crea la primera para empezar a estructurar el catalogo.
          </div>
        )}
      </div>

      <CategoryFormDialog
        open={openCategoryDialog}
        onOpenChange={setOpenCategoryDialog}
        category={editingCategory}
        onSubmit={handleCategorySubmit}
      />

      <SubcategoryFormDialog
        open={openSubcategoryDialog}
        onOpenChange={setOpenSubcategoryDialog}
        category={parentCategory}
        subcategory={editingSubcategory}
        onSubmit={handleSubcategorySubmit}
      />
    </div>
  );
}
