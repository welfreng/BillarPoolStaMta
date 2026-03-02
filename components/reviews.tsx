"use client"

import { useState } from "react"
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react"

const reviews = [
  {
    name: "Carlos M.",
    role: "Dueno de Sala de Billar",
    rating: 5,
    text: "Excelente servicio. Llevo mas de 5 anos comprando tizas y guantes por docena para mi negocio. Los precios son muy competitivos y la calidad de los productos es superior. Recomendado al 100%.",
    date: "Enero 2026",
  },
  {
    name: "Roberto S.",
    role: "Jugador Profesional",
    rating: 5,
    text: "Compre mi taco de fibra de carbono aqui y fue la mejor inversion. El servicio de cambio de virola en el torno quedo perfecto, un trabajo de primera. Muy profesionales.",
    date: "Diciembre 2025",
  },
  {
    name: "Maria L.",
    role: "Administradora de Billar",
    rating: 5,
    text: "El cambio de pano para nuestras 4 mesas quedo espectacular. Servicio rapido, limpio y a buen precio. Nos cambiaron todos los panos en un solo dia. Muy recomendados.",
    date: "Noviembre 2025",
  },
  {
    name: "Andres P.",
    role: "Jugador Amateur",
    rating: 4,
    text: "Compre un estuche de cuero y un set de bolas. La calidad es muy buena y los precios son justos. El senor que atiende es muy amable y te asesora en todo lo que necesites.",
    date: "Octubre 2025",
  },
  {
    name: "Luis F.",
    role: "Dueno de Sala de Billar",
    rating: 5,
    text: "Proveedor de confianza desde hace 8 anos. Siempre tienen stock de todo lo que necesito para mi negocio. Las tizas y guantes por docena son un excelente negocio. 100% recomendado.",
    date: "Septiembre 2025",
  },
  {
    name: "Diana R.",
    role: "Jugadora Competitiva",
    rating: 5,
    text: "Me repararon el casquillo de mi taco favorito que pense estaba perdido. El trabajo en el torno quedo impecable. Ademas compre guantes nuevos que son muy comodos. Gracias!",
    date: "Agosto 2025",
  },
]

export default function Reviews() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const reviewsPerPage = 3
  const totalPages = Math.ceil(reviews.length / reviewsPerPage)

  const currentReviews = reviews.slice(
    currentIndex * reviewsPerPage,
    (currentIndex + 1) * reviewsPerPage
  )

  return (
    <section id="resenas" className="py-24 bg-muted/50">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold tracking-widest uppercase text-[#d4a017] mb-2">
            Testimonios
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-foreground tracking-tight text-balance">
            Lo Que Dicen Nuestros Clientes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Resenas reales de clientes que confian en nosotros
          </p>
        </div>

        {/* Reviews grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {currentReviews.map((review, i) => (
            <div
              key={i}
              className="rounded-2xl bg-card border border-border p-6 relative group hover:border-[#0a2472]/30 hover:shadow-lg transition-all"
            >
              <Quote className="h-8 w-8 text-[#0a2472]/10 absolute top-6 right-6" />
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star
                    key={j}
                    className={`h-4 w-4 ${
                      j < review.rating ? "text-[#d4a017] fill-[#d4a017]" : "text-border"
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm text-foreground leading-relaxed mb-6 text-pretty">
                {`"${review.text}"`}
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">{review.name}</p>
                  <p className="text-xs text-muted-foreground">{review.role}</p>
                </div>
                <p className="text-xs text-muted-foreground">{review.date}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-10">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Resenas anteriores"
            >
              <ChevronLeft className="h-5 w-5 text-foreground" />
            </button>
            <div className="flex gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`h-2.5 rounded-full transition-all ${
                    i === currentIndex ? "w-8 bg-[#0a2472]" : "w-2.5 bg-border"
                  }`}
                  aria-label={`Pagina ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => setCurrentIndex((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={currentIndex === totalPages - 1}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Siguientes resenas"
            >
              <ChevronRight className="h-5 w-5 text-foreground" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
