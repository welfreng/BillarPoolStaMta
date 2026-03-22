"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { Wrench, RefreshCw, Layers, CircleDot } from "lucide-react"
import { db } from "@/lib/firebase"

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
  const [serviceImages, setServiceImages] = useState<string[]>([])

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "siteAssets", "services-gallery"),
      (snapshot) => {
        const data = snapshot.data()
        const images = Array.isArray(data?.images)
          ? data.images.filter((item): item is string => typeof item === "string").slice(0, 3)
          : []

        setServiceImages(images)
      },
      (error) => {
        console.error("Error leyendo galeria de servicios:", error)
        setServiceImages([])
      }
    )

    return () => unsubscribe()
  }, [])

  return (
    <section id="servicios" className="relative overflow-hidden bg-[#0a1628] py-24">
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
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[#d4a017]">
              Servicios Especializados
            </p>
            <h2 className="font-mono text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl lg:text-5xl">
              Taller de Reparacion y Mantenimiento
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-white/60 text-pretty">
              Contamos con equipos especializados incluyendo un torno semiprofesional para realizar trabajos de precision en tus tacos y mesas de billar.
            </p>

            <div className="mt-10 space-y-6">
              {services.map((service, i) => (
                <div key={i} className="group flex gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#0a2472] transition-colors group-hover:bg-[#d4a017]">
                    <service.icon className="h-6 w-6 text-white transition-colors group-hover:text-[#0a1628]" />
                  </div>
                  <div>
                    <h3 className="font-mono text-lg font-bold text-white">{service.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/50">{service.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href="https://wa.me/573006775284?text=Hola%2C%20me%20interesa%20el%20servicio%20de%20reparacion"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex items-center gap-2 rounded-lg bg-[#d4a017] px-8 py-4 text-base font-bold text-[#0a1628] shadow-lg shadow-[#d4a017]/25 transition-all hover:scale-105 hover:bg-[#d4a017]/90"
            >
              Solicitar Servicio
            </a>
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl">
              <Image
                src="/images/torno-reparacion.jpg"
                alt="Taller de reparacion de tacos de billar con torno semiprofesional"
                width={600}
                height={700}
                className="h-[500px] w-full object-cover lg:h-[600px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/60 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
                  <p className="text-sm font-bold text-white">Torno Semiprofesional</p>
                  <p className="mt-1 text-xs text-white/60">Precision y calidad en cada trabajo de reparacion</p>
                </div>
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#d4a017]/20 blur-2xl" />
            <div className="absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-[#0a2472]/30 blur-2xl" />

            {serviceImages.length > 0 ? (
              <div className="mt-5 grid grid-cols-3 gap-3">
                {serviceImages.map((image, index) => (
                  <div key={`${image}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg">
                    <div className="relative aspect-[4/5] w-full">
                      <Image
                        src={image}
                        alt={`Trabajo realizado ${index + 1}`}
                        fill
                        className="object-cover"
                        unoptimized={image.startsWith("data:")}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
