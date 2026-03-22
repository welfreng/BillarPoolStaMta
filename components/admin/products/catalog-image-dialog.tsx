'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore';
import { ImagePlus, RefreshCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { db } from '@/lib/firebase';

interface WebCatalogProduct {
  id: string;
  name: string;
  brand: string;
  image: string;
  status: 'active' | 'draft' | 'archived';
}

function loadFileAsDataUrl(
  event: ChangeEvent<HTMLInputElement>,
  onLoaded: (value: string) => void
) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      onLoaded(reader.result);
    }
  };
  reader.readAsDataURL(file);
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
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<WebCatalogProduct[]>([]);
  const [saving, setSaving] = useState(false);

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
      doc(db, 'siteAssets', 'catalog-images'),
      (snapshot) => {
        const data = snapshot.data();
        const images =
          data && typeof data === 'object' && data.images && typeof data.images === 'object'
            ? (data.images as Record<string, string>)
            : {};
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'siteAssets', 'catalog-images'),
        {
          images: overrides,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const restoreImage = (productId: string) => {
    setOverrides((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {previewItems.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <div className="relative aspect-[16/10] w-full">
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
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-cyan-400 hover:bg-cyan-50">
                  <ImagePlus className="h-4 w-4" />
                  Subir nueva imagen
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) =>
                      loadFileAsDataUrl(event, (value) =>
                        setOverrides((current) => ({ ...current, [item.id]: value }))
                      )
                    }
                  />
                </label>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => restoreImage(item.id)}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Restaurar imagen original
                </Button>
              </div>
            </div>
          ))}
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
