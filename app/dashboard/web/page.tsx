'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Edit3, Globe, ImagePlus, Megaphone, Plus, RefreshCcw, Save, Trash2 } from 'lucide-react';
import { SectionHeader } from '@/components/admin/shared/section-header';
import { CatalogImageDialog } from '@/components/admin/products/catalog-image-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
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

interface PromotionDraft {
  id: string;
  title: string;
  description: string;
  productId: string;
  productName: string;
  productImage: string;
  priceText: string;
  giftText: string;
  conditionText: string;
  urgencyText: string;
  endsAt: string;
  durationHours: number;
  durationMinutes: number;
  ctaText: string;
  active: boolean;
}

function getDatetimeLocalValue(value: Date) {
  const timezoneOffsetMs = value.getTimezoneOffset() * 60 * 1000;
  return new Date(value.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toDatetimeLocalValue(isoValue: string) {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return getDatetimeLocalValue(date);
}

function fromDatetimeLocalValue(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function getPromotionEndDateInHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function getPromotionEndDateFromDuration(hours: number, minutes: number) {
  const normalizedHours = Math.max(Number(hours || 0), 0);
  const normalizedMinutes = Math.max(Number(minutes || 0), 0);
  const totalMinutes = Math.max(normalizedHours * 60 + normalizedMinutes, 1);
  return new Date(Date.now() + totalMinutes * 60 * 1000).toISOString();
}

function getPromotionStatus(promotion: PromotionDraft, now = Date.now()) {
  if (!promotion.active) {
    return {
      label: 'Pausada',
      helper: 'Guardada en el panel, oculta en la web.',
      className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
    };
  }

  if (promotion.endsAt) {
    const endTime = new Date(promotion.endsAt).getTime();
    if (!Number.isNaN(endTime) && endTime <= now) {
      return {
        label: 'Vencida',
        helper: 'No se muestra en la web hasta que la reactives.',
        className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
      };
    }
  }

  return {
    label: 'Visible',
    helper: 'Activa y disponible en la pagina publica.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  };
}

function formatPromotionDate(value: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatPromotionPriceText(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';

  const formatCopAmount = (amount: number) =>
    `$ ${new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 0,
    }).format(amount)}`;

  const parseCurrencyText = (text: string) => {
    const numericCandidate = text
      .trim()
      .replace(/\s/g, '')
      .replace(/\$/g, '')
      .replace(/COP/gi, '')
      .replace(/\./g, '')
      .replace(/,/g, '.');
    const parsedValue = Number(numericCandidate);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  };

  const parsedValue = parseCurrencyText(trimmedValue);
  if (parsedValue !== null) return formatCopAmount(parsedValue);

  return trimmedValue.replace(/(?:COP\s*)?\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:,\d+)?/gi, (match) => {
    const parsedMatch = parseCurrencyText(match);
    return parsedMatch === null ? match : formatCopAmount(parsedMatch);
  });
}

function sanitizePromotionPriceText(value: string) {
  return formatPromotionPriceText(value);
}

function createPromotionDraft(index: number): PromotionDraft {
  return {
    id: `promotion-${Date.now()}-${index}`,
    title: '',
    description: '',
    productId: '',
    productName: '',
    productImage: '',
    priceText: '',
    giftText: '',
    conditionText: '',
    urgencyText: 'No dejes pasar esta oportunidad',
    endsAt: getPromotionEndDateInHours(1),
    durationHours: 1,
    durationMinutes: 0,
    ctaText: 'Quiero esta promocion',
    active: true,
  };
}

function sanitizePromotionDraft(item: Partial<PromotionDraft>, index: number): PromotionDraft {
  return {
    id: String(item.id || `promotion-${index + 1}`),
    title: String(item.title || ''),
    description: String(item.description || ''),
    productId: String(item.productId || ''),
    productName: String(item.productName || ''),
    productImage: String(item.productImage || ''),
    priceText: sanitizePromotionPriceText(String(item.priceText || '')),
    giftText: String(item.giftText || ''),
    conditionText: String(item.conditionText || ''),
    urgencyText: String(item.urgencyText || 'No dejes pasar esta oportunidad'),
    endsAt: String(item.endsAt || ''),
    durationHours: Number(item.durationHours ?? 1),
    durationMinutes: Number(item.durationMinutes ?? 0),
    ctaText: String(item.ctaText || 'Quiero esta promocion'),
    active: item.active !== false,
  };
}

function cleanPromotionDrafts(drafts: PromotionDraft[]) {
  return drafts
    .map((promotion, index) => ({
      id: promotion.id || `promotion-${index + 1}`,
      title: promotion.title.trim(),
      description: promotion.description.trim(),
      productId: promotion.productId,
      productName: promotion.productName.trim(),
      productImage: promotion.productImage,
      priceText: sanitizePromotionPriceText(promotion.priceText),
      giftText: promotion.giftText.trim(),
      conditionText: promotion.conditionText.trim(),
      urgencyText: promotion.urgencyText.trim() || 'No dejes pasar esta oportunidad',
      endsAt: promotion.endsAt,
      ctaText: promotion.ctaText.trim() || 'Quiero esta promocion',
      durationHours: promotion.durationHours,
      durationMinutes: promotion.durationMinutes,
      active: promotion.active,
    }))
    .filter((promotion) => promotion.title || promotion.productImage || promotion.giftText || promotion.description)
    .slice(0, 50);
}

function clearPublicPromotionsCache() {
  if (typeof window === 'undefined') return;
  ['bp-public-promotions-cache-v1', 'bp-public-promotions-cache-v2', 'bp-public-promotions-cache-v3'].forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

export default function WebPageManagementPage() {
  const { toast } = useToast();
  const [openCatalogImageDialog, setOpenCatalogImageDialog] = useState(false);
  const [serviceImages, setServiceImages] = useState<string[]>([]);
  const [draftServiceImages, setDraftServiceImages] = useState<string[]>([]);
  const [savingServices, setSavingServices] = useState(false);
  const [promotions, setPromotions] = useState<PromotionDraft[]>([]);
  const [draftPromotions, setDraftPromotions] = useState<PromotionDraft[]>([]);
  const [savingPromotions, setSavingPromotions] = useState(false);
  const [promotionNow, setPromotionNow] = useState(() => Date.now());
  const [selectedPromotionId, setSelectedPromotionId] = useState<string | null>(null);
  const selectedPromotion =
    draftPromotions.find((promotion) => promotion.id === selectedPromotionId) ?? draftPromotions[0] ?? null;

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

  useEffect(() => {
    const interval = window.setInterval(() => setPromotionNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'siteAssets', 'promotions'),
      (snapshot) => {
        const data = snapshot.data();
        const nextPromotions = Array.isArray(data?.items)
          ? data.items.map(sanitizePromotionDraft).slice(0, 50)
          : [];

        setPromotions(nextPromotions);
        setDraftPromotions(nextPromotions);
        setSelectedPromotionId((current) => current ?? nextPromotions[0]?.id ?? null);
      },
      (error) => {
        console.error('Error leyendo promociones:', error);
        setPromotions([]);
        setDraftPromotions([]);
      }
    );

    return () => unsubscribe();
  }, []);

  const serviceSlots = useMemo(() => Array.from({ length: 3 }, (_, index) => index), []);

  const updatePromotion = (promotionId: string, values: Partial<PromotionDraft>) => {
    setDraftPromotions((current) =>
      current.map((promotion) =>
        promotion.id === promotionId
          ? {
              ...promotion,
              ...values,
            }
          : promotion
      )
    );
  };

  const applyPromotionDuration = (promotion: PromotionDraft) => {
    updatePromotion(promotion.id, {
      active: true,
      endsAt: getPromotionEndDateFromDuration(promotion.durationHours, promotion.durationMinutes),
    });
  };

  const persistPromotions = async (nextPromotions: PromotionDraft[]) => {
    await runFirestoreWriteWithBackoff(() =>
      setDoc(
        doc(db, 'siteAssets', 'promotions'),
        {
          items: cleanPromotionDrafts(nextPromotions),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
    clearPublicPromotionsCache();
  };

  const handleDeletePromotion = async (promotionId: string) => {
    const nextPromotions = draftPromotions.filter((promotion) => promotion.id !== promotionId);
    setDraftPromotions(nextPromotions);
    setSelectedPromotionId((current) =>
      current === promotionId ? nextPromotions[0]?.id ?? null : current
    );
    setSavingPromotions(true);
    try {
      await persistPromotions(nextPromotions);
      toast({
        title: 'Promocion eliminada',
        description: 'La oferta ya no debe mostrarse en la pagina principal.',
      });
    } catch (error) {
      console.error('Error eliminando promocion:', error);
      toast({
        title: 'No se pudo eliminar la promocion',
        description: getFriendlyFirestoreWriteErrorMessage(
          error,
          'Intenta eliminarla nuevamente en unos segundos.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSavingPromotions(false);
    }
  };

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

  const handleSavePromotions = async () => {
    setSavingPromotions(true);
    try {
      await persistPromotions(draftPromotions);

      toast({
        title: 'Promociones actualizadas',
        description: 'La pagina publica ya puede mostrar las promociones activas.',
      });
    } catch (error) {
      console.error('Error guardando promociones:', error);
      toast({
        title: 'No se pudieron guardar las promociones',
        description: getFriendlyFirestoreWriteErrorMessage(
          error,
          'Revisa los campos de la promocion e intenta nuevamente.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSavingPromotions(false);
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
        <section className="rounded-2xl border border-border bg-card/88 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_14px_34px_rgba(2,6,23,0.22)] sm:p-5">
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

          <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/70 sm:mt-5 sm:p-4">
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
            </div>
          </div>
        </section>

        <section className="relative rounded-2xl border border-border bg-card/88 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_14px_34px_rgba(2,6,23,0.22)] sm:p-5">
          {savingPromotions ? (
            <div className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-background/82 px-4 text-center backdrop-blur-sm">
              <div className="grid max-w-sm place-items-center gap-3 rounded-xl border bg-card p-5 shadow-lg">
                <Spinner className="h-7 w-7 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Guardando promociones...</p>
                  <p className="text-xs text-muted-foreground">La web publica se actualiza al confirmar.</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-950/50">
                <Megaphone className="h-5 w-5 text-amber-700 dark:text-amber-300" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Promociones activas</h2>
                <p className="mt-1 hidden text-sm leading-6 text-slate-500 dark:text-slate-400 sm:block">
                  Crea ofertas visibles en la pagina publica. Las vencidas se ocultan automaticamente, pero quedan guardadas para reutilizarlas.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl sm:w-auto"
              onClick={() => {
                const nextPromotion = createPromotionDraft(draftPromotions.length + 1);
                setDraftPromotions((current) => [...current, nextPromotion].slice(0, 50));
                setSelectedPromotionId(nextPromotion.id);
              }}
              disabled={draftPromotions.length >= 50}
            >
              <Plus className="mr-2 h-4 w-4" />
              Agregar promocion
            </Button>
          </div>

          {draftPromotions.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/72 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_120px_150px_110px]">
                <span>Promocion</span>
                <span className="hidden sm:block">Estado</span>
                <span>Finaliza</span>
                <span className="hidden text-right sm:block">Accion</span>
              </div>
              <div className="max-h-[22rem] divide-y divide-border overflow-y-auto dark:divide-slate-800">
                {draftPromotions.map((promotion) => {
                  const status = getPromotionStatus(promotion, promotionNow);
                  const isSelected = selectedPromotion?.id === promotion.id;
                  return (
                    <div
                      key={`summary-${promotion.id}`}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_120px_150px_110px] sm:items-center ${
                        isSelected ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          #{draftPromotions.findIndex((item) => item.id === promotion.id) + 1} - {promotion.title || 'Promocion sin titulo'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{status.helper}</p>
                      </div>
                      <span className={`hidden rounded-full border px-3 py-1 text-center text-xs font-semibold sm:inline-flex sm:justify-center ${status.className}`}>
                        {status.label}
                      </span>
                      <span className="text-right text-xs text-muted-foreground sm:text-left">
                        {formatPromotionDate(promotion.endsAt)}
                      </span>
                      <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">
                        <Button
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="rounded-xl"
                          onClick={() => setSelectedPromotionId(promotion.id)}
                        >
                          <Edit3 className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="rounded-xl"
                          onClick={() => void handleDeletePromotion(promotion.id)}
                          disabled={savingPromotions}
                          aria-label="Eliminar promocion"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-4 sm:mt-5">
            {selectedPromotion ? (() => {
              const promotion = selectedPromotion;
              const index = Math.max(draftPromotions.findIndex((item) => item.id === promotion.id), 0);
              return (
              <div key={promotion.id} className="rounded-2xl border border-border bg-muted/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/70 sm:p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Promocion {index + 1}</p>
                    <p className="text-xs text-muted-foreground">
                      Estado: {getPromotionStatus(promotion, promotionNow).label}. Finaliza: {formatPromotionDate(promotion.endsAt)}.
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPromotionStatus(promotion, promotionNow).className}`}>
                      {getPromotionStatus(promotion, promotionNow).label}
                    </span>
                    <Label htmlFor={`promotion-active-${promotion.id}`} className="text-sm text-muted-foreground">
                      Activa
                    </Label>
                    <Switch
                      id={`promotion-active-${promotion.id}`}
                      checked={promotion.active}
                      onCheckedChange={(checked) => updatePromotion(promotion.id, { active: checked })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-xl"
                      onClick={() => void handleDeletePromotion(promotion.id)}
                      disabled={savingPromotions}
                      aria-label="Eliminar promocion"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Imagen de la promocion</Label>
                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/72 p-3 dark:border-slate-800 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 sm:h-24 sm:w-32">
                          {promotion.productImage ? (
                            <Image
                              src={promotion.productImage}
                              alt={promotion.title || promotion.productName || 'Promocion'}
                              fill
                              className="object-contain p-1.5"
                              unoptimized={promotion.productImage.startsWith('data:')}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-400 dark:text-slate-500">
                              Sin imagen
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {promotion.productImage ? 'Imagen cargada' : 'Sin imagen cargada'}
                          </p>
                          <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                            Usa una imagen editada de la promocion. En la web se vera grande y ampliable.
                          </p>
                        </div>
                      </div>
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-amber-500 dark:hover:bg-amber-950/40 sm:w-auto">
                        <ImagePlus className="h-4 w-4" />
                        Subir imagen
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (event) => {
                            try {
                              await loadFileAsDataUrl(event, (value) =>
                                updatePromotion(promotion.id, { productImage: value })
                              );
                            } catch (error) {
                              console.error('Error preparando imagen de promocion:', error);
                              toast({
                                title: 'No se pudo cargar la imagen',
                                description: 'Intenta con otra imagen editada o una version mas liviana.',
                                variant: 'destructive',
                              });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Titulo visible</Label>
                    <Input
                      value={promotion.title}
                      onChange={(event) => updatePromotion(promotion.id, { title: event.target.value })}
                      placeholder="Ej: Taco + casquillo de regalo"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Finalizacion exacta</Label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                      <Input
                        type="datetime-local"
                        value={toDatetimeLocalValue(promotion.endsAt)}
                        onChange={(event) =>
                          updatePromotion(promotion.id, {
                            active: true,
                            endsAt: fromDatetimeLocalValue(event.target.value),
                          })
                        }
                        className="h-9 rounded-xl text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl px-3"
                        onClick={() => applyPromotionDuration(promotion)}
                      >
                        Reactivar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl px-3"
                        onClick={() => updatePromotion(promotion.id, { active: false })}
                      >
                        Pausar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 lg:col-span-2">
                    <Label>Descripcion</Label>
                    <Textarea
                      value={promotion.description}
                      onChange={(event) => updatePromotion(promotion.id, { description: event.target.value })}
                      placeholder="Ej: Compra este taco y recibe un casquillo para instalar en tu proximo mantenimiento."
                      className="min-h-24 rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Oferta o precio</Label>
                    <Input
                      value={promotion.priceText}
                      onChange={(event) => updatePromotion(promotion.id, { priceText: event.target.value })}
                      onBlur={(event) =>
                        updatePromotion(promotion.id, { priceText: formatPromotionPriceText(event.target.value) })
                      }
                      placeholder="Ej: Taco desde $ 250.000"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Obsequio o incluye</Label>
                    <Input
                      value={promotion.giftText}
                      onChange={(event) => updatePromotion(promotion.id, { giftText: event.target.value })}
                      placeholder="Ej: Casquillo incluido; el cliente paga instalacion"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Condicion</Label>
                    <Input
                      value={promotion.conditionText}
                      onChange={(event) => updatePromotion(promotion.id, { conditionText: event.target.value })}
                      placeholder="Ej: Hasta agotar existencias"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Mensaje de urgencia</Label>
                    <Input
                      value={promotion.urgencyText}
                      onChange={(event) => updatePromotion(promotion.id, { urgencyText: event.target.value })}
                      placeholder="No dejes pasar esta oportunidad"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Duracion de la promocion</Label>
                    <Select
                      value={String(promotion.durationHours || 1)}
                      onValueChange={(value) => {
                        const hours = Number(value);
                        updatePromotion(promotion.id, {
                          active: true,
                          durationHours: hours,
                          durationMinutes: 0,
                          endsAt: getPromotionEndDateInHours(hours),
                        });
                      }}
                    >
                      <SelectTrigger className="rounded-xl bg-background/88">
                        <SelectValue placeholder="Selecciona duracion" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 6, 12, 24, 48, 72].map((hours) => (
                          <SelectItem key={hours} value={String(hours)}>
                            {hours === 1 ? '1 hora' : `${hours} horas`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Texto del boton</Label>
                    <Input
                      value={promotion.ctaText}
                      onChange={(event) => updatePromotion(promotion.id, { ctaText: event.target.value })}
                      placeholder="Quiero esta promocion"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
              );
            })() : null}

            {draftPromotions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/70 p-5 text-center text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/70">
                No hay promociones configuradas. Agrega una para mostrarla en la pagina publica.
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2 sm:mt-5 sm:flex sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl sm:w-auto"
              onClick={() => setDraftPromotions(promotions)}
            >
              Restaurar cambios
            </Button>
            <Button
              type="button"
              className="w-full rounded-xl sm:w-auto"
              onClick={handleSavePromotions}
              disabled={savingPromotions}
            >
              <Save className="mr-2 h-4 w-4" />
              {savingPromotions ? 'Guardando...' : 'Guardar promociones'}
            </Button>
          </div>
        </section>

        <section className="relative rounded-2xl border border-border bg-card/88 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-[0_14px_34px_rgba(2,6,23,0.22)] sm:p-5">
          {savingServices ? (
            <div className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-background/82 px-4 text-center backdrop-blur-sm">
              <div className="grid max-w-sm place-items-center gap-3 rounded-xl border bg-card p-5 shadow-lg">
                <Spinner className="h-7 w-7 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Guardando galeria...</p>
                  <p className="text-xs text-muted-foreground">Espera la confirmacion antes de continuar.</p>
                </div>
              </div>
            </div>
          ) : null}
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Trabajos del torno en servicios</h2>
            <p className="mt-1 hidden text-sm leading-6 text-slate-500 dark:text-slate-400 sm:block">
              Sube maximo 3 imagenes de cambios de casquillo, suela u otros trabajos en tacos. Asi se ve profesional y no recarga la pagina.
            </p>
            <p className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">Las imagenes ahora se optimizan automaticamente al subirlas desde el celular.</p>
          </div>

          <div className="mt-4 grid gap-2.5 sm:mt-5">
            {serviceSlots.map((slot) => {
              const image = draftServiceImages[slot] || '';
              return (
                <div
                  key={slot}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-muted/70 p-3 dark:border-slate-800 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 sm:h-20 sm:w-24">
                      {image ? (
                        <Image
                          src={image}
                          alt={`Trabajo ${slot + 1}`}
                          fill
                          className="object-cover"
                          unoptimized={image.startsWith('data:')}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-400 dark:text-slate-500">
                          Sin imagen
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">Trabajo {slot + 1}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {image ? 'Imagen cargada para servicios' : 'Espacio disponible'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:flex sm:items-center sm:justify-end">
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-cyan-400 hover:bg-cyan-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/40">
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
                      size="sm"
                      className="h-10 rounded-xl"
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
