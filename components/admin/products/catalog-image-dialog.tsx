'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
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
import { publicCatalogProducts } from '@/lib/public-catalog';

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const unsubscribe = onSnapshot(
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

    return () => unsubscribe();
  }, [open]);

  const previewItems = useMemo(
    () =>
      publicCatalogProducts.map((item) => ({
        ...item,
        previewImage: overrides[item.id] || item.image,
      })),
    [overrides]
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
            Aqui solo cambias las imagenes de las tarjetas del catalogo publico. Los textos de la pagina no se modifican.
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
                <p className="mt-1 text-xs text-slate-500">{item.tag}</p>
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
