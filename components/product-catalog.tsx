"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronRight, ShoppingBag } from "lucide-react"

const categories = [
  { id: "todos", label: "Todos" },
  { id: "tacos", label: "Tacos" },
  { id: "panos", label: "Panos" },
  { id: "accesorios", label: "Accesorios" },
  { id: "repuestos", label: "Repuestos" },
  { id: "bolas", label: "Bolas y Triangulos" },
]

const products = [
  {
    id: 1,
    name: "Tacos de Madera Premium",
    description: "Tacos profesionales de madera maple y palo de rosa. Disponibles en diferentes pesos y medidas.",
    image: "/images/tacos-madera.jpg",
    category: "tacos",
    tag: "Popular",
    details: ["Madera Maple importada", "Pesos de 18oz a 21oz", "Punta de cuero profesional", "Diferentes acabados"],
  },
  {
    id: 2,
    name: "Tacos de Fibra de Carbono",
    description: "Tacos de ultima tecnologia en fibra de carbono. Mayor precision y durabilidad para jugadores exigentes.",
    image: "/images/tacos-carbono.jpg",
    category: "tacos",
    tag: "Nuevo",
    details: ["Fibra de carbono de alta resistencia", "Menor deflexion", "Tecnologia Low Deflection", "Ideal para jugadores avanzados"],
  },
  {
    id: 3,
    name: "Panos para Mesa de Billar",
    description: "Panos de alta calidad para mesas de billar. Disponibles en verde, azul y rojo. Venta e instalacion.",
    image: "/images/panos-billar.jpg",
    category: "panos",
    tag: "Servicio",
    details: ["Lana premium importada", "Colores: verde, azul, rojo", "Servicio de instalacion incluido", "Para mesas de 7, 8 y 9 pies"],
  },
  {
    id: 4,
    name: "Tizas por Docena",
    description: "Tizas de billar de primera calidad. Venta por docena ideal para negocios y salas de billar.",
    image: "/images/tizas-billar.jpg",
    category: "accesorios",
    tag: "Al por mayor",
    details: ["Marca reconocida", "Venta por docena", "Precio especial para negocios", "Agarre superior"],
  },
  {
    id: 5,
    name: "Guantes por Docena",
    description: "Guantes profesionales de 3 dedos. Venta por docena con precios especiales para negocios.",
    image: "/images/guantes-billar.jpg",
    category: "accesorios",
    tag: "Al por mayor",
    details: ["Guantes de 3 dedos", "Licra elastica premium", "Venta por docena", "Tallas variadas"],
  },
  {
    id: 6,
    name: "Estuches para Tacos",
    description: "Estuches de cuero y sinteticos para proteger tu taco. Diferentes capacidades y estilos.",
    image: "/images/estuches-billar.jpg",
    category: "accesorios",
    tag: "Premium",
    details: ["Cuero genuino y sintetico", "Capacidad 1 a 4 tacos", "Proteccion acolchada", "Cierre de seguridad"],
  },
  {
    id: 7,
    name: "Juegos de Bolas y Triangulos",
    description: "Sets completos de bolas de billar profesionales y triangulos de madera o plastico.",
    image: "/images/bolas-billar.jpg",
    category: "bolas",
    tag: "Completo",
    details: ["Bolas de resina premium", "Tamano reglamentario", "Triangulos de madera o plastico", "Diferentes marcas disponibles"],
  },
  {
    id: 8,
    name: "Virolas y Casquillos",
    description: "Virolas de fibra y casquillos de bronce para tacos. Diferentes medidas disponibles. Servicio de instalacion en torno.",
    image: "/images/virolas-casquillos.jpg",
    category: "repuestos",
    tag: "Especializado",
    details: ["Virolas de fibra premium", "Casquillos de bronce", "Medidas de 11mm a 13mm", "Instalacion con torno incluida"],
  },
  {
    id: 9,
    name: "Accesorios Varios",
    description: "Todo lo que necesitas: portatacos, limpiadores, puentes, extensiones y mucho mas para tu negocio de billar.",
    image: "/images/accesorios-billar.jpg",
    category: "accesorios",
    tag: "Variado",
    details: ["Portatacos de pared", "Limpiadores y ceras", "Puentes y extensiones", "Marcadores de puntuacion"],
  },
]

export default function ProductCatalog() {
  const [activeCategory, setActiveCategory] = useState("todos")
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null)

  const filteredProducts =
    activeCategory === "todos"
      ? products
      : products.filter((p) => p.category === activeCategory)

  return (
    <section id="productos" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        {/* Section header */}
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

        {/* Category filters */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {categories.map((cat) => (
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

        {/* Product grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="group relative rounded-2xl bg-card border border-border overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              {/* Product tag */}
              <div className="absolute top-4 left-4 z-10">
                <span className="inline-flex items-center rounded-full bg-[#0a2472] px-3 py-1 text-xs font-semibold text-white">
                  {product.tag}
                </span>
              </div>

              {/* Product image */}
              <div className="relative h-56 overflow-hidden">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/60 via-transparent to-transparent" />
              </div>

              {/* Product info */}
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

        {/* CTA */}
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
