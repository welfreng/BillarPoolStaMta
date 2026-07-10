"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { collection, doc, documentId, getDoc, getDocs, query, type DocumentData, where } from "firebase/firestore"
import { Clock3, Gift, MessageCircle, Sparkles, Tag } from "lucide-react"
import { db } from "@/lib/firebase"
import { SITE_LOGO } from "@/lib/branding"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface PublicPromotion {
  id: string
  title: string
  description: string
  productId: string
  productName: string
  productImage: string
  priceText: string
  giftText: string
  conditionText: string
  urgencyText: string
  endsAt: string
  ctaText: string
  active: boolean
}

const whatsappNumber = "573006775284"

function sanitizePromotion(item: Partial<PublicPromotion>, index: number): PublicPromotion {
  return {
    id: String(item.id || `promotion-${index + 1}`),
    title: String(item.title || "Promocion especial"),
    description: String(item.description || "Oferta disponible por tiempo limitado."),
    productId: String(item.productId || ""),
    productName: String(item.productName || "Producto destacado"),
    productImage: String(item.productImage || SITE_LOGO),
    priceText: formatPromotionPriceText(String(item.priceText || "")),
    giftText: String(item.giftText || ""),
    conditionText: String(item.conditionText || ""),
    urgencyText: String(item.urgencyText || "No dejes pasar esta oportunidad"),
    endsAt: String(item.endsAt || ""),
    ctaText: String(item.ctaText || "Quiero esta promocion"),
    active: item.active !== false,
  }
}

function formatPromotionPriceText(value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) return ""

  const formatCopAmount = (amount: number) =>
    `$ ${new Intl.NumberFormat("es-CO", {
      maximumFractionDigits: 0,
    }).format(amount)}`

  const parseCurrencyText = (text: string) => {
    const numericCandidate = text
      .trim()
      .replace(/\s/g, "")
      .replace(/\$/g, "")
      .replace(/COP/gi, "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
    const parsedValue = Number(numericCandidate)
    return Number.isFinite(parsedValue) ? parsedValue : null
  }

  const parsedValue = parseCurrencyText(trimmedValue)
  if (parsedValue !== null) return formatCopAmount(parsedValue)

  return trimmedValue.replace(/(?:COP\s*)?\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:,\d+)?/gi, (match) => {
    const parsedMatch = parseCurrencyText(match)
    return parsedMatch === null ? match : formatCopAmount(parsedMatch)
  })
}

function getPromotionTimeLeft(endsAt: string, now: number) {
  if (!endsAt) return null
  const endTime = new Date(endsAt).getTime()
  if (Number.isNaN(endTime)) return null

  const totalSeconds = Math.max(Math.floor((endTime - now) / 1000), 0)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return {
    expired: totalSeconds <= 0,
    days,
    hours,
    minutes,
    seconds,
  }
}

function formatCountdownPart(value: number) {
  return String(value).padStart(2, "0")
}

function getPublicProductStock(data: DocumentData) {
  const variants = Array.isArray(data.variants)
    ? data.variants.filter((variant: DocumentData) => variant?.status !== "inactive")
    : []

  if (variants.length > 0) {
    return variants.reduce(
      (total: number, variant: DocumentData) =>
        total + Math.max(Number(variant?.publicStock ?? variant?.stock ?? 0), 0),
      0
    )
  }

  return Math.max(Number(data.publicStock ?? data.stock ?? data.stockOnHand ?? 0), 0)
}

async function loadPromotionProductStock(items: PublicPromotion[]) {
  const productIds = Array.from(
    new Set(items.map((item) => item.productId).filter((item): item is string => Boolean(item)))
  ).slice(0, 10)

  if (productIds.length === 0) return {}

  const snapshot = await getDocs(
    query(collection(db, "products"), where(documentId(), "in", productIds))
  )

  return snapshot.docs.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.id] = getPublicProductStock(item.data())
    return accumulator
  }, {})
}

function getPromotionCode(index: number) {
  return `PROMO-${String(index + 1).padStart(2, "0")}`
}

function buildPromotionMessage(promotion: PublicPromotion, promotionCode: string) {
  const priceText = formatPromotionPriceText(promotion.priceText)

  return [
    "Hola, quiero informacion sobre esta promocion:",
    "",
    `Codigo: ${promotionCode}`,
    `Promocion: ${promotion.title}`,
    promotion.productName ? `Producto: ${promotion.productName}` : "",
    priceText ? `Precio: ${priceText}` : "",
    promotion.giftText ? `Incluye: ${promotion.giftText}` : "",
    promotion.conditionText ? `Condicion: ${promotion.conditionText}` : "",
    promotion.endsAt ? `Finaliza: ${new Date(promotion.endsAt).toLocaleString("es-CO")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

export default function Promotions() {
  const [promotions, setPromotions] = useState<PublicPromotion[]>([])
  const [productStockById, setProductStockById] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [previewPromotion, setPreviewPromotion] = useState<PublicPromotion | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadPromotions = async () => {
      try {
        const snapshot = await getDoc(doc(db, "siteAssets", "promotions"))
        if (!isMounted) return

        const data = snapshot.data()
        const items = Array.isArray(data?.items)
          ? data.items.map(sanitizePromotion).filter((item) => item.active).slice(0, 6)
          : []

        setPromotions(items)
        setProductStockById(await loadPromotionProductStock(items))
      } catch (error) {
        console.warn("No se pudieron cargar las promociones:", error)
        if (isMounted) {
          setPromotions([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadPromotions()

    return () => {
      isMounted = false
    }
  }, [])

  const visiblePromotions = useMemo(
    () =>
      promotions.filter((item) => {
        if (!item.active) return false
        if (item.productId && productStockById[item.productId] !== undefined && productStockById[item.productId] <= 0) {
          return false
        }
        const timeLeft = getPromotionTimeLeft(item.endsAt, now)
        return !timeLeft?.expired
      }),
    [now, productStockById, promotions]
  )

  if (!loading && visiblePromotions.length === 0) return null

  return (
    <section id="promociones" className="relative z-10 bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[#d4a017]">Promociones</p>
            <h2 className="font-mono text-3xl font-bold tracking-tight text-[#08162f] sm:text-4xl">
              Ofertas activas para tu juego
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-600">
            Combos, regalos y servicios especiales disponibles por tiempo limitado.
          </p>
        </div>

        {loading && visiblePromotions.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Cargando promociones...
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {visiblePromotions.map((promotion, index) => {
              const productUrl = "/tienda-virtual"
              const promotionCode = getPromotionCode(index)
              const priceText = formatPromotionPriceText(promotion.priceText)
              const whatsappMessage = buildPromotionMessage(promotion, promotionCode)
              const timeLeft = getPromotionTimeLeft(promotion.endsAt, now)
              const countdownItems = timeLeft
                ? [
                    ...(timeLeft.days > 0 ? [{ label: "Dias", value: timeLeft.days }] : []),
                    { label: "Horas", value: timeLeft.hours },
                    { label: "Min", value: timeLeft.minutes },
                    { label: "Seg", value: timeLeft.seconds },
                  ]
                : []

              return (
                <article
                  key={promotion.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,#08162f_0%,#0a2472_62%,#0b1d3f_100%)] shadow-[0_20px_55px_rgba(8,22,47,0.16)]"
                >
                  <div className="grid md:grid-cols-[0.82fr_1.18fr]">
                    <div className="relative bg-white p-4">
                      <button
                        type="button"
                        className="relative block h-64 w-full cursor-zoom-in rounded-2xl bg-white md:h-full md:min-h-[310px]"
                        onClick={() => setPreviewPromotion(promotion)}
                        aria-label={`Ampliar ${promotion.title}`}
                      >
                        <Image
                          src={promotion.productImage || SITE_LOGO}
                          alt={promotion.title || promotion.productName || "Promocion"}
                          fill
                          className="object-contain p-2"
                          unoptimized={(promotion.productImage || SITE_LOGO).startsWith("data:")}
                        />
                        <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-[#d4a017] px-2.5 py-1 text-[11px] font-bold text-[#08162f] shadow-sm">
                          <Sparkles className="h-3.5 w-3.5" />
                          {promotionCode}
                        </div>
                      </button>
                      {timeLeft ? (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-[#08162f] p-2.5 text-white shadow-lg md:absolute md:bottom-4 md:left-4 md:right-4 md:z-10 md:mt-0 md:bg-[#08162f]/92 md:backdrop-blur-md">
                          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4a017]">
                            <Clock3 className="h-3.5 w-3.5" />
                            Termina en
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {countdownItems.slice(-3).map((item) => (
                              <div key={item.label} className="rounded-xl bg-white/12 px-2 py-1.5 text-center">
                                <p className="font-mono text-lg font-bold leading-none">
                                  {formatCountdownPart(item.value)}
                                </p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/55">
                                  {item.label}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col justify-between p-5 text-white">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                          {promotionCode}
                        </p>
                        <h3 className="mt-2 font-mono text-xl font-bold leading-tight sm:text-2xl">{promotion.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-white/72">{promotion.description}</p>
                        <div className="mt-3 rounded-2xl border border-[#d4a017]/35 bg-[#d4a017]/12 px-3.5 py-3">
                          <p className="text-sm font-bold text-[#f4d169]">
                            {promotion.urgencyText || "No dejes pasar esta oportunidad"}
                          </p>
                          {timeLeft ? (
                            <p className="mt-1 text-xs text-white/60">
                              Esta promocion esta activa por tiempo limitado.
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-3 grid gap-2">
                          {priceText ? (
                            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/8 p-3">
                              <Tag className="mt-0.5 h-4 w-4 text-[#d4a017]" />
                              <div>
                                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Oferta</p>
                                <p className="text-sm font-semibold">{priceText}</p>
                              </div>
                            </div>
                          ) : null}
                          {promotion.giftText ? (
                            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/8 p-3">
                              <Gift className="mt-0.5 h-4 w-4 text-[#d4a017]" />
                              <div>
                                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Incluye</p>
                                <p className="text-sm font-semibold">{promotion.giftText}</p>
                              </div>
                            </div>
                          ) : null}
                          {promotion.conditionText ? (
                            <p className="text-xs leading-5 text-white/55">{promotion.conditionText}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <a
                          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4a017] px-4 py-2.5 text-sm font-bold text-[#08162f] transition-colors hover:bg-[#d4a017]/90"
                        >
                          <MessageCircle className="h-4 w-4" />
                          {promotion.ctaText || "Quiero esta promocion"}
                        </a>
                        <a
                          href={productUrl}
                          className="inline-flex items-center justify-center rounded-xl border border-white/16 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                        >
                          Ver productos
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
      <Dialog open={Boolean(previewPromotion)} onOpenChange={(open) => !open && setPreviewPromotion(null)}>
        {previewPromotion ? (
          <DialogContent className="max-w-5xl bg-white p-0 sm:rounded-[28px]" showCloseButton>
            <DialogHeader className="border-b border-slate-200 px-4 py-4 sm:px-6">
              <DialogTitle className="text-left text-xl text-slate-950">{previewPromotion.title}</DialogTitle>
              <DialogDescription className="text-left">
                Imagen ampliada de la promocion.
              </DialogDescription>
            </DialogHeader>
            <div className="relative min-h-[70dvh] bg-white">
              <Image
                src={previewPromotion.productImage || SITE_LOGO}
                alt={previewPromotion.title || "Promocion ampliada"}
                fill
                className="object-contain p-3 sm:p-6"
                unoptimized={(previewPromotion.productImage || SITE_LOGO).startsWith("data:")}
              />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  )
}
