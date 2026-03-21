"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { doc, onSnapshot } from "firebase/firestore"
import { ChevronRight, ShoppingBag } from "lucide-react"
import { db } from "@/lib/firebase"
import { publicCatalogCategories, publicCatalogProducts } from "@/lib/public-catalog"

export default function ProductCatalog() {
  const [activeCategory, setActiveCategory] = useState("todos")
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>({})

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "siteAssets", "catalog-images"),
      (snapshot) => {
        const data = snapshot.data()
        const images =
          data && typeof data === "object" && data.images && typeof data.images === "object"
            ? (data.images as Record<string, string>)
            : {}
        setImageOverrides(images)
      },
      (error) => {
        console.error("Error leyendo imagenes del catalogo:", error)
        setImageOverrides({})
      }
    )

    return () => unsubscribe()
  }, [])

  const products = publicCatalogProducts.map((product) => ({
    ...product,
    image: imageOverrides[product.id] || product.image,
  }))

  const filteredProducts =
    activeCategory === "todos"
      ? products
      : products.filter((p) => p.category === activeCategory)

  return (
    <section id="productos" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold tracking-widest uppercase text-[#d4a017] mb-2">
            Nuestro Catalogo
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-foreground tracking-tight text-balance">
            Productos de Primera Calidad
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Encuentra todo lo que necesitas para tu negocio de billar o para tu juego profesional
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {publicCatalogCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id)
                setSelectedProduct(null)
              }}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeCategory === cat.id
                  ? "bg-[#0a2472] text-white shadow-lg shadow-[#0a2472]/25"
                  : "bg-card text-foreground border border-border hover:bg-muted hover:border-[#0a2472]/30"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="group relative rounded-2xl bg-card border border-border overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="absolute top-4 left-4 z-10">
                <span className="inline-flex items-center rounded-full bg-[#0a2472] px-3 py-1 text-xs font-semibold text-white">
                  {product.tag}
                </span>
              </div>

              <div className="relative h-56 overflow-hidden">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  unoptimized={product.image.startsWith("data:")}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/60 via-transparent to-transparent" />
              </div>

              <div className="p-6">
                <h3 className="text-xl font-bold font-mono text-foreground mb-2">
                  {product.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {product.description}
                </p>

                {selectedProduct === product.id ? (
                  <div className="space-y-3">
                    <ul className="space-y-2">
                      {product.details.map((detail, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                          <ChevronRight className="h-4 w-4 text-[#1a5632] flex-shrink-0" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 pt-2">
                      <a
                        href={`https://wa.me/573006775284?text=Hola%2C%20me%20interesa%20el%20producto%3A%20${encodeURIComponent(product.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#1a5632] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a5632]/90 transition-colors"
                      >
                        <ShoppingBag className="h-4 w-4" />
                        Consultar
                      </a>
                      <button
                        onClick={() => setSelectedProduct(null)}
                        className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedProduct(product.id)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0a2472] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a2472]/90 transition-all group-hover:bg-[#d4a017] group-hover:text-[#0a1628]"
                  >
                    Ver Detalles
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 rounded-2xl bg-[#0a2472] p-8 shadow-xl">
            <div className="text-left">
              <p className="text-xl font-bold text-white font-mono">No encuentras lo que buscas?</p>
              <p className="text-white/70 text-sm mt-1">Consultanos por WhatsApp y te ayudamos a encontrarlo</p>
            </div>
            <a
              href="https://wa.me/573006775284?text=Hola%2C%20estoy%20buscando%20un%20producto%20especifico"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#d4a017] px-6 py-3 text-sm font-bold text-[#0a1628] hover:bg-[#d4a017]/90 transition-colors whitespace-nowrap"
            >
              <ShoppingBag className="h-4 w-4" />
              Escribenos
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
