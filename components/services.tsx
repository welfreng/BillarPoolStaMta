import Image from "next/image"
import { Wrench, RefreshCw, Layers, CircleDot } from "lucide-react"

const services = [
  {
    icon: Wrench,
    title: "Cambio de Virolas y Casquillos",
    description:
      "Contamos con un torno semiprofesional donde realizamos cambios de casquillos y virolas a tacos averiados. Trabajo de precision con acabado perfecto.",
  },
  {
    icon: RefreshCw,
    title: "Cambio de Panos",
    description:
      "Servicio profesional de cambio e instalacion de panos para mesas de billar. Trabajamos con telas de alta calidad en diferentes colores.",
  },
  {
    icon: Layers,
    title: "Mantenimiento de Mesas",
    description:
      "Mantenimiento integral para mesas de billar. Nivelacion, limpieza profunda y ajuste de bandas para un juego impecable.",
  },
  {
    icon: CircleDot,
    title: "Reparacion de Tacos",
    description:
      "Reparamos y restauramos tacos de billar. Cambio de puntas, enderezamiento y restauracion de acabados para que tu taco quede como nuevo.",
  },
]

export default function Services() {
  return (
    <section id="servicios" className="py-24 bg-[#0a1628] relative overflow-hidden">
      {/* Subtle pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left content */}
          <div>
            <p className="text-sm font-semibold tracking-widest uppercase text-[#d4a017] mb-2">
              Servicios Especializados
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-mono text-white tracking-tight text-balance">
              Taller de Reparacion y Mantenimiento
            </h2>
            <p className="mt-4 text-lg text-white/60 leading-relaxed text-pretty">
              Contamos con equipos especializados incluyendo un torno semiprofesional para realizar trabajos de precision en tus tacos y mesas de billar.
            </p>

            <div className="mt-10 space-y-6">
              {services.map((service, i) => (
                <div key={i} className="flex gap-4 group">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0a2472] group-hover:bg-[#d4a017] transition-colors flex-shrink-0">
                    <service.icon className="h-6 w-6 text-white group-hover:text-[#0a1628] transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white font-mono">{service.title}</h3>
                    <p className="mt-1 text-sm text-white/50 leading-relaxed">{service.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href="https://wa.me/573006775284?text=Hola%2C%20me%20interesa%20el%20servicio%20de%20reparacion"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex items-center gap-2 rounded-lg bg-[#d4a017] px-8 py-4 text-base font-bold text-[#0a1628] hover:bg-[#d4a017]/90 transition-all hover:scale-105 shadow-lg shadow-[#d4a017]/25"
            >
              Solicitar Servicio
            </a>
          </div>

          {/* Right image */}
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src="/images/torno-reparacion.jpg"
                alt="Taller de reparacion de tacos de billar con torno semiprofesional"
                width={600}
                height={700}
                className="object-cover w-full h-[500px] lg:h-[600px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/60 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <div className="rounded-xl bg-white/10 backdrop-blur-md p-4 border border-white/20">
                  <p className="text-sm font-bold text-white">Torno Semiprofesional</p>
                  <p className="text-xs text-white/60 mt-1">Precision y calidad en cada trabajo de reparacion</p>
                </div>
              </div>
            </div>
            {/* Decorative accent */}
            <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-[#d4a017]/20 blur-2xl" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-[#0a2472]/30 blur-2xl" />
          </div>
        </div>
      </div>
    </section>
  )
}
