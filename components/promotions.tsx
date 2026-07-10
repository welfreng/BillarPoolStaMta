"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { doc, getDoc } from "firebase/firestore"
import { Gift, MessageCircle, Sparkles, Tag } from "lucide-react"
import { db } from "@/lib/firebase"
import { SITE_LOGO } from "@/lib/branding"

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
  ctaText: string
  active: boolean
}

const whatsappNumber = "573006775284"
const promotionsCacheKey = "bp-public-promotions-cache-v1"
const promotionsCacheTtlMs = 30 * 60 * 1000

interface PromotionsCache {
  storedAt: number
  items: PublicPromotion[]
}

function sanitizePromotion(item: Partial<PublicPromotion>, index: number): PublicPromotion {
  return {
    id: String(item.id || `promotion-${index + 1}`),
    title: String(item.title || "Promocion especial"),
    description: String(item.description || "Oferta disponible por tiempo limitado."),
    productId: String(item.productId || ""),
    productName: String(item.productName || "Producto destacado"),
    productImage: String(item.productImage || SITE_LOGO),
    priceText: String(item.priceText || ""),
    giftText: String(item.giftText || ""),
    conditionText: String(item.conditionText || ""),
    ctaText: String(item.ctaText || "Quiero esta promocion"),
    active: item.active !== false,
  }
}

function readPromotionsCache(allowExpired = false): PromotionsCache | null {
  if (typeof window === "undefined") return null

  try {
    const rawCache = window.localStorage.getItem(promotionsCacheKey)
    if (!rawCache) return null

    const parsedCache = JSON.parse(rawCache) as Partial<PromotionsCache>
    if (typeof parsedCache.storedAt !== "number" || !Array.isArray(parsedCache.items)) return null

    const isFresh = Date.now() - parsedCache.storedAt < promotionsCacheTtlMs
    if (!allowExpired && !isFresh) return null

    return {
      storedAt: parsedCache.storedAt,
      items: parsedCache.items.map(sanitizePromotion).filter((item) => item.active),
    }
  } catch {
    return null
  }
}

function writePromotionsCache(items: PublicPromotion[]) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      promotionsCacheKey,
      JSON.stringify({
        storedAt: Date.now(),
        items,
      })
    )
  } catch {
    // Cache only reduces Firestore reads; the section works without it.
  }
}

function buildPromotionMessage(promotion: PublicPromotion) {
  return [
    "Hola, quiero informacion sobre esta promocion:",
    "",
    `Promocion: ${promotion.title}`,
    promotion.productName ? `Producto: ${promotion.productName}` : "",
    promotion.priceText ? `Precio: ${promotion.priceText}` : "",
    promotion.giftText ? `Incluye: ${promotion.giftText}` : "",
    promotion.conditionText ? `Condicion: ${promotion.conditionText}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

export default function Promotions() {
  const [promotions, setPromotions] = useState<PublicPromotion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadPromotions = async () => {
      const freshCache = readPromotionsCache()
      if (freshCache) {
        setPromotions(freshCache.items)
        setLoading(false)
        return
      }

      const expiredCache = readPromotionsCache(true)
      if (expiredCache) {
        setPromotions(expiredCache.items)
        setLoading(false)
      }

      try {
        const snapshot = await getDoc(doc(db, "siteAssets", "promotions"))
        if (!isMounted) return

        const data = snapshot.data()
        const items = Array.isArray(data?.items)
          ? data.items.map(sanitizePromotion).filter((item) => item.active).slice(0, 6)
          : []

        setPromotions(items)
        writePromotionsCache(items)
      } catch (error) {
        console.warn("No se pudieron cargar las promociones:", error)
        if (isMounted) {
          setPromotions(expiredCache?.items ?? [])
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

  const visiblePromotions = useMemo(() => promotions.filter((item) => item.active), [promotions])

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
            {visiblePromotions.map((promotion) => {
              const productUrl = promotion.productId ? `/tienda-virtual?producto=${promotion.productId}` : "/tienda-virtual"
              const whatsappMessage = buildPromotionMessage(promotion)

              return (
                <article
                  key={promotion.id}
                  className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#08162f_0%,#0a2472_58%,#0b1d3f_100%)] shadow-[0_24px_70px_rgba(8,22,47,0.18)]"
                >
                  <div className="grid min-h-[320px] md:grid-cols-[0.95fr_1.05fr]">
                    <div className="relative min-h-[240px] bg-white">
                      <Image
                        src={promotion.productImage || SITE_LOGO}
                        alt={promotion.productName}
                        fill
                        className="object-contain p-5"
                        unoptimized={(promotion.productImage || SITE_LOGO).startsWith("data:")}
                      />
                      <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-[#d4a017] px-3 py-1.5 text-xs font-bold text-[#08162f]">
                        <Sparkles className="h-3.5 w-3.5" />
                        Promo
                      </div>
                    </div>

                    <div className="flex flex-col justify-between p-5 text-white sm:p-6">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                          {promotion.productName}
                        </p>
                        <h3 className="mt-3 font-mono text-2xl font-bold leading-tight">{promotion.title}</h3>
                        <p className="mt-3 text-sm leading-6 text-white/72">{promotion.description}</p>

                        <div className="mt-5 grid gap-3">
                          {promotion.priceText ? (
                            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/8 p-3">
                              <Tag className="mt-0.5 h-4 w-4 text-[#d4a017]" />
                              <div>
                                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Oferta</p>
                                <p className="text-sm font-semibold">{promotion.priceText}</p>
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

                      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <a
                          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4a017] px-5 py-3 text-sm font-bold text-[#08162f] transition-colors hover:bg-[#d4a017]/90"
                        >
                          <MessageCircle className="h-4 w-4" />
                          {promotion.ctaText || "Quiero esta promocion"}
                        </a>
                        <a
                          href={productUrl}
                          className="inline-flex items-center justify-center rounded-xl border border-white/16 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                        >
                          Ver producto
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
    </section>
  )
}
