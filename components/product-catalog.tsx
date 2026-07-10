"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { collection, getDocs, query as firestoreQuery, type DocumentData, where } from "firebase/firestore"
import { MessageCircle, Search, ShoppingBag, Tag } from "lucide-react"
import {
  extractCatalogImageOverrides,
  resolveCatalogImageOverride,
  resolveCatalogVariantImageOverride,
  type CatalogImageOverrideMaps,
} from "@/lib/catalog-image-overrides"
import { db } from "@/lib/firebase"
import { publicCatalogCategories, publicCatalogProducts } from "@/lib/public-catalog"
import { formatCurrency } from "@/lib/admin/calculations"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SITE_LOGO } from "@/lib/branding"
import { Skeleton } from "@/components/ui/skeleton"

interface CatalogProduct {
  id: string
  name: string
  description: string
  image: string
  category: string
  subcategory: string
  brand: string
  salePrice: number
  featured: boolean
  publicStock: number
  status: "active" | "draft" | "archived"
  tag: string
  details: string[]
  variantLabel?: string
  variants: Array<{
    id: string
    name: string
    salePrice: number
    stock: number
    status: "active" | "inactive"
    colorHex?: string
    image?: string
  }>
}

const defaultImage = SITE_LOGO
const whatsappNumber = "573006775284"
const categoryLabels = new Map(publicCatalogCategories.map((category) => [category.id, category.label]))
const categoryOrder = new Map(publicCatalogCategories.map((category, index) => [category.id, index]))
const productQueryParam = "producto"
const variantQueryParam = "variante"
const catalogCacheKey = "bp-public-catalog-cache-v1"
const catalogCacheTtlMs = 30 * 60 * 1000

interface PublicCatalogCache {
  storedAt: number
  products: CatalogProduct[]
  imageOverrides: CatalogImageOverrideMaps
}

function getEmptyImageOverrides(): CatalogImageOverrideMaps {
  return {
    byProductId: {},
    byProductName: {},
    byVariantKey: {},
  }
}

function sortCatalogProducts(items: CatalogProduct[]) {
  return [...items].sort((left, right) => {
    const leftAvailability = left.publicStock > 0 ? 0 : 1
    const rightAvailability = right.publicStock > 0 ? 0 : 1
    if (leftAvailability !== rightAvailability) return leftAvailability - rightAvailability
    return left.name.localeCompare(right.name)
  })
}

function readCatalogCache(allowExpired = false): PublicCatalogCache | null {
  if (typeof window === "undefined") return null

  try {
    const rawCache = window.localStorage.getItem(catalogCacheKey)
    if (!rawCache) return null

    const parsedCache = JSON.parse(rawCache) as Partial<PublicCatalogCache>
    if (
      typeof parsedCache.storedAt !== "number" ||
      !Array.isArray(parsedCache.products) ||
      !parsedCache.imageOverrides
    ) {
      return null
    }

    const isFresh = Date.now() - parsedCache.storedAt < catalogCacheTtlMs
    if (!allowExpired && !isFresh) return null

    return {
      storedAt: parsedCache.storedAt,
      products: sortCatalogProducts(parsedCache.products),
      imageOverrides: parsedCache.imageOverrides,
    }
  } catch {
    return null
  }
}

function writeCatalogCache(products: CatalogProduct[], imageOverrides: CatalogImageOverrideMaps) {
  if (typeof window === "undefined") return

  try {
    const nextCache: PublicCatalogCache = {
      storedAt: Date.now(),
      products,
      imageOverrides,
    }

    window.localStorage.setItem(catalogCacheKey, JSON.stringify(nextCache))
  } catch {
    // The catalog still works without local cache; this only protects Firestore reads.
  }
}

function mapCatalogProduct(documentId: string, data: DocumentData): CatalogProduct {
  const fallbackProduct = publicCatalogProducts.find((product) => product.id === documentId)
  const variants = Array.isArray(data.variants)
    ? data.variants
        .map((variant: DocumentData, index: number) => ({
          id: String(variant?.id ?? `variant-${index + 1}`),
          name: String(variant?.displayName ?? variant?.name ?? ""),
          salePrice: Number(variant?.salePrice ?? data.salePrice ?? 0),
          stock: Number(variant?.publicStock ?? variant?.stock ?? 0),
          status: (variant?.status === "inactive" ? "inactive" : "active") as "active" | "inactive",
          colorHex: typeof variant?.colorHex === "string" ? String(variant.colorHex) : undefined,
        }))
        .filter((variant) => Boolean(variant.name.trim()) && variant.status !== "inactive")
    : []
  const variantPrices = variants
    .map((variant) => variant.salePrice)
    .filter((price) => price > 0)
    .sort((left, right) => left - right)
  const totalVariantStock = variants.reduce((total, variant) => total + Math.max(variant.stock, 0), 0)
  const storedPublicStock = Math.max(Number(data.publicStock ?? data.stock ?? data.stockOnHand ?? 0), 0)
  // When a product has variants, the public catalog should trust the summed variant stock.
  // This avoids stale product-level publicStock values from keeping exhausted items as "available".
  const resolvedPublicStock = variants.length > 0 ? totalVariantStock : storedPublicStock

  return {
    id: documentId,
    name: String(data.name ?? fallbackProduct?.name ?? "Producto"),
    description: String(data.description ?? fallbackProduct?.description ?? "Producto disponible para consulta."),
    image: String(data.image ?? fallbackProduct?.image ?? defaultImage),
    category: String(data.category ?? fallbackProduct?.category ?? "accesorios"),
    subcategory: String(data.subcategory ?? ""),
    brand: String(data.brand ?? ""),
    salePrice: variantPrices[0] ?? Number(data.salePrice ?? 0),
    featured: Boolean(data.featured ?? false),
    publicStock: resolvedPublicStock,
    status:
      data.status === "draft" || data.status === "archived" || data.status === "active"
        ? data.status
        : "active",
    tag: String(data.brand ?? fallbackProduct?.tag ?? "Disponible"),
    details: [
      data.brand ? `Marca: ${String(data.brand)}` : "",
      data.category ? `Categoria: ${categoryLabels.get(String(data.category)) ?? String(data.category)}` : "",
      data.subcategory ? `Subcategoria: ${String(data.subcategory)}` : "",
    ].filter(Boolean),
    variantLabel: typeof data.variantLabel === "string" ? String(data.variantLabel) : undefined,
    variants,
  }
}

function hasVariantPricingRange(product: CatalogProduct) {
  const prices = product.variants
    .map((variant) => Number(variant.salePrice ?? 0))
    .filter((price) => price > 0)

  if (prices.length <= 1) return false
  return Math.min(...prices) !== Math.max(...prices)
}

function getDefaultSelectedVariant(product: CatalogProduct | null) {
  if (!product || product.variants.length === 0) return null
  return product.variants.find((variant) => variant.stock > 0) ?? product.variants[0] ?? null
}

function buildProductPath(productId: string, variantId = "") {
  const params = new URLSearchParams({ [productQueryParam]: productId })

  if (variantId) {
    params.set(variantQueryParam, variantId)
  }

  return `/tienda-virtual?${params.toString()}`
}

export default function ProductCatalog({
  featuredOnly = false,
  sectionId = "productos",
  includeOutOfStock = false,
}: {
  featuredOnly?: boolean
  sectionId?: string
  includeOutOfStock?: boolean
}) {
  const [activeCategory, setActiveCategory] = useState("todos")
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string>("")
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [imageOverrides, setImageOverrides] = useState<CatalogImageOverrideMaps>(getEmptyImageOverrides())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [previewSides, setPreviewSides] = useState<Record<string, "left" | "right">>({})
  const [cardPreviewVariantByProduct, setCardPreviewVariantByProduct] = useState<Record<string, string>>({})
  const productCardRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    let isMounted = true

    const loadCatalog = async () => {
      const freshCache = readCatalogCache()
      if (freshCache) {
        setProducts(freshCache.products)
        setImageOverrides(freshCache.imageOverrides)
        setLoading(false)
        return
      }

      const expiredCache = readCatalogCache(true)
      if (expiredCache && isMounted) {
        setProducts(expiredCache.products)
        setImageOverrides(expiredCache.imageOverrides)
        setLoading(false)
      }

      try {
        const [productsSnapshot, imagesSnapshot] = await Promise.all([
          getDocs(
            firestoreQuery(
              collection(db, "products"),
              where("status", "==", "active")
            )
          ),
          getDocs(collection(db, "siteAssets")),
        ])

        if (!isMounted) return

        const nextProducts = sortCatalogProducts(
          productsSnapshot.docs
            .map((snapshotItem) => mapCatalogProduct(snapshotItem.id, snapshotItem.data()))
        )
        const nextImageOverrides = extractCatalogImageOverrides(imagesSnapshot)

        setProducts(nextProducts)
        setImageOverrides(nextImageOverrides)
        writeCatalogCache(nextProducts, nextImageOverrides)
      } catch (error) {
        console.warn("No se pudo actualizar el catalogo publico desde Firestore:", error)
        if (isMounted) {
          const fallbackCache = readCatalogCache(true)
          setProducts(fallbackCache?.products ?? [])
          setImageOverrides(fallbackCache?.imageOverrides ?? getEmptyImageOverrides())
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadCatalog()

    return () => {
      isMounted = false
    }
  }, [])

  const catalogProducts = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        image: resolveCatalogImageOverride(product.id, product.name, product.image || defaultImage, imageOverrides),
        variants: product.variants.map((variant) => ({
          ...variant,
          image: resolveCatalogVariantImageOverride(
            product.id,
            variant.id,
            resolveCatalogImageOverride(product.id, product.name, product.image || defaultImage, imageOverrides),
            imageOverrides
          ),
        })),
      })),
    [imageOverrides, products]
  )
  const visibleCatalogProducts = useMemo(
    () => (includeOutOfStock ? catalogProducts : catalogProducts.filter((product) => product.publicStock > 0)),
    [catalogProducts, includeOutOfStock]
  )

  const dynamicCategories = useMemo(() => {
    const categories = Array.from(new Set(visibleCatalogProducts.map((product) => product.category).filter(Boolean)))

    return [
      { id: "todos", label: "Todos" },
      ...categories
        .sort((left, right) => {
          const leftOrder = categoryOrder.get(left) ?? Number.MAX_SAFE_INTEGER
          const rightOrder = categoryOrder.get(right) ?? Number.MAX_SAFE_INTEGER
          if (leftOrder !== rightOrder) return leftOrder - rightOrder
          return (categoryLabels.get(left) ?? left).localeCompare(categoryLabels.get(right) ?? right)
        })
        .map((category) => ({
          id: category,
          label: categoryLabels.get(category) ?? category,
        })),
    ]
  }, [visibleCatalogProducts])

  const filteredProducts = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase()

      return visibleCatalogProducts.filter((product) => {
        const matchesCategory = activeCategory === "todos" || product.category === activeCategory
        const matchesQuery =
          normalizedQuery.length === 0 ||
          `${product.name} ${product.brand} ${product.category} ${product.subcategory} ${product.description}`
            .toLowerCase()
            .includes(normalizedQuery)

        return matchesCategory && matchesQuery
      })
    },
    [activeCategory, query, visibleCatalogProducts]
  )

  const visibleProducts = useMemo(() => {
    if (!featuredOnly) return filteredProducts

    const featuredProducts = visibleCatalogProducts.filter((product) => product.featured && product.publicStock > 0)
    const fallbackProducts = visibleCatalogProducts.filter((product) => product.publicStock > 0)
    return (featuredProducts.length > 0 ? featuredProducts : fallbackProducts).slice(0, 5)
  }, [featuredOnly, filteredProducts, visibleCatalogProducts])
  const groupedProducts = useMemo(() => {
    const grouped = new Map<string, CatalogProduct[]>()

    filteredProducts.forEach((product) => {
      const categoryKey = product.category || "otros"
      const currentItems = grouped.get(categoryKey) ?? []
      currentItems.push(product)
      grouped.set(categoryKey, currentItems)
    })

    return Array.from(grouped.entries())
      .sort(([left], [right]) => {
        const leftOrder = categoryOrder.get(left) ?? Number.MAX_SAFE_INTEGER
        const rightOrder = categoryOrder.get(right) ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return (categoryLabels.get(left) ?? left).localeCompare(categoryLabels.get(right) ?? right)
      })
      .map(([category, items]) => ({
        category,
        label: categoryLabels.get(category) ?? category,
        items,
      }))
  }, [filteredProducts])

  const selectedProduct = visibleCatalogProducts.find((product) => product.id === selectedProductId) ?? null
  const selectedVariant =
    selectedProduct?.variants.find((variant) => variant.id === selectedVariantId) ??
    getDefaultSelectedVariant(selectedProduct) ??
    null
  const selectedProductImage = selectedVariant?.image || selectedProduct?.image || defaultImage
  const selectedVariantIsAvailable = selectedVariant ? selectedVariant.stock > 0 : (selectedProduct?.publicStock ?? 0) > 0
  const isStorePage = () =>
    typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/tienda-virtual"

  const getAbsoluteProductUrl = (productId: string, variantId = "") => {
    const productPath = buildProductPath(productId, variantId)

    if (typeof window === "undefined") return productPath
    return new URL(productPath, window.location.origin).toString()
  }

  const updateProductUrl = (productId: string, variantId = "", mode: "push" | "replace" = "push") => {
    if (!isStorePage()) return

    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set(productQueryParam, productId)
    if (variantId) {
      nextUrl.searchParams.set(variantQueryParam, variantId)
    } else {
      nextUrl.searchParams.delete(variantQueryParam)
    }

    window.history[mode === "push" ? "pushState" : "replaceState"](
      null,
      "",
      `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
    )
  }

  const clearProductUrl = () => {
    if (!isStorePage()) return

    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete(productQueryParam)
    nextUrl.searchParams.delete(variantQueryParam)
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
  }

  const openProductDetail = (product: CatalogProduct) => {
    const defaultVariant = getDefaultSelectedVariant(product)

    setSelectedProductId(product.id)
    setSelectedVariantId(defaultVariant?.id ?? "")
    updateProductUrl(product.id, defaultVariant?.id ?? "")
  }

  useEffect(() => {
    if (!selectedProduct) {
      setSelectedVariantId("")
      return
    }
    if (selectedProduct.variants.length === 0) {
      setSelectedVariantId("")
      return
    }
    setSelectedVariantId((current) =>
      selectedProduct.variants.some((variant) => variant.id === current)
        ? current
        : getDefaultSelectedVariant(selectedProduct)?.id ?? ""
    )
  }, [selectedProduct])

  useEffect(() => {
    if (loading || visibleCatalogProducts.length === 0 || typeof window === "undefined") return

    const syncProductFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const productId = params.get(productQueryParam)
      if (!productId) {
        setSelectedProductId(null)
        setSelectedVariantId("")
        return
      }

      const product = visibleCatalogProducts.find((item) => item.id === productId)
      if (!product) return

      const variantId = params.get(variantQueryParam) ?? ""
      const variant = product.variants.find((item) => item.id === variantId) ?? getDefaultSelectedVariant(product)

      setSelectedProductId(product.id)
      setSelectedVariantId(variant?.id ?? "")
    }

    syncProductFromUrl()
    window.addEventListener("popstate", syncProductFromUrl)

    return () => {
      window.removeEventListener("popstate", syncProductFromUrl)
    }
  }, [loading, visibleCatalogProducts])

  const selectedCategoryLabel =
    selectedProduct ? categoryLabels.get(selectedProduct.category) ?? selectedProduct.category : ""
  const selectedProductUrl = selectedProduct
    ? getAbsoluteProductUrl(selectedProduct.id, selectedVariant?.id ?? "")
    : ""
  const whatsappMessage = selectedProduct
    ? [
        "Hola, me interesa este producto:",
        "",
        `Producto: ${selectedProduct.name}`,
        selectedVariant ? `Variante: ${selectedVariant.name}` : "",
        `Precio: ${formatCurrency(selectedVariant?.salePrice ?? selectedProduct.salePrice)}`,
        selectedProductUrl ? `Link: ${selectedProductUrl}` : "",
        "",
        "Quiero mas informacion.",
      ]
        .filter(Boolean)
        .join("\n")
    : "Hola, quiero informacion sobre sus productos."

  const setPreviewSideFromViewport = (productId: string) => {
    const card = productCardRefs.current[productId]
    if (!card || typeof window === "undefined") return

    const previewWidth = 280
    const previewGap = 16
    const rect = card.getBoundingClientRect()
    const roomOnRight = window.innerWidth - rect.right
    const roomOnLeft = rect.left

    const nextSide: "left" | "right" =
      roomOnRight >= previewWidth + previewGap || roomOnRight >= roomOnLeft ? "right" : "left"

    setPreviewSides((current) =>
      current[productId] === nextSide ? current : { ...current, [productId]: nextSide }
    )
  }

  const getCardPreviewImage = (product: CatalogProduct) => {
    const previewVariantId = cardPreviewVariantByProduct[product.id]
    const previewVariant = product.variants.find((variant) => variant.id === previewVariantId)
    return previewVariant?.image || product.image || defaultImage
  }

  return (
    <section
      id={sectionId}
      className={`relative z-10 bg-[linear-gradient(180deg,#f8fbff_0%,#eef5ff_48%,#f8fafc_100%)] ${
        featuredOnly
          ? "-mt-10 rounded-t-[40px] border-t border-white/80 pb-28 pt-20 shadow-[0_-24px_70px_rgba(8,22,47,0.18)]"
          : "py-24"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-16 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[#d4a017]">
            {featuredOnly ? "Productos destacados" : "Catalogo de productos"}
          </p>
          <h2 className="font-mono text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl lg:text-5xl">
            {featuredOnly ? "Conoce algunos productos destacados" : "Escoge el producto y consultalo por WhatsApp"}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground text-pretty">
            {featuredOnly
              ? "Mira una seleccion de referencias destacadas y entra a la tienda virtual para ver el catalogo completo."
              : includeOutOfStock
                ? "Mira todo el catalogo de referencias, incluyendo productos agotados, y contacta al negocio para confirmar disponibilidad."
                : "Mira precios, abre el detalle de cada referencia y contacta al negocio directamente para confirmar disponibilidad."}
          </p>
        </div>

        {!featuredOnly ? (
          <div className="mb-12 space-y-5">
            <div className="mx-auto max-w-2xl">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre, marca o categoria"
                  className="h-12 rounded-2xl border-slate-200 bg-white pl-10"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {dynamicCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                    activeCategory === category.id
                      ? "bg-[linear-gradient(135deg,#0a2472_0%,#12389b_100%)] text-white shadow-lg shadow-[#0a2472]/25"
                      : "border border-[#c8d3e6] bg-white text-foreground shadow-sm hover:border-[#0a2472]/35 hover:bg-[#eef5ff]"
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>

          </div>
        ) : null}

        {loading ? (
          <div className="space-y-10">
            {Array.from({ length: featuredOnly ? 1 : 2 }).map((_, groupIndex) => (
              <div key={`catalog-skeleton-${groupIndex}`} className="space-y-4">
                {!featuredOnly ? (
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-24 rounded-full" />
                      <Skeleton className="h-7 w-40 rounded-xl" />
                    </div>
                    <Skeleton className="h-7 w-24 rounded-full" />
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {Array.from({ length: featuredOnly ? 5 : 10 }).map((_, cardIndex) => (
                    <div
                      key={`catalog-card-skeleton-${groupIndex}-${cardIndex}`}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      <Skeleton className="h-32 w-full" />
                      <div className="space-y-3 p-3">
                        <Skeleton className="h-4 w-3/4 rounded-lg" />
                        <Skeleton className="h-3 w-full rounded-lg" />
                        <Skeleton className="h-10 w-full rounded-2xl" />
                        <Skeleton className="h-8 w-full rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (featuredOnly ? visibleProducts.length > 0 : groupedProducts.length > 0) ? (
          featuredOnly ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleProducts.map((product) => {
                const previewSide = previewSides[product.id] ?? "right"
                const currentCardImage = getCardPreviewImage(product)

                return (
                  <article
                    key={product.id}
                    ref={(element) => {
                      productCardRefs.current[product.id] = element
                    }}
                    onMouseEnter={() => setPreviewSideFromViewport(product.id)}
                    className={`group relative overflow-visible rounded-2xl border border-[#c8d3e6] bg-white shadow-sm transition-all duration-300 hover:z-20 hover:-translate-y-1 hover:border-[#0a2472]/35 hover:shadow-[0_20px_45px_rgba(10,36,114,0.16)] ${
                      product.publicStock <= 0 ? "border-slate-200 bg-slate-50/80 opacity-80" : ""
                    }`}
                  >
                    <div className="relative h-28 overflow-hidden bg-gradient-to-br from-white via-slate-50 to-slate-100 sm:h-32">
                      <Image
                        src={currentCardImage}
                        alt={product.name}
                        fill
                        className={`object-cover transition-transform duration-500 group-hover:scale-110 ${
                          product.publicStock <= 0 ? "grayscale-[0.45] saturate-50" : ""
                        }`}
                        unoptimized={currentCardImage.startsWith("data:")}
                      />
                      {product.publicStock <= 0 ? (
                        <div className="absolute inset-0 bg-white/35" />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/70 via-transparent to-transparent" />
                      <div className="absolute left-2.5 top-2.5 z-10 inline-flex items-center rounded-full bg-[#0a2472] px-2 py-1 text-[10px] font-semibold text-white">
                        {product.publicStock > 0 ? product.tag : "Agotado"}
                      </div>
                    </div>

                    <div
                      className={`pointer-events-none absolute top-1/2 z-30 hidden w-[280px] -translate-y-1/2 rounded-[28px] border border-slate-200 bg-white/98 p-3 opacity-0 shadow-2xl shadow-slate-900/20 transition-all delay-0 duration-300 group-hover:opacity-100 group-hover:delay-300 lg:block ${
                        previewSide === "left"
                          ? "left-auto right-full mr-4 ml-0 group-hover:-translate-x-2"
                          : "left-full right-auto ml-4 mr-0 group-hover:translate-x-2"
                      }`}
                    >
                      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100">
                        <Image
                          src={currentCardImage}
                          alt={`${product.name} vista ampliada`}
                          fill
                          className={`object-contain p-3 ${product.publicStock <= 0 ? "grayscale-[0.45] saturate-50" : ""}`}
                          unoptimized={currentCardImage.startsWith("data:")}
                        />
                        {product.publicStock <= 0 ? (
                          <div className="absolute inset-0 bg-white/30" />
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.brand || "Sin marca"}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white">
                          Vista completa
                        </span>
                      </div>
                    </div>

                      <div className="space-y-2.5 p-3">
                        <div className="space-y-1">
                          <h3 className="line-clamp-2 font-mono text-sm font-bold leading-snug text-foreground sm:text-base">
                            {product.name}
                          </h3>
                          {product.publicStock <= 0 ? (
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600">
                              Agotado
                            </p>
                          ) : null}
                          <p className="hidden line-clamp-2 text-xs leading-5 text-muted-foreground sm:block">
                            {product.description}
                          </p>
                          {product.variants.length > 1 ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {product.variants.slice(0, 6).map((variant) => (
                                <button
                                  key={variant.id}
                                  type="button"
                                  aria-label={`${product.name} ${variant.name}`}
                                  className={`h-4 w-4 rounded-full border ${
                                    cardPreviewVariantByProduct[product.id] === variant.id
                                      ? "border-[#0a2472] ring-2 ring-[#0a2472]/20"
                                      : "border-slate-300"
                                  }`}
                                  style={{ backgroundColor: variant.colorHex || "#cbd5e1" }}
                                  onMouseEnter={() =>
                                    setCardPreviewVariantByProduct((current) => ({
                                      ...current,
                                      [product.id]: variant.id,
                                    }))
                                  }
                                  onFocus={() =>
                                    setCardPreviewVariantByProduct((current) => ({
                                      ...current,
                                      [product.id]: variant.id,
                                    }))
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setCardPreviewVariantByProduct((current) => ({
                                      ...current,
                                      [product.id]: current[product.id] === variant.id ? "" : variant.id,
                                    }))
                                  }}
                                />
                              ))}
                            </div>
                          ) : null}
                      </div>

                      <div className="flex items-center justify-between rounded-2xl bg-[#0a2472]/5 px-2.5 py-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">Precio</p>
                          {product.variants.length > 0 ? (
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              {hasVariantPricingRange(product) ? "Desde" : "Variante"}
                            </p>
                          ) : null}
                          <p className="text-sm font-bold text-[#0a2472] sm:text-base">
                            {product.salePrice > 0 ? formatCurrency(product.salePrice) : "Consultar"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-[#d4a017]/15 p-1.5 text-[#a17708]">
                          <Tag className="h-3.5 w-3.5" />
                        </div>
                      </div>

                      <button
                        onClick={() => openProductDetail(product)}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,#0a2472_0%,#12389b_100%)] px-2.5 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#d4a017] hover:text-[#08162f] sm:text-xs"
                      >
                        Ver producto
                        <ShoppingBag className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="space-y-10">
              {groupedProducts.map((group) => (
                <div key={group.category} className="space-y-4">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4a017]">Categoria</p>
                      <h3 className="font-mono text-xl font-bold text-foreground">{group.label}</h3>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {group.items.length} productos
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {group.items.map((product) => {
                      const previewSide = previewSides[product.id] ?? "right"
                      const currentCardImage = getCardPreviewImage(product)

                      return (
                        <article
                          key={product.id}
                          ref={(element) => {
                            productCardRefs.current[product.id] = element
                          }}
                          onMouseEnter={() => setPreviewSideFromViewport(product.id)}
                          className={`group relative overflow-visible rounded-2xl border border-[#c8d3e6] bg-white shadow-sm transition-all duration-300 hover:z-20 hover:-translate-y-1 hover:border-[#0a2472]/35 hover:shadow-[0_20px_45px_rgba(10,36,114,0.16)] ${
                            product.publicStock <= 0 ? "border-slate-200 bg-slate-50/80 opacity-80" : ""
                          }`}
                        >
                          <div className="relative h-28 overflow-hidden bg-gradient-to-br from-white via-slate-50 to-slate-100 sm:h-32">
                            <Image
                              src={currentCardImage}
                              alt={product.name}
                              fill
                              className={`object-cover transition-transform duration-500 group-hover:scale-110 ${
                                product.publicStock <= 0 ? "grayscale-[0.45] saturate-50" : ""
                              }`}
                              unoptimized={currentCardImage.startsWith("data:")}
                            />
                            {product.publicStock <= 0 ? (
                              <div className="absolute inset-0 bg-white/35" />
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/70 via-transparent to-transparent" />
                            <div className="absolute left-2.5 top-2.5 z-10 inline-flex items-center rounded-full bg-[#0a2472] px-2 py-1 text-[10px] font-semibold text-white">
                              {product.publicStock > 0 ? product.tag : "Agotado"}
                            </div>
                          </div>

                          <div
                            className={`pointer-events-none absolute top-1/2 z-30 hidden w-[280px] -translate-y-1/2 rounded-[28px] border border-slate-200 bg-white/98 p-3 opacity-0 shadow-2xl shadow-slate-900/20 transition-all delay-0 duration-300 group-hover:opacity-100 group-hover:delay-300 lg:block ${
                              previewSide === "left"
                                ? "left-auto right-full mr-4 ml-0 group-hover:-translate-x-2"
                                : "left-full right-auto ml-4 mr-0 group-hover:translate-x-2"
                            }`}
                          >
                            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100">
                              <Image
                                src={currentCardImage}
                                alt={`${product.name} vista ampliada`}
                                fill
                                className={`object-contain p-3 ${product.publicStock <= 0 ? "grayscale-[0.45] saturate-50" : ""}`}
                                unoptimized={currentCardImage.startsWith("data:")}
                              />
                              {product.publicStock <= 0 ? (
                                <div className="absolute inset-0 bg-white/30" />
                              ) : null}
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-950">{product.name}</p>
                                <p className="text-xs text-slate-500">{product.brand || "Sin marca"}</p>
                              </div>
                              <span className="shrink-0 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white">
                                Vista completa
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2.5 p-3">
                          <div className="space-y-1">
                            <h3 className="line-clamp-2 font-mono text-sm font-bold leading-snug text-foreground sm:text-base">
                              {product.name}
                            </h3>
                            {product.publicStock <= 0 ? (
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600">
                                Agotado
                              </p>
                            ) : null}
                            <p className="hidden line-clamp-2 text-xs leading-5 text-muted-foreground sm:block">
                              {product.description}
                            </p>
                            {product.variants.length > 1 ? (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {product.variants.slice(0, 6).map((variant) => (
                                  <button
                                    key={variant.id}
                                    type="button"
                                    aria-label={`${product.name} ${variant.name}`}
                                    className={`h-4 w-4 rounded-full border ${
                                      cardPreviewVariantByProduct[product.id] === variant.id
                                        ? "border-[#0a2472] ring-2 ring-[#0a2472]/20"
                                        : "border-slate-300"
                                    }`}
                                    style={{ backgroundColor: variant.colorHex || "#cbd5e1" }}
                                    onMouseEnter={() =>
                                      setCardPreviewVariantByProduct((current) => ({
                                        ...current,
                                        [product.id]: variant.id,
                                      }))
                                    }
                                    onFocus={() =>
                                      setCardPreviewVariantByProduct((current) => ({
                                        ...current,
                                        [product.id]: variant.id,
                                      }))
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setCardPreviewVariantByProduct((current) => ({
                                        ...current,
                                        [product.id]: current[product.id] === variant.id ? "" : variant.id,
                                      }))
                                    }}
                                  />
                                ))}
                              </div>
                            ) : null}
                            </div>

                            <div className="flex items-center justify-between rounded-2xl bg-[#0a2472]/5 px-2.5 py-2">
                              <div>
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">Precio</p>
                                {product.variants.length > 0 ? (
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    {hasVariantPricingRange(product) ? "Desde" : "Variante"}
                                  </p>
                                ) : null}
                                <p className="text-sm font-bold text-[#0a2472] sm:text-base">
                                  {product.salePrice > 0 ? formatCurrency(product.salePrice) : "Consultar"}
                                </p>
                              </div>
                              <div className="rounded-xl bg-[#d4a017]/15 p-1.5 text-[#a17708]">
                                <Tag className="h-3.5 w-3.5" />
                              </div>
                            </div>

                            <button
                              onClick={() => openProductDetail(product)}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,#0a2472_0%,#12389b_100%)] px-2.5 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#d4a017] hover:text-[#08162f] sm:text-xs"
                            >
                              Ver producto
                              <ShoppingBag className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-600">
            {featuredOnly
              ? "No hay productos activos para mostrar en destacados."
              : "No hay productos activos para mostrar en esta categoria."}
          </div>
        )}

        <div className="mt-16 text-center">
          <div className="inline-flex flex-col items-center gap-4 rounded-3xl bg-[linear-gradient(135deg,#08162f_0%,#0a2472_58%,#12389b_100%)] p-8 shadow-[0_24px_60px_rgba(10,36,114,0.22)] sm:flex-row">
            <div className="text-left">
              <p className="font-mono text-xl font-bold text-white">
                {featuredOnly ? "¿Quieres ver todo el catalogo?" : "¿Quieres ayuda para escoger?"}
              </p>
              <p className="mt-1 text-sm text-white/70">
                {featuredOnly
                  ? "Entra a la tienda virtual para ver todas las categorias o escribenos por WhatsApp."
                  : "Escribenos por WhatsApp y te orientamos segun el producto que necesitas."}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {featuredOnly ? (
                <a
                  href="/tienda-virtual"
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#d4a017] px-6 py-3 text-sm font-bold text-[#0a1628] transition-colors hover:bg-[#d4a017]/90"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Ir a tienda virtual
                </a>
              ) : null}
              <a
                href={`https://wa.me/${whatsappNumber}?text=Hola%2C%20quiero%20informacion%20sobre%20sus%20productos%20de%20billar.`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#d4a017] px-6 py-3 text-sm font-bold text-[#0a1628] transition-colors hover:bg-[#d4a017]/90"
              >
                <MessageCircle className="h-4 w-4" />
                Contactar por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(selectedProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProductId(null)
            setSelectedVariantId("")
            clearProductUrl()
          }
        }}
      >
        {selectedProduct ? (
          <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden rounded-3xl px-0 py-0 sm:w-[calc(100vw-2rem)]">
            <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6">
              <DialogTitle className="text-2xl font-semibold text-slate-950">{selectedProduct.name}</DialogTitle>
              <DialogDescription>
                Revisa la informacion del producto y contacta al negocio para confirmar disponibilidad.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 lg:space-y-5">
              <div className="relative min-h-[260px] overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 sm:min-h-[320px] lg:min-h-[340px] xl:min-h-[360px]">
                <Image
                  src={selectedProductImage}
                  alt={selectedVariant ? `${selectedProduct.name} ${selectedVariant.name}` : selectedProduct.name}
                  fill
                  className="object-contain"
                  unoptimized={selectedProductImage.startsWith("data:")}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Producto</p>
                      <h3 className="mt-2 font-mono text-2xl font-bold text-slate-950">{selectedProduct.name}</h3>
                    </div>
                    <div className="rounded-2xl bg-[#0a2472]/5 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {selectedProduct.variants.length > 0 ? "Precio de la variante" : "Precio sugerido"}
                      </p>
                      <p className="mt-1 text-2xl font-bold text-[#0a2472]">
                        {(selectedVariant?.salePrice ?? selectedProduct.salePrice) > 0
                          ? formatCurrency(selectedVariant?.salePrice ?? selectedProduct.salePrice)
                          : "Consultar"}
                      </p>
                      {selectedProduct.variants.length > 0 && hasVariantPricingRange(selectedProduct) ? (
                        <p className="mt-1 text-xs text-slate-500">El listado muestra un precio desde; aqui ves el valor de la variante elegida.</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Descripcion</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{selectedProduct.description}</p>
                  </div>

                  {selectedProduct.variants.length > 0 ? (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">{selectedProduct.variantLabel || "Variantes"}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedProduct.variants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => {
                              if (variant.stock <= 0) return
                              setSelectedVariantId(variant.id)
                              updateProductUrl(selectedProduct.id, variant.id, "replace")
                            }}
                            disabled={variant.stock <= 0}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                              (selectedVariant?.id ?? selectedProduct.variants[0]?.id) === variant.id
                                ? "border-[#0a2472] bg-[#0a2472] text-white"
                                : variant.stock <= 0
                                  ? "border-slate-200 bg-slate-100 text-slate-400"
                                  : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <span>{variant.name}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                              {variant.stock > 0 ? "Disponible" : "Agotada"}
                            </span>
                            {variant.colorHex ? (
                              <span
                                className="h-4 w-4 rounded-full border border-white/40"
                                style={{ backgroundColor: variant.colorHex }}
                              />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Marca</p>
                      <p className="mt-1 font-medium text-slate-900">{selectedProduct.brand || "Por confirmar"}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Categoria</p>
                      <p className="mt-1 font-medium text-slate-900">{selectedCategoryLabel}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Disponibilidad</p>
                    <p className={`mt-1 font-medium ${selectedVariantIsAvailable ? "text-emerald-700" : "text-rose-600"}`}>
                      {selectedProduct.variants.length > 0
                        ? selectedVariantIsAvailable
                          ? `${selectedVariant?.stock ?? 0} disponibles en ${selectedVariant?.name ?? "la variante"}`
                          : `${selectedVariant?.name ?? "Esta variante"} esta agotada`
                        : selectedProduct.publicStock > 0
                          ? "Disponible"
                          : "Agotado"}
                    </p>
                  </div>

                  {selectedProduct.subcategory ? (
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Subcategoria</p>
                      <p className="mt-1 font-medium text-slate-900">{selectedProduct.subcategory}</p>
                    </div>
                  ) : null}

                  {selectedProduct.details.length > 0 ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Detalle rapido</p>
                      <div className="mt-3 space-y-2">
                        {selectedProduct.details.map((detail) => (
                          <div key={detail} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            {detail}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <a
                    href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-semibold text-white transition-colors ${
                      selectedVariantIsAvailable ? "bg-[#1a5632] hover:bg-[#1a5632]/90" : "bg-slate-400 pointer-events-none"
                    }`}
                  >
                    <MessageCircle className="h-5 w-5" />
                    {selectedVariantIsAvailable ? "Contactar por WhatsApp" : "Variante agotada"}
                  </a>
                </div>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  )
}

