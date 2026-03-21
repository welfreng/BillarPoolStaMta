import Image from "next/image"
import { Phone, MapPin, Clock } from "lucide-react"

export default function Footer() {
  return (
    <footer id="contacto" className="bg-[#0a1628] text-white">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 py-16 border-b border-white/10">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/images/logo.png"
                alt="Billar Pool Santa Marta"
                width={45}
                height={45}
                className="rounded-full"
              />
              <div>
                <p className="text-lg font-bold font-mono text-white">Billar Pool</p>
                <p className="text-xs text-[#d4a017] tracking-widest uppercase">Santa Marta</p>
              </div>
            </div>
            <p className="text-sm text-white/50 leading-relaxed">
              Tienda de Accesorios para Billar. Mas de 12 anos al servicio de jugadores y negocios en Santa Marta y la costa caribe colombiana.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#d4a017] mb-4">
              Enlaces Rapidos
            </h4>
            <ul className="space-y-2">
              {[
                { label: "Inicio", href: "#inicio" },
                { label: "Productos", href: "#productos" },
                { label: "Servicios", href: "#servicios" },
                { label: "Nosotros", href: "#nosotros" },
                { label: "Resenas", href: "#resenas" },
                { label: "Ubicacion", href: "#ubicacion" },
              ].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-white/50 hover:text-[#d4a017] transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#d4a017] mb-4">
              Productos
            </h4>
            <ul className="space-y-2">
              {[
                "Tacos de Madera",
                "Tacos de Fibra de Carbono",
                "Panos para Mesas",
                "Tizas por Docena",
                "Guantes por Docena",
                "Estuches",
                "Bolas y Triangulos",
                "Virolas y Casquillos",
              ].map((product) => (
                <li key={product}>
                  <a
                    href="#productos"
                    className="text-sm text-white/50 hover:text-[#d4a017] transition-colors"
                  >
                    {product}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#d4a017] mb-4">
              Contacto
            </h4>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-[#d4a017] mt-0.5 flex-shrink-0" />
                <div>
                  <a href="tel:+573006775284" className="text-sm text-white/50 hover:text-[#d4a017] transition-colors">
                    +57 300 677 5284
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-[#d4a017] mt-0.5 flex-shrink-0" />
                <p className="text-sm text-white/50">Santa Marta, Magdalena, Colombia</p>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-[#d4a017] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-white/50">Lun - Sab: 8:00 AM - 7:00 PM</p>
                  <p className="text-sm text-white/50">Dom: 9:00 AM - 2:00 PM</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between py-6 gap-4">
          <p className="text-xs text-white/30">
            {`\u00A9 ${new Date().getFullYear()} Billar Pool Santa Marta. Todos los derechos reservados.`}
          </p>
          <p className="text-xs text-white/30">
            Tienda de Accesorios para Billar
          </p>
        </div>
      </div>
    </footer>
  )
}
