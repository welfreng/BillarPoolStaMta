"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Phone, MapPin, Clock } from "lucide-react"
import { SITE_LOGO } from "@/lib/branding"

export default function Footer() {
  const pathname = usePathname()
  const isHomePage = pathname === "/"

  const quickLinks = [
    { label: "Inicio", href: isHomePage ? "#inicio" : "/" },
    { label: "Destacados", href: isHomePage ? "#productos" : "/#productos" },
    { label: "Tienda virtual", href: "/tienda-virtual" },
    { label: "Servicios", href: isHomePage ? "#servicios" : "/#servicios" },
    { label: "Ubicacion", href: isHomePage ? "#ubicacion" : "/#ubicacion" },
  ]

  return (
    <footer id="contacto" className="bg-[#0a1628] text-white">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid grid-cols-1 gap-10 border-b border-white/10 py-16 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="mb-4 flex items-center gap-3">
              <Image
                src={SITE_LOGO}
                alt="Billar Pool Santa Marta"
                width={45}
                height={45}
                className="rounded-full"
              />
              <div>
                <p className="font-mono text-lg font-bold text-white">Billar Pool</p>
                <p className="text-xs uppercase tracking-widest text-[#d4a017]">Santa Marta</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-white/50">
              Tienda de accesorios para billar con productos para jugadores, salas y negocios en Santa Marta.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#d4a017]">
              Enlaces rapidos
            </h4>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/50 transition-colors hover:text-[#d4a017]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#d4a017]">
              Lo que encuentras
            </h4>
            <ul className="space-y-2">
              {[
                "Tacos de billar",
                "Guantes",
                "Estuches",
                "Tizas",
                "Panos",
                "Bolas y triangulos",
                "Repuestos",
                "Accesorios varios",
              ].map((product) => (
                <li key={product}>
                  <Link
                    href="/tienda-virtual"
                    className="text-sm text-white/50 transition-colors hover:text-[#d4a017]"
                  >
                    {product}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#d4a017]">
              Contacto
            </h4>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#d4a017]" />
                <div>
                  <a href="tel:+573006775284" className="text-sm text-white/50 transition-colors hover:text-[#d4a017]">
                    +57 300 677 5284
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#d4a017]" />
                <p className="text-sm text-white/50">Santa Marta, Magdalena, Colombia</p>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#d4a017]" />
                <div>
                  <p className="text-sm text-white/50">Lun - Sab: 8:00 AM - 7:00 PM</p>
                  <p className="text-sm text-white/50">Dom: 9:00 AM - 2:00 PM</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p className="text-xs text-white/30">
            {`\u00A9 ${new Date().getFullYear()} Billar Pool Santa Marta. Todos los derechos reservados.`}
          </p>
          <p className="text-xs text-white/30">Tienda de accesorios para billar</p>
        </div>
      </div>
    </footer>
  )
}
