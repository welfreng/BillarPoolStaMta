'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore';
import { Check, ImagePlus, LoaderCircle, RotateCcw } from 'lucide-react';
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
  extractCatalogImageOverrides,
  normalizeCatalogImageName,
  resolveCatalogImageOverride,
  type CatalogImageOverrideMaps,
} from '@/lib/catalog-image-overrides';
import { db } from '@/lib/firebase';
import { optimizeImageFile } from '@/lib/image-upload';
import { useToast } from '@/hooks/use-toast';

interface WebCatalogProduct {
  id: string;
  name: string;
  brand: string;
  image: string;
  status: 'active' | 'draft' | 'archived';
}

async function loadFileAsDataUrl(
  event: ChangeEvent<HTMLInputElement>,
  onLoaded: (value: string) => void
) {
  const file = event.target.files?.[0];
  if (!file) return;

  const optimizedImage = await optimizeImageFile(file, {
    maxWidth: 1400,
    maxHeight: 1400,
    quality: 0.84,
  });
  onLoaded(optimizedImage.dataUrl);
  event.target.value = '';
}

function mapProduct(documentId: string, data: DocumentData): WebCatalogProduct {
  return {
    id: documentId,
    name: String(data.name ?? 'Producto'),
    brand: String(data.brand ?? ''),
    image: String(data.image ?? '/images/logo.png'),
    status:
      data.status === 'draft' || data.status === 'archived' || data.status === 'active'
        ? data.status
        : 'active',
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
  const [overrides, setOverrides] = useState<CatalogImageOverrideMaps>({ byProductId: {}, byProductName: {} });
  const [draftImages, setDraftImages] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<WebCatalogProduct[]>([]);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
        setOverrides({ byProductId: {}, byProductName: {} });
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
      })),
    [draftImages, overrides, products]
  );
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return previewItems;

    return previewItems.filter((item) =>
      `${item.name} ${item.brand}`.toLowerCase().includes(normalizedSearch)
    );
  }, [previewItems, search]);

  const handleSaveProductImage = async (productId: string, productName: string, image: string) => {
    setSavingProductId(productId);
    try {
      const normalizedProductName = normalizeCatalogImageName(productName);

      await setDoc(
        doc(db, 'siteAssets', `catalog-image-${productId}`),
        {
          productId,
          productName,
          productNameKey: normalizedProductName,
          image,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
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
      }));
      setDraftImages((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });

      toast({
        title: 'Imagen actualizada',
        description: `${productName} ya quedó actualizada en la web.`,
      });
    } catch (error) {
      console.error('Error guardando imagen del catalogo:', error);
      toast({
        title: 'No se pudo guardar la imagen',
        description: 'Intenta de nuevo. La foto no se alcanzó a publicar en la web.',
        variant: 'destructive',
      });
    } finally {
      setSavingProductId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-7xl overflow-y-auto px-4 sm:px-5 lg:px-6">
        <DialogHeader>
          <DialogTitle>Imagenes del catalogo web</DialogTitle>
          <DialogDescription>
            Aqui cambias las imagenes de los productos que se muestran en la tienda virtual y en los destacados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto o marca"
            className="rounded-xl"
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
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

              <div className="mt-3">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="mt-1 text-xs text-slate-500">{item.brand || 'Sin marca registrada'}</p>
                <p className="mt-1 text-[11px] text-slate-400">ID: {item.id}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {overrides.byProductId[item.id] ||
                    overrides.byProductName[normalizeCatalogImageName(item.name)]
                    ? 'Esta imagen esta activa en la web y puedes pasarla como base del producto.'
                    : 'La imagen mostrada ya coincide con la imagen base del producto.'}
                </p>
              </div>

              <div className="mt-3 space-y-2.5">
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
                  {savingProductId === item.id ? 'Guardando imagen...' : 'Subir y publicar imagen'}
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
                <div className="grid grid-cols-2 gap-3 pt-1">
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
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
