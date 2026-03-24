"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { collection, onSnapshot, query as firestoreQuery, type DocumentData, where } from "firebase/firestore"
import { MessageCircle, Search, ShoppingBag, Tag } from "lucide-react"
import {
  extractCatalogImageOverrides,
  resolveCatalogImageOverride,
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
}

const defaultImage = "/images/logo.png"
const whatsappNumber = "573006775284"
const categoryLabels = new Map(publicCatalogCategories.map((category) => [category.id, category.label]))
const categoryOrder = new Map(publicCatalogCategories.map((category, index) => [category.id, index]))

function mapCatalogProduct(documentId: string, data: DocumentData): CatalogProduct {
  const fallbackProduct = publicCatalogProducts.find((product) => product.id === documentId)

  return {
    id: documentId,
    name: String(data.name ?? fallbackProduct?.name ?? "Producto"),
    description: String(data.description ?? fallbackProduct?.description ?? "Producto disponible para consulta."),
    image: String(data.image ?? fallbackProduct?.image ?? defaultImage),
    category: String(data.category ?? fallbackProduct?.category ?? "accesorios"),
    subcategory: String(data.subcategory ?? ""),
    brand: String(data.brand ?? ""),
    salePrice: Number(data.salePrice ?? 0),
    featured: Boolean(data.featured ?? false),
    publicStock: Number(data.publicStock ?? 0),
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
  }
}

export default function ProductCatalog({
  featuredOnly = false,
  sectionId = "productos",
}: {
  featuredOnly?: boolean
  sectionId?: string
}) {
  const [activeCategory, setActiveCategory] = useState("todos")
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [imageOverrides, setImageOverrides] = useState<CatalogImageOverrideMaps>({
    byProductId: {},
    byProductName: {},
  })
  const [query, setQuery] = useState("")
  const [previewSides, setPreviewSides] = useState<Record<string, "left" | "right">>({})
  const productCardRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const unsubscribeProducts = onSnapshot(
      firestoreQuery(
        collection(db, "products"),
        where("status", "==", "active"),
        where("publicStock", ">", 0)
      ),
      (snapshot) => {
        const items = snapshot.docs
          .map((snapshotItem) => mapCatalogProduct(snapshotItem.id, snapshotItem.data()))
          .sort((left, right) => left.name.localeCompare(right.name))

        setProducts(items)
      },
      (error) => {
        console.error("Error leyendo productos del catalogo:", error)
        setProducts([])
      }
    )

    const unsubscribeImages = onSnapshot(
      collection(db, "siteAssets"),
      (snapshot) => {
        setImageOverrides(extractCatalogImageOverrides(snapshot))
      },
      (error) => {
        console.error("Error leyendo imagenes del catalogo:", error)
        setImageOverrides({ byProductId: {}, byProductName: {} })
      }
    )

    return () => {
      unsubscribeProducts()
      unsubscribeImages()
    }
  }, [])

  const catalogProducts = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        image: resolveCatalogImageOverride(product.id, product.name, product.image || defaultImage, imageOverrides),
      })),
    [imageOverrides, products]
  )
  const availableCatalogProducts = useMemo(
    () => catalogProducts.filter((product) => product.publicStock > 0),
    [catalogProducts]
  )

  const dynamicCategories = useMemo(() => {
    const categories = Array.from(new Set(availableCatalogProducts.map((product) => product.category).filter(Boolean)))

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
  }, [availableCatalogProducts])

  const filteredProducts = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase()

      return availableCatalogProducts.filter((product) => {
        const matchesCategory = activeCategory === "todos" || product.category === activeCategory
        const matchesQuery =
          normalizedQuery.length === 0 ||
          `${product.name} ${product.brand} ${product.category} ${product.subcategory} ${product.description}`
            .toLowerCase()
            .includes(normalizedQuery)

        return matchesCategory && matchesQuery
      })
    },
    [activeCategory, availableCatalogProducts, query]
  )

  const visibleProducts = useMemo(() => {
    if (!featuredOnly) return filteredProducts

    const featuredProducts = availableCatalogProducts.filter((product) => product.featured)
    return (featuredProducts.length > 0 ? featuredProducts : availableCatalogProducts).slice(0, 5)
  }, [availableCatalogProducts, featuredOnly, filteredProducts])
  const groupedProducts = useMemo(() => {
    const sourceProducts = featuredOnly ? visibleProducts : filteredProducts
    const grouped = new Map<string, CatalogProduct[]>()

    sourceProducts.forEach((product) => {
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
  }, [featuredOnly, filteredProducts, visibleProducts])

  const selectedProduct = availableCatalogProducts.find((product) => product.id === selectedProductId) ?? null
  const selectedCategoryLabel =
    selectedProduct ? categoryLabels.get(selectedProduct.category) ?? selectedProduct.category : ""
  const whatsappMessage = selectedProduct
    ? `Hola, me interesa el producto ${selectedProduct.name} por ${formatCurrency(selectedProduct.salePrice)}. Quiero mas informacion.`
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

  return (
    <section id={sectionId} className="bg-background py-24">
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
                  className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
                    activeCategory === category.id
                      ? "bg-[#0a2472] text-white shadow-lg shadow-[#0a2472]/25"
                      : "border border-border bg-card text-foreground hover:border-[#0a2472]/30 hover:bg-muted"
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {groupedProducts.length > 0 ? (
          <div className="space-y-10">
            {groupedProducts.map((group) => (
              <div key={group.category} className="space-y-4">
                {!featuredOnly ? (
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4a017]">Categoria</p>
                      <h3 className="font-mono text-xl font-bold text-foreground">{group.label}</h3>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {group.items.length} productos
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {group.items.map((product) => {
                    const previewSide = previewSides[product.id] ?? "right"

                    return (
                    <article
                      key={product.id}
                      ref={(element) => {
                        productCardRefs.current[product.id] = element
                      }}
                      onMouseEnter={() => setPreviewSideFromViewport(product.id)}
                      className="group relative overflow-visible rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:z-20 hover:-translate-y-1 hover:shadow-xl"
                    >
                      <div className="relative h-28 overflow-hidden bg-gradient-to-br from-white via-slate-50 to-slate-100 sm:h-32">
                        <Image
                          src={product.image || defaultImage}
                          alt={product.name}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-110"
                          unoptimized={product.image.startsWith("data:")}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/70 via-transparent to-transparent" />
                        <div className="absolute left-2.5 top-2.5 z-10 inline-flex items-center rounded-full bg-[#0a2472] px-2 py-1 text-[10px] font-semibold text-white">
                          {product.tag}
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
                            src={product.image || defaultImage}
                            alt={`${product.name} vista ampliada`}
                            fill
                            className="object-contain p-3"
                            unoptimized={product.image.startsWith("data:")}
                          />
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
                          <p className="hidden line-clamp-2 text-xs leading-5 text-muted-foreground sm:block">
                            {product.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between rounded-2xl bg-[#0a2472]/5 px-2.5 py-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-500">Precio</p>
                            <p className="text-sm font-bold text-[#0a2472] sm:text-base">
                              {product.salePrice > 0 ? formatCurrency(product.salePrice) : "Consultar"}
                            </p>
                          </div>
                          <div className="rounded-xl bg-[#d4a017]/15 p-1.5 text-[#a17708]">
                            <Tag className="h-3.5 w-3.5" />
                          </div>
                        </div>

                        <button
                          onClick={() => setSelectedProductId(product.id)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0a2472] px-2.5 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#d4a017] hover:text-[#0a1628] sm:text-xs"
                        >
                          Ver producto
                          <ShoppingBag className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </article>
                  )})}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-600">
            {featuredOnly
              ? "No hay productos activos para mostrar en destacados."
              : "No hay productos activos para mostrar en esta categoria."}
          </div>
        )}

        <div className="mt-16 text-center">
          <div className="inline-flex flex-col items-center gap-4 rounded-2xl bg-[#0a2472] p-8 shadow-xl sm:flex-row">
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

      <Dialog open={Boolean(selectedProduct)} onOpenChange={(open) => !open && setSelectedProductId(null)}>
        {selectedProduct ? (
          <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto rounded-3xl px-4 sm:w-[calc(100vw-2rem)] sm:px-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold text-slate-950">{selectedProduct.name}</DialogTitle>
              <DialogDescription>
                Revisa la informacion del producto y contacta al negocio para confirmar disponibilidad.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="relative min-h-[360px] overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 sm:min-h-[460px]">
                <Image
                  src={selectedProduct.image || defaultImage}
                  alt={selectedProduct.name}
                  fill
                  className="object-cover"
                  unoptimized={selectedProduct.image.startsWith("data:")}
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
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Precio sugerido</p>
                      <p className="mt-1 text-2xl font-bold text-[#0a2472]">
                        {selectedProduct.salePrice > 0 ? formatCurrency(selectedProduct.salePrice) : "Consultar"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Descripcion</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{selectedProduct.description}</p>
                  </div>
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
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1a5632] px-5 py-4 text-base font-semibold text-white transition-colors hover:bg-[#1a5632]/90"
                  >
                    <MessageCircle className="h-5 w-5" />
                    Contactar por WhatsApp
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
