import Image from "next/image"
import { ShieldCheck, Trophy, Clock } from "lucide-react"

export default function Hero() {
  return (
    <section id="inicio" className="relative flex min-h-[84vh] items-center overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/images/hero-billar.png"
          alt="Tienda de accesorios para billar Billar Pool Santa Marta"
          fill
          className="object-cover object-[24%_12%] sm:object-[24%_10%] lg:object-[center_8%]"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,12,28,0.1)_0%,rgba(5,12,28,0.22)_34%,rgba(8,22,47,0.62)_58%,rgba(8,22,47,0.82)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,22,47,0.16)_0%,rgba(8,22,47,0.04)_38%,rgba(8,22,47,0.74)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#08162f] via-[#08162f]/70 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-20 pt-24 lg:px-8">
        <div className="grid min-h-[62vh] items-center lg:grid-cols-[minmax(0,0.92fr)_minmax(0,0.72fr)]">
          <div className="hidden lg:block" aria-hidden="true" />

          <div className="mx-auto flex max-w-2xl flex-col items-center text-center lg:mx-0 lg:items-start lg:text-left">
          <p className="mb-5 rounded-full border border-white/16 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#f5c451] shadow-[0_14px_34px_rgba(2,6,23,0.2)] backdrop-blur-sm">
            Tienda especializada en Santa Marta
          </p>
          <h1 className="font-mono text-4xl font-bold tracking-tight text-white text-balance drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)] sm:text-5xl lg:text-6xl">
            Billar Pool
            <span className="block text-[#d4a017]">Santa Marta</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90 text-pretty drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)] sm:text-xl">
            Tienda de Accesorios para Billar. Todo lo que necesitas para tu negocio y tu juego profesional.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a
              href="#productos"
              className="inline-flex items-center justify-center rounded-lg bg-[#d4a017] px-7 py-3.5 text-base font-bold text-[#08162f] shadow-lg shadow-[#d4a017]/25 transition-all hover:bg-[#f5c451] hover:shadow-xl"
            >
              Ver Catalogo
            </a>
            <a
              href="https://wa.me/573006775284?text=Hola%2C%20me%20interesa%20conocer%20sus%20productos"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-white/24 bg-white/12 px-7 py-3.5 text-base font-bold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              Contactar por WhatsApp
            </a>
          </div>

          <div className="mt-12 grid w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-2xl">
            <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/12 p-3.5 shadow-[0_18px_45px_rgba(2,6,23,0.18)] backdrop-blur-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#d4a017]/20">
                <Clock className="h-6 w-6 text-[#d4a017]" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-white">+12</p>
                <p className="text-sm text-white/64">Anos de experiencia</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/12 p-3.5 shadow-[0_18px_45px_rgba(2,6,23,0.18)] backdrop-blur-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#1a5632]/30">
                <Trophy className="h-6 w-6 text-[#4ade80]" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-white">+500</p>
                <p className="text-sm text-white/64">Clientes satisfechos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/12 p-3.5 shadow-[0_18px_45px_rgba(2,6,23,0.18)] backdrop-blur-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0a2472]/40">
                <ShieldCheck className="h-6 w-6 text-[#60a5fa]" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-white">100%</p>
                <p className="text-sm text-white/64">Calidad garantizada</p>
              </div>
            </div>

          </div>
          </div>
        </div>
      </div>
    </section>
  )
}
