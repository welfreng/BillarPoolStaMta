import Image from "next/image"
import { ShieldCheck, Trophy, Clock } from "lucide-react"

export default function Hero() {
  return (
    <section id="inicio" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/images/hero-billar.jpg"
          alt="Mesa de billar profesional"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1628]/90 via-[#0a2472]/70 to-[#0a1628]/95" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-32 lg:px-8 w-full">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/images/logo.png"
            alt="Billar Pool Santa Marta Logo"
            width={180}
            height={180}
            className="mb-8 drop-shadow-2xl"
            priority
          />
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold font-mono text-white tracking-tight text-balance">
            Billar Pool
            <span className="block text-[#d4a017]">Santa Marta</span>
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-white/80 max-w-2xl leading-relaxed text-pretty">
            Tienda de Accesorios para Billar. Todo lo que necesitas para tu negocio y tu juego profesional.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <a
              href="#productos"
              className="inline-flex items-center justify-center rounded-lg bg-[#d4a017] px-8 py-4 text-base font-bold text-[#0a1628] hover:bg-[#d4a017]/90 transition-all hover:scale-105 shadow-lg shadow-[#d4a017]/25"
            >
              Ver Catalogo
            </a>
            <a
              href="https://wa.me/573006775284?text=Hola%2C%20me%20interesa%20conocer%20sus%20productos"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border-2 border-white/30 bg-white/10 backdrop-blur-sm px-8 py-4 text-base font-bold text-white hover:bg-white/20 transition-all hover:scale-105"
            >
              Contactar por WhatsApp
            </a>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
            <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#d4a017]/20">
                <Clock className="h-6 w-6 text-[#d4a017]" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-white">+12</p>
                <p className="text-sm text-white/60">Anos de experiencia</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1a5632]/30">
                <Trophy className="h-6 w-6 text-[#4ade80]" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-white">+500</p>
                <p className="text-sm text-white/60">Clientes satisfechos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#0a2472]/40">
                <ShieldCheck className="h-6 w-6 text-[#60a5fa]" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-white">100%</p>
                <p className="text-sm text-white/60">Calidad garantizada</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
