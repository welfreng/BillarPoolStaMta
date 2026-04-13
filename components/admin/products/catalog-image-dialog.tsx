'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore';
import { Check, ImagePlus, Images, LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  buildCatalogVariantImageKey,
  extractCatalogImageOverrides,
  normalizeCatalogImageName,
  resolveCatalogImageOverride,
  resolveCatalogVariantImageOverride,
  type CatalogImageOverrideMaps,
} from '@/lib/catalog-image-overrides';
import {
  runFirestoreWriteWithBackoff,
} from '@/lib/firestore-write-retry';
import { db } from '@/lib/firebase';
import { optimizeImageFile } from '@/lib/image-upload';
import { useToast } from '@/hooks/use-toast';
import { SITE_LOGO } from '@/lib/branding';

interface WebCatalogProduct {
  id: string;
  name: string;
  brand: string;
  image: string;
  status: 'active' | 'draft' | 'archived';
  variants: Array<{
    id: string;
    name: string;
    colorHex?: string;
  }>;
}

async function loadFileAsDataUrl(
  event: ChangeEvent<HTMLInputElement>,
  onLoaded: (value: string) => void
) {
  const file = event.target.files?.[0];
  if (!file) return;

  const optimizedImage = await optimizeImageFile(file, {
    maxWidth: 768,
    maxHeight: 768,
    quality: 0.72,
    minQuality: 0.5,
    fit: 'cover',
    maxBytes: 160 * 1024,
  });
  onLoaded(optimizedImage.dataUrl);
  event.target.value = '';
}

function mapProduct(documentId: string, data: DocumentData): WebCatalogProduct {
  return {
    id: documentId,
    name: String(data.name ?? 'Producto'),
    brand: String(data.brand ?? ''),
    image: String(data.image ?? SITE_LOGO),
    status:
      data.status === 'draft' || data.status === 'archived' || data.status === 'active'
        ? data.status
        : 'active',
    variants: Array.isArray(data.variants)
      ? data.variants
          .map((variant: DocumentData, index: number) => ({
            id: String(variant?.id ?? `variant-${index + 1}`),
            name: String(variant?.displayName ?? variant?.name ?? '').trim(),
            colorHex: typeof variant?.colorHex === 'string' ? String(variant.colorHex) : undefined,
          }))
          .filter((variant: { id: string; name: string }) => variant.id && variant.name)
      : [],
  };
}

export function CatalogImageDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<CatalogImageOverrideMaps>({
    byProductId: {},
    byProductName: {},
    byVariantKey: {},
  });
  const [draftImages, setDraftImages] = useState<Record<string, string>>({});
  const [draftVariantImages, setDraftVariantImages] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<WebCatalogProduct[]>([]);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'with-variants' | 'variant-images-pending'>('with-variants');
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!open) return;

    const unsubscribeProducts = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const nextProducts = snapshot.docs
          .map((item) => mapProduct(item.id, item.data()))
          .filter((item) => item.status === 'active')
          .sort((left, right) => left.name.localeCompare(right.name));
        setProducts(nextProducts);
      },
      (error) => {
        console.error('Error leyendo productos del catalogo web:', error);
        setProducts([]);
      }
    );

    const unsubscribeImages = onSnapshot(
      collection(db, 'siteAssets'),
      (snapshot) => {
        setOverrides(extractCatalogImageOverrides(snapshot));
      },
      (error) => {
        console.error('Error leyendo imagenes del catalogo:', error);
        setOverrides({ byProductId: {}, byProductName: {}, byVariantKey: {} });
      }
    );

    return () => {
      unsubscribeProducts();
      unsubscribeImages();
    };
  }, [open]);

  const previewItems = useMemo(
    () =>
      products.map((item) => ({
        ...item,
        previewImage:
          draftImages[item.id] ?? resolveCatalogImageOverride(item.id, item.name, item.image, overrides),
        variants: item.variants.map((variant) => ({
          ...variant,
          previewImage:
            draftVariantImages[buildCatalogVariantImageKey(item.id, variant.id)] ??
            resolveCatalogVariantImageOverride(
              item.id,
              variant.id,
              draftImages[item.id] ?? resolveCatalogImageOverride(item.id, item.name, item.image, overrides),
              overrides
            ),
        })),
      })),
    [draftImages, draftVariantImages, overrides, products]
  );
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return previewItems.filter((item) => {
      const matchesSearch =
        !normalizedSearch || `${item.name} ${item.brand}`.toLowerCase().includes(normalizedSearch);

      if (!matchesSearch) return false;

      if (viewMode === 'with-variants') {
        return item.variants.length > 0;
      }

      if (viewMode === 'variant-images-pending') {
        return (
          item.variants.length > 0 &&
          item.variants.some(
            (variant) => !overrides.byVariantKey[buildCatalogVariantImageKey(item.id, variant.id)]
          )
        );
      }

      return true;
    });
  }, [overrides.byVariantKey, previewItems, search, viewMode]);

  const summary = useMemo(() => {
    const productsWithVariants = previewItems.filter((item) => item.variants.length > 0);
    const totalVariants = productsWithVariants.reduce((sum, item) => sum + item.variants.length, 0);
    const variantsWithImage = productsWithVariants.reduce(
      (sum, item) =>
        sum +
        item.variants.filter((variant) =>
          Boolean(overrides.byVariantKey[buildCatalogVariantImageKey(item.id, variant.id)])
        ).length,
      0
    );

    return {
      totalProducts: previewItems.length,
      productsWithVariants: productsWithVariants.length,
      totalVariants,
      variantsWithImage,
      variantsPending: Math.max(totalVariants - variantsWithImage, 0),
    };
  }, [overrides.byVariantKey, previewItems]);

  const handleSaveProductImage = async (productId: string, productName: string, image: string) => {
    setSavingProductId(productId);
    try {
      const normalizedProductName = normalizeCatalogImageName(productName);

      await runFirestoreWriteWithBackoff(() =>
        setDoc(
          doc(db, 'siteAssets', `catalog-image-${productId}`),
          {
            productId,
            productName,
            productNameKey: normalizedProductName,
            image,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      );

      setOverrides((current) => ({
        byProductId: {
          ...current.byProductId,
          [productId]: image,
        },
        byProductName: {
          ...current.byProductName,
          [normalizedProductName]: image,
        },
        byVariantKey: current.byVariantKey,
      }));
      setDraftImages((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });

      toast({
        title: 'Imagen actualizada',
        description: `${productName} ya quedo actualizada en la web.`,
      });
    } catch (error) {
      console.error('Error guardando imagen del catalogo:', error);
      toast({
        title: 'No se pudo guardar la imagen',
        description: 'Intenta de nuevo. La foto no se alcanzo a publicar en la web.',
        variant: 'destructive',
      });
    } finally {
      setSavingProductId(null);
    }
  };

  const handleSaveVariantImage = async (
    productId: string,
    productName: string,
    variantId: string,
    variantName: string,
    image: string
  ) => {
    const savingKey = buildCatalogVariantImageKey(productId, variantId);
    setSavingProductId(savingKey);
    try {
      await runFirestoreWriteWithBackoff(() =>
        setDoc(
          doc(db, 'siteAssets', `catalog-variant-image-${productId}-${variantId}`),
          {
            productId,
            productName,
            variantId,
            variantName,
            image,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      );

      setOverrides((current) => ({
        ...current,
        byVariantKey: {
          ...current.byVariantKey,
          [savingKey]: image,
        },
      }));
      setDraftVariantImages((current) => {
        const next = { ...current };
        delete next[savingKey];
        return next;
      });

      toast({
        title: 'Imagen de variante actualizada',
        description: `${productName} - ${variantName} ya quedo lista para la web.`,
      });
    } catch (error) {
      console.error('Error guardando imagen de variante:', error);
      toast({
        title: 'No se pudo guardar la imagen de la variante',
        description: 'Intenta de nuevo. La foto no se alcanzo a publicar en la web.',
        variant: 'destructive',
      });
    } finally {
      setSavingProductId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(1040px,calc(100vw-1rem))] max-w-[min(1040px,calc(100vw-1rem))] overflow-y-auto px-4 sm:max-w-[min(1040px,calc(100vw-3rem))] sm:px-5 lg:px-6">
        <DialogHeader>
          <DialogTitle>Imagenes del catalogo web</DialogTitle>
          <DialogDescription>
            Aqui cambias las imagenes de los productos que se muestran en la tienda virtual y en los destacados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto o marca"
              className="rounded-xl"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={viewMode === 'with-variants' ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => setViewMode('with-variants')}
              >
                <Images className="h-4 w-4" />
                Con variantes
              </Button>
              <Button
                type="button"
                variant={viewMode === 'variant-images-pending' ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => setViewMode('variant-images-pending')}
              >
                Pendientes
              </Button>
              <Button
                type="button"
                variant={viewMode === 'all' ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => setViewMode('all')}
              >
                Todos
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Productos visibles</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{summary.totalProducts}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Productos con variantes</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{summary.productsWithVariants}</p>
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="text-xs text-cyan-800">Variantes con foto web</p>
              <p className="mt-1 text-2xl font-semibold text-cyan-950">{summary.variantsWithImage}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-800">Variantes pendientes</p>
              <p className="mt-1 text-2xl font-semibold text-amber-950">{summary.variantsPending}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            La imagen principal sigue siendo la base del producto. Solo sube imagen por variante cuando esa combinacion realmente necesite verse distinta en la web.
          </div>

          <div className="space-y-4">
            {filteredItems.map((item) => (
            <div key={item.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
              <div className="grid gap-5 xl:grid-cols-[180px_minmax(0,1fr)] xl:items-start">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100">
                  <div className="relative aspect-square w-full">
                    <Image
                      src={item.previewImage}
                      alt={item.name}
                      fill
                      className="object-cover"
                      unoptimized={item.previewImage.startsWith('data:')}
                    />
                  </div>
                </div>
                <div className="min-w-0 space-y-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-slate-900">{item.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{item.brand || 'Sin marca registrada'}</p>
                      </div>
                      <p className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                        ID: {item.id}
                      </p>
                    </div>
                    {item.variants.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                          {item.variants.length} variantes
                        </span>
                        <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-medium text-cyan-800">
                          {
                            item.variants.filter((variant) =>
                              Boolean(overrides.byVariantKey[buildCatalogVariantImageKey(item.id, variant.id)])
                            ).length
                          } con foto web
                        </span>
                      </div>
                    ) : null}
                    <p className="text-xs leading-5 text-slate-500">
                      {overrides.byProductId[item.id] ||
                      overrides.byProductName[normalizeCatalogImageName(item.name)]
                        ? 'Esta imagen esta activa en la web y puedes usarla como base del producto.'
                        : 'La imagen mostrada coincide con la imagen base del producto.'}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:max-w-3xl">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto w-full rounded-xl border-dashed px-3 py-3 text-center text-[11px] leading-tight whitespace-normal break-words sm:text-xs"
                      disabled={savingProductId === item.id}
                      onClick={() => fileInputsRef.current[item.id]?.click()}
                    >
                      {savingProductId === item.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="h-4 w-4" />
                      )}
                      {savingProductId === item.id ? 'Guardando imagen...' : 'Subir y publicar imagen principal'}
                    </Button>
                    <input
                      ref={(element) => {
                        fileInputsRef.current[item.id] = element;
                      }}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={async (event) => {
                        try {
                          await loadFileAsDataUrl(event, (value) =>
                            setDraftImages((current) => ({ ...current, [item.id]: value }))
                          );
                        } catch (error) {
                          console.error('Error preparando imagen del catalogo:', error);
                          toast({
                            title: 'No se pudo cargar la imagen',
                            description:
                              'Prueba con otra foto. Si viene muy pesada del celular, ahora intentamos reducirla automaticamente.',
                            variant: 'destructive',
                          });
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto rounded-xl px-3 py-2.5 text-center text-[11px] leading-tight whitespace-normal break-words sm:text-xs"
                      disabled={!draftImages[item.id] || savingProductId === item.id}
                      onClick={() =>
                        setDraftImages((current) => {
                          const next = { ...current };
                          delete next[item.id];
                          return next;
                        })
                      }
                    >
                      <RotateCcw className="h-4 w-4" />
                      Descartar cambio
                    </Button>
                    <Button
                      type="button"
                      className="h-auto rounded-xl px-3 py-2.5 text-center text-[11px] leading-tight whitespace-normal break-words sm:text-xs"
                      disabled={!draftImages[item.id] || savingProductId === item.id}
                      onClick={async () => {
                        const draftImage = draftImages[item.id];
                        if (!draftImage) return;
                        await handleSaveProductImage(item.id, item.name, draftImage);
                        onSaved?.();
                      }}
                    >
                      {savingProductId === item.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      {savingProductId === item.id ? 'Guardando...' : 'Guardar cambio'}
                    </Button>
                  </div>
                </div>
              </div>

              {item.variants.length > 0 ? (
                <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-900">
                    Imagenes por variante ({item.variants.length})
                  </summary>
                  <p className="mt-2 text-xs text-slate-500">
                    Solo carga foto por variante cuando realmente la necesites en la web. Si no, se usa la imagen principal.
                  </p>
                  <div className="mt-4 space-y-3">
                    {item.variants.map((variant) => {
                      const variantKey = buildCatalogVariantImageKey(item.id, variant.id);
                      return (
                        <div
                          key={variant.id}
                          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[88px_minmax(0,1fr)_auto] md:items-center"
                        >
                          <div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100">
                            <Image
                              src={variant.previewImage}
                              alt={`${item.name} ${variant.name}`}
                              fill
                              className="object-cover"
                              unoptimized={variant.previewImage.startsWith('data:')}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {variant.colorHex ? (
                                <span
                                  className="h-4 w-4 rounded-full border border-slate-300"
                                  style={{ backgroundColor: variant.colorHex }}
                                />
                              ) : null}
                              <p className="truncate text-sm font-medium text-slate-900">{variant.name}</p>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                {overrides.byVariantKey[variantKey] ? 'Foto web lista' : 'Usa imagen principal'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              Si subes una foto aqui, esta variante cambiara su imagen en la web. Si no, hereda la imagen principal.
                            </p>
                          </div>
                          <div className="grid gap-2 md:w-[220px]">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-auto rounded-xl border-dashed px-3 py-2 text-[11px] sm:text-xs"
                              disabled={savingProductId === variantKey}
                              onClick={() => fileInputsRef.current[variantKey]?.click()}
                            >
                              <ImagePlus className="h-4 w-4" />
                              Subir
                            </Button>
                            <input
                              ref={(element) => {
                                fileInputsRef.current[variantKey] = element;
                              }}
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={async (event) => {
                                try {
                                  await loadFileAsDataUrl(event, (value) =>
                                    setDraftVariantImages((current) => ({ ...current, [variantKey]: value }))
                                  );
                                } catch (error) {
                                  console.error('Error preparando imagen de variante:', error);
                                  toast({
                                    title: 'No se pudo cargar la imagen',
                                    description: 'Prueba con otra foto. La imagen se reduce automaticamente antes de guardarse.',
                                    variant: 'destructive',
                                  });
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="h-auto rounded-xl px-3 py-2 text-[11px] sm:text-xs"
                              disabled={!draftVariantImages[variantKey] || savingProductId === variantKey}
                              onClick={() =>
                                setDraftVariantImages((current) => {
                                  const next = { ...current };
                                  delete next[variantKey];
                                  return next;
                                })
                              }
                            >
                              <RotateCcw className="h-4 w-4" />
                              Descartar
                            </Button>
                            <Button
                              type="button"
                              className="h-auto rounded-xl px-3 py-2 text-[11px] sm:text-xs"
                              disabled={!draftVariantImages[variantKey] || savingProductId === variantKey}
                              onClick={async () => {
                                const draftImage = draftVariantImages[variantKey];
                                if (!draftImage) return;
                                await handleSaveVariantImage(item.id, item.name, variant.id, variant.name, draftImage);
                                onSaved?.();
                              }}
                            >
                              {savingProductId === variantKey ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              Guardar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ) : null}
            </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

