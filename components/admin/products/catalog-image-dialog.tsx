'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, type DocumentData, writeBatch } from 'firebase/firestore';
import { ImagePlus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<WebCatalogProduct[]>([]);
  const [saving, setSaving] = useState(false);
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
        const images: Record<string, string> = {};

        snapshot.docs.forEach((item) => {
          if (item.id === 'catalog-images') {
            const data = item.data();
            if (data && typeof data === 'object' && data.images && typeof data.images === 'object') {
              Object.assign(images, data.images as Record<string, string>);
            }
            return;
          }

          if (!item.id.startsWith('catalog-image-')) return;
          const productId = String(item.data().productId ?? item.id.replace('catalog-image-', ''));
          const image = item.data().image;
          if (typeof image === 'string' && productId) {
            images[productId] = image;
          }
        });

        setOverrides(images);
      },
      (error) => {
        console.error('Error leyendo imagenes del catalogo:', error);
        setOverrides({});
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
        previewImage: overrides[item.id] || item.image,
      })),
    [overrides, products]
  );
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return previewItems;

    return previewItems.filter((item) =>
      `${item.name} ${item.brand}`.toLowerCase().includes(normalizedSearch)
    );
  }, [previewItems, search]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const batch = writeBatch(db);
      Object.entries(overrides).forEach(([productId, image]) => {
        batch.set(
          doc(db, 'siteAssets', `catalog-image-${productId}`),
          {
            productId,
            image,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando imagenes del catalogo:', error);
      toast({
        title: 'No se pudieron guardar las imagenes',
        description: 'Intenta de nuevo. Ahora cada imagen se guarda por producto para evitar bloqueos.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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

              <div className="mt-4">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="mt-1 text-xs text-slate-500">{item.brand || 'Sin marca registrada'}</p>
              </div>

              <div className="mt-4 space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl border-dashed"
                  onClick={() => fileInputsRef.current[item.id]?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  Subir nueva imagen
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
                        setOverrides((current) => ({ ...current, [item.id]: value }))
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
              </div>
            </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar imagenes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
