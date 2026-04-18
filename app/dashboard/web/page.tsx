'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Globe, ImagePlus, RefreshCcw, Save } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { CatalogImageDialog } from '@/components/admin/products/catalog-image-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAdminData } from '@/components/admin/admin-data-context';
import {
  getFriendlyFirestoreWriteErrorMessage,
  runFirestoreWriteWithBackoff,
} from '@/lib/firestore-write-retry';
import { db } from '@/lib/firebase';
import { optimizeImageFile } from '@/lib/image-upload';

async function loadFileAsDataUrl(
  event: ChangeEvent<HTMLInputElement>,
  onLoaded: (value: string) => void
) {
  const file = event.target.files?.[0];
  if (!file) return;

  const optimizedImage = await optimizeImageFile(file, {
    maxWidth: 960,
    maxHeight: 960,
    quality: 0.74,
    minQuality: 0.52,
    maxBytes: 170 * 1024,
  });
  onLoaded(optimizedImage.dataUrl);
  event.target.value = '';
}

export default function WebPageManagementPage() {
  const { toast } = useToast();
  const { syncPublicProductStocks } = useAdminData();
  const [openCatalogImageDialog, setOpenCatalogImageDialog] = useState(false);
  const [serviceImages, setServiceImages] = useState<string[]>([]);
  const [draftServiceImages, setDraftServiceImages] = useState<string[]>([]);
  const [savingServices, setSavingServices] = useState(false);
  const [syncingPublicStock, setSyncingPublicStock] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'siteAssets', 'services-gallery'),
      (snapshot) => {
        const data = snapshot.data();
        const nextImages = Array.isArray(data?.images)
          ? data.images.filter((item): item is string => typeof item === 'string').slice(0, 3)
          : [];

        setServiceImages(nextImages);
        setDraftServiceImages(nextImages);
      },
      (error) => {
        console.error('Error leyendo galeria de servicios:', error);
        setServiceImages([]);
        setDraftServiceImages([]);
      }
    );

    return () => unsubscribe();
  }, []);

  const serviceSlots = useMemo(() => Array.from({ length: 3 }, (_, index) => index), []);

  const handleSaveServiceImages = async () => {
    setSavingServices(true);
    try {
      await runFirestoreWriteWithBackoff(() =>
        setDoc(
          doc(db, 'siteAssets', 'services-gallery'),
          {
            images: draftServiceImages.filter(Boolean).slice(0, 3),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      );
      toast({
        title: 'Galeria de servicios actualizada',
        description: 'Las fotos del torno y trabajos realizados ya quedaron listas para la web.',
      });
    } catch (error) {
      console.error('Error guardando galeria de servicios:', error);
      toast({
        title: 'No se pudo guardar la galeria',
        description: getFriendlyFirestoreWriteErrorMessage(
          error,
          'Revisa el tamano de las fotos o intenta subirlas otra vez. Ahora la carga se optimiza para movil.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSavingServices(false);
    }
  };

  const handleSyncPublicStock = async () => {
    setSyncingPublicStock(true);
    try {
      const updatedProducts = await syncPublicProductStocks();
      toast({
        title: 'Stock web sincronizado',
        description:
          updatedProducts > 0
            ? `La tienda virtual ya quedo actualizada. Productos sincronizados: ${updatedProducts}.`
            : 'No habia cambios pendientes por sincronizar en el stock publico.',
      });
    } catch (error) {
      console.error('Error sincronizando stock publico:', error);
      toast({
        title: 'No se pudo sincronizar el stock web',
        description: getFriendlyFirestoreWriteErrorMessage(
          error,
          'Intenta nuevamente en unos segundos. Si acabas de hacer muchos cambios, espera un momento antes de reintentar.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSyncingPublicStock(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SectionHeader
        eyebrow="Gestion web"
        title="Pagina web y contenido visual"
        description="Administra las imagenes del catalogo publico y una galeria corta de trabajos para la seccion de servicios."
        actions={
          <Button
            type="button"
            className="w-full rounded-xl sm:w-auto"
            onClick={() => setOpenCatalogImageDialog(true)}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            Imagenes de productos
          </Button>
        }
      />

      <div className="grid gap-4 sm:gap-6 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="rounded-3xl border border-border bg-card/88 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_18px_40px_rgba(2,6,23,0.24)] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="rounded-2xl bg-cyan-50 p-3 dark:bg-cyan-950/50">
              <Globe className="h-5 w-5 text-cyan-700 dark:text-cyan-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Catalogo y tienda virtual</h2>
              <p className="mt-1 hidden text-sm leading-6 text-slate-500 dark:text-slate-400 sm:block">
                Desde aqui puedes cambiar las fotos que se ven en la portada destacada y en la tienda virtual sin tocar el inventario.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-dashed border-border bg-muted/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/70 sm:mt-5 sm:p-5">
            <p className="text-sm font-medium text-foreground">Recomendacion</p>
            <p className="mt-2 hidden text-sm leading-6 text-slate-600 dark:text-slate-300 sm:block">
              Lo mejor es concentrar aqui todo lo visual de la web: fotos del catalogo, galeria de servicios y luego textos destacados si decides cambiarlos despues.
            </p>
            <div className="mt-3 grid gap-2 sm:mt-4 sm:flex sm:flex-wrap">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl sm:w-auto"
                onClick={() => setOpenCatalogImageDialog(true)}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Gestionar imagenes del catalogo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl sm:w-auto"
                onClick={handleSyncPublicStock}
                disabled={syncingPublicStock}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {syncingPublicStock ? 'Sincronizando stock...' : 'Sincronizar stock web'}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card/88 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_18px_40px_rgba(2,6,23,0.24)] sm:p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Trabajos del torno en servicios</h2>
            <p className="mt-1 hidden text-sm leading-6 text-slate-500 dark:text-slate-400 sm:block">
              Sube maximo 3 imagenes de cambios de casquillo, suela u otros trabajos en tacos. Asi se ve profesional y no recarga la pagina.
            </p>
            <p className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">Las imagenes ahora se optimizan automaticamente al subirlas desde el celular.</p>
          </div>

          <div className="mt-4 grid gap-3.5 sm:mt-5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {serviceSlots.map((slot) => {
              const image = draftServiceImages[slot] || '';
              return (
                <div key={slot} className="rounded-3xl border border-border bg-muted/70 p-3 dark:border-slate-800 dark:bg-slate-900/70 sm:p-4">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
                    <div className="relative aspect-[4/5] w-full">
                      {image ? (
                        <Image
                          src={image}
                          alt={`Trabajo ${slot + 1}`}
                          fill
                          className="object-cover"
                          unoptimized={image.startsWith('data:')}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-400 dark:text-slate-500">
                          Sin imagen cargada
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-cyan-400 hover:bg-cyan-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/40">
                      <ImagePlus className="h-4 w-4" />
                      Subir imagen
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (event) => {
                          try {
                            await loadFileAsDataUrl(event, (value) =>
                              setDraftServiceImages((current) => {
                                const next = [...current];
                                next[slot] = value;
                                return next;
                              })
                            );
                          } catch (error) {
                            console.error('Error preparando imagen de servicios:', error);
                            toast({
                              title: 'No se pudo cargar la imagen',
                              description:
                                'Intenta con otra foto o vuelve a seleccionarla. En movil la imagen se comprime antes de guardarse.',
                              variant: 'destructive',
                            });
                          }
                        }}
                      />
                    </label>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-xl"
                      onClick={() =>
                        setDraftServiceImages((current) => {
                          const next = [...current];
                          next[slot] = '';
                          return next;
                        })
                      }
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Limpiar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 hidden flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/75 p-3.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/22 dark:text-amber-100 sm:mt-5 sm:flex sm:p-4">
            <p className="font-medium">Sugerencia visual</p>
            <p>
              Lo mejor es mostrar solo 2 o 3 fotos pequenas de trabajos reales debajo del bloque del torno. Asi inspiran confianza sin que la pagina se vea ligera y no recargada.
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:mt-5 sm:flex sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl sm:w-auto"
              onClick={() => setDraftServiceImages(serviceImages)}
            >
              Restaurar cambios
            </Button>
            <Button
              type="button"
              className="w-full rounded-xl sm:w-auto"
              onClick={handleSaveServiceImages}
              disabled={savingServices}
            >
              <Save className="mr-2 h-4 w-4" />
              {savingServices ? 'Guardando...' : 'Guardar galeria'}
            </Button>
          </div>
        </section>
      </div>

      <CatalogImageDialog
        open={openCatalogImageDialog}
        onOpenChange={setOpenCatalogImageDialog}
        onSaved={() =>
          toast({
            title: 'Imagenes actualizadas',
            description: 'La tienda virtual ya puede mostrar las nuevas fotos.',
          })
        }
      />
    </div>
  );
}
