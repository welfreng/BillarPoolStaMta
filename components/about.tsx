import { Target, Eye } from "lucide-react"

export default function About() {
  return (
    <section id="nosotros" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="text-sm font-semibold tracking-widest uppercase text-[#d4a017] mb-2">
            Sobre Nosotros
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-foreground tracking-tight text-balance">
            Mas de 12 Anos al Servicio
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto text-pretty">
            Billar Pool Santa Marta es la tienda de referencia en la region para todo lo relacionado con el mundo del billar. Con mas de una decada de experiencia, nos hemos consolidado como el proveedor de confianza para salas de billar, jugadores profesionales y aficionados.
          </p>
        </div>

        {/* Mission & Vision */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Mission */}
          <div className="rounded-2xl bg-card border border-border p-8 relative overflow-hidden group hover:border-[#0a2472]/30 transition-colors">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#0a2472]" />
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#0a2472]">
                <Target className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold font-mono text-foreground">Mision</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed text-pretty">
              Proveer a nuestros clientes los mejores accesorios, repuestos y servicios para el mundo del billar, garantizando calidad premium, precios justos y atencion personalizada. Nos comprometemos a ser el aliado estrategico de salas de billar y jugadores, ofreciendo productos que eleven la experiencia del juego y contribuyan al crecimiento del deporte en la region.
            </p>
          </div>

          {/* Vision */}
          <div className="rounded-2xl bg-card border border-border p-8 relative overflow-hidden group hover:border-[#1a5632]/30 transition-colors">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#1a5632]" />
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#1a5632]">
                <Eye className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold font-mono text-foreground">Vision</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed text-pretty">
              Ser la tienda lider y referente en la costa caribe colombiana en la venta de accesorios, equipos y servicios especializados para billar. Aspiramos a expandir nuestro alcance a nivel nacional, siendo reconocidos por la excelencia de nuestros productos, la innovacion en nuestros servicios de reparacion y el compromiso con la satisfaccion total de cada cliente.
            </p>
          </div>
        </div>

        {/* Values strip */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {[
            { value: "Calidad", desc: "Productos premium" },
            { value: "Confianza", desc: "12+ anos de trayectoria" },
            { value: "Servicio", desc: "Atencion personalizada" },
            { value: "Experiencia", desc: "Conocimiento experto" },
          ].map((item, i) => (
            <div
              key={i}
              className="text-center rounded-xl bg-muted p-6 hover:bg-[#0a2472] hover:text-white group transition-colors"
            >
              <p className="text-xl font-bold font-mono group-hover:text-[#d4a017] transition-colors">{item.value}</p>
              <p className="text-sm text-muted-foreground group-hover:text-white/60 mt-1 transition-colors">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
